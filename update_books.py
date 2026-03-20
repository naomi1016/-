"""
北圖新書通報 — 每日增量更新腳本

策略：
- 只重新爬取「當月」資料（速度快，約 30–50 分鐘）
- 舊月份資料保留不動
- 只對「新增書目」補充書介，避免重複請求
- 合併後覆蓋 public/books.json

使用方式：
    python3 update_books.py

建議搭配 cron 每日執行：
    0 3 * * * cd /path/to/project && python3 update_books.py >> logs/update.log 2>&1
"""
import json, time, warnings, re, datetime
import requests
from playwright.sync_api import sync_playwright

warnings.filterwarnings("ignore")

TARGET_URL  = "https://book.tpml.edu.tw/newArrivals?serialNo=1"
GQL_URL     = "https://book.tpml.edu.tw/api/HyLibWS/graphql"
OUTPUT_FILE = "public/books.json"
BATCH_SIZE      = 12
DESC_BATCH_SIZE = 200

BRANCH_MAP = {
    "C01": "總館",       "E11": "王貫英分館", "L13": "石牌分館",
    "K12": "天母分館",   "A13": "三民分館",   "H15": "文山分館",
    "J13": "西湖分館",   "D13": "大直分館",   "B14": "廣慈分館",
    "H16": "力行分館",   "I11": "南港分館",   "A12": "民生分館",
    "F13": "建成分館",   "B11": "永春分館",   "G14": "萬華分館",
    "L14": "清江分館",   "K14": "李科永紀念館", "D12": "長安分館",
    "H11": "景美分館",   "J11": "內湖分館",   "J12": "東湖分館",
    "H17": "景新分館",   "I12": "舊莊分館",   "F12": "大同分館",
    "B12": "三興分館",   "F11": "延平分館",   "L11": "北投分館",
    "K11": "葫蘆堵分館", "H12": "木柵分館",   "E12": "城中分館",
    "L12": "稻香分館",   "G13": "西園分館",   "C11": "道藩分館",
    "D11": "中山分館",   "J14": "西中分館",   "A14": "中崙分館",
    "B13": "六合分館",   "L15": "吉利分館",   "H14": "萬興分館",
    "F21": "蘭州分館",   "C22": "成功分館",   "G11": "龍山分館",
    "I21": "龍華分館",   "C23": "龍安分館",   "A15": "啟明分館",
    "H23": "萬芳分館",   "D21": "恒安分館",   "G12": "東園分館",
    "C21": "延吉分館",   "L23": "秀山分館",   "L21": "永明分館",
    "H22": "安康分館",   "C02": "總館參考室",
    "EOB2": "古亭智慧圖書館", "GOB": "太陽圖書館",      "COB": "東區地下街智慧圖書館",
    "KOB2": "社子島智慧圖書館", "KOB": "百齡智慧圖書館", "AOB": "松山機場智慧圖書館",
    "EOB":  "西門智慧圖書館",
    "DFB": "行天宮站借書站", "BFB": "臺北市政府借書站", "EFB2": "小南門站借書站",
    "CFB": "信義安和借書站", "AFB": "松山車站借書站",   "IFB": "南港車站借書站",
    "EFB": "臺北車站借書站", "AFB2": "小巨蛋借書站",   "ABS": "總館借書站",
    "G21": "柳鄉兒童圖書館", "MIC": "多元文化中心",
    "I41": "龍華書閣",       "D41": "大直書閣",       "L41": "秀山書閣",
    "K41": "葫蘆堵書閣",     "I22": "親子美育數位館",
    "NRRC": "北區資源中心",  "H31": "公訓處",
}

# ── 工具函式（與 enrich_books.py 共用邏輯）────────────

def fea_to_type(fea):
    fea = fea.lower()
    if "book" in fea:    return "圖書"
    if "media" in fea:   return "視聽資料"
    if "journal" in fea: return "期刊"
    if fea:              return "其他"
    return ""

def detect_language(isbn):
    first = isbn.split(";")[0].split(",")[0].strip()
    clean = re.sub(r"[^0-9]", "", first)
    if not clean: return ""
    full = clean if len(clean) >= 13 else "978" + clean
    if full.startswith("9780") or full.startswith("9781") or full.startswith("9798"): return "ENG"
    if full.startswith("978957") or full.startswith("978986") or full.startswith("978626"): return "CHI"
    if full.startswith("9787"):  return "CHI"
    if full.startswith("97889") or full.startswith("9791"): return "KOR"
    if full.startswith("9784"):  return "JPN"
    if full.startswith("9782"):  return "FRE"
    if full.startswith("97886"): return "CHI"
    return ""

def refs_to_dict(refs):
    d = {}
    if isinstance(refs, dict): refs = list(refs.values())
    for r in (refs or []):
        if isinstance(r, dict) and r.get("key"):
            d[r["key"]] = r.get("value", "")
    return d

def parse_list_str(list_json_str):
    books = []
    for ref_block in re.finditer(r'"ref"\s*:\s*(\[.*?\])\s*,\s*"__typename"', list_json_str, re.DOTALL):
        try:
            refs = json.loads(ref_block.group(1))
        except Exception:
            continue
        d = refs_to_dict(refs)
        title = d.get("title", "")
        if not title: continue
        isbn = d.get("isbn", "")
        raw_year = d.get("pubyear2", "")
        try:
            pub_year = int(str(raw_year).strip()) if raw_year else None
        except (ValueError, TypeError):
            pub_year = None
        books.append({
            "title":        title,
            "author":       d.get("author", ""),
            "isbn":         isbn,
            "publisher":    d.get("publisher", ""),
            "publishYear":  pub_year,
            "callNumber":   d.get("callNumString", d.get("CNO", "")).strip(),
            "bibId":        d.get("sid", ""),
            "coverUrl":     d.get("bookImg", ""),
            "materialType": fea_to_type(d.get("feaName", "")),
            "language":     detect_language(isbn),
        })
    return books

def parse_nav(raw):
    if not raw: return [], [], 1, None
    try: data = json.loads(raw)
    except Exception: return [], [], 1, None
    nav = data.get("data", {}).get("newarrivals", {})
    info = nav.get("info", {})
    total_page = info.get("totalPage", 1)
    token = info.get("hyftdToken")
    list_str = json.dumps(nav.get("list", {}), ensure_ascii=False)
    books = parse_list_str(list_str)
    sids = [b["bibId"] for b in books if b["bibId"]]
    return books, sids, total_page, token

EVALUATE_JS = """
    async ([url, query, csrf, keepsite, newbookDate]) => {
        const sf = {
            serialNo: "1", newbookDate: newbookDate,
            searchField: [], searchInput: [], op: [],
            keepsite: keepsite, cln: [], groupType: "newArrival",
            pageNo: 1, limit: 30
        };
        const res = await fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/json", "x-csrf-token": csrf},
            credentials: "include",
            body: JSON.stringify({operationName:"newarrivals", variables:{searchForm:sf}, query:query})
        });
        return await res.text();
    }
"""

def get_available_months(page):
    options = page.locator("select").nth(1).locator("option").all()
    return [opt.get_attribute("value") for opt in options
            if re.match(r"^\d{6}$", opt.get_attribute("value") or "")]

def month_label(code):
    return f"{code[:4]}-{code[4:]}"

# ── 爬取單月書目 ──────────────────────────────────────

def scrape_month(newbookDate):
    label = month_label(newbookDate)
    all_books, seen_bids, bibid_to_branches = [], set(), {}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(user_agent=(
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
        ))
        page = ctx.new_page()
        captured = {"headers": {}, "query": ""}

        def on_req(request):
            if "graphql" in request.url and request.method == "POST":
                try:
                    body = json.loads(request.post_data or "{}")
                    if body.get("operationName") == "newarrivals" and not captured["query"]:
                        captured["headers"] = dict(request.headers)
                        captured["query"]   = body.get("query", "")
                except Exception: pass

        page.on("request", on_req)
        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        time.sleep(5)

        csrf, query_str = captured["headers"].get("x-csrf-token", ""), captured["query"]

        print(f"  步驟一：{label} page 1…")
        raw_p1 = page.evaluate(EVALUATE_JS, [GQL_URL, query_str, csrf, [], newbookDate])
        books1, _, total_page, global_token = parse_nav(raw_p1)
        for b in books1:
            if b["bibId"] and b["bibId"] not in seen_bids:
                seen_bids.add(b["bibId"]); all_books.append(b)
        print(f"    page 1: {len(books1)} 本，totalPage={total_page}")

        session = requests.Session()
        skip = {"content-length", "host", "connection", "accept-encoding"}
        for k, v in captured["headers"].items():
            if k.lower() not in skip: session.headers[k] = v
        for ck in ctx.cookies():
            session.cookies.set(ck["name"], ck["value"], domain=ck.get("domain", ""))

        token = global_token
        failed_pages = []
        for pn in range(2, total_page + 1):
            success = False
            for attempt in range(3):  # 最多重試 3 次
                try:
                    sf = {"serialNo": "1", "newbookDate": newbookDate,
                          "searchField": [], "searchInput": [], "op": [],
                          "keepsite": [], "cln": [], "groupType": "newArrival",
                          "pageNo": pn, "limit": 30, "hyftdToken": token}
                    resp = session.post(GQL_URL,
                        json={"operationName": "newarrivals", "variables": {"searchForm": sf}, "query": query_str},
                        timeout=30)
                    if len(resp.content) < 200:
                        time.sleep(2 ** attempt)  # 指數退避
                        continue
                    books, _, _, new_tok = parse_nav(resp.text)
                    if new_tok: token = new_tok
                    for b in books:
                        if b["bibId"] and b["bibId"] not in seen_bids:
                            seen_bids.add(b["bibId"]); all_books.append(b)
                    success = True
                    break
                except Exception as e:
                    print(f"    page {pn} attempt {attempt+1} 失敗：{e}")
                    time.sleep(2 ** attempt)
            if not success:
                failed_pages.append(pn)
            time.sleep(0.3)

        if failed_pages:
            print(f"    ⚠️  跳過失敗頁：{failed_pages}")
        print(f"    書目共 {len(all_books)} 本")
        browser.close()

    # 館別
    branch_items = list(BRANCH_MAP.items())
    print(f"  步驟二：{label} 各館別（{len(branch_items)} 間）…")
    with sync_playwright() as p:
        for batch_start in range(0, len(branch_items), BATCH_SIZE):
            batch = branch_items[batch_start: batch_start + BATCH_SIZE]
            browser = p.chromium.launch(headless=True)
            ctx2 = browser.new_context(user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
            ))
            page2 = ctx2.new_page()
            cap2 = {"headers": {}, "query": ""}

            def on_req2(request):
                if "graphql" in request.url and request.method == "POST":
                    try:
                        body = json.loads(request.post_data or "{}")
                        if body.get("operationName") == "newarrivals" and not cap2["query"]:
                            cap2["headers"] = dict(request.headers)
                            cap2["query"]   = body.get("query", "")
                    except Exception: pass

            page2.on("request", on_req2)
            page2.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
            time.sleep(4)

            csrf2, query_str2 = cap2["headers"].get("x-csrf-token", ""), cap2["query"] or query_str
            sess2 = requests.Session()
            skip2 = {"content-length", "host", "connection", "accept-encoding"}
            for k, v in cap2["headers"].items():
                if k.lower() not in skip2: sess2.headers[k] = v
            for ck in ctx2.cookies():
                sess2.cookies.set(ck["name"], ck["value"], domain=ck.get("domain", ""))

            for idx, (code, br_name) in enumerate(batch, batch_start + 1):
                try:
                    raw_br = page2.evaluate(EVALUATE_JS, [GQL_URL, query_str2, csrf2, [code], newbookDate])
                    _, sids_p1, br_total, br_token = parse_nav(raw_br)
                except Exception as e:
                    print(f"    [{idx}] {br_name} evaluate 失敗：{e}"); continue
                if not br_token:
                    print(f"    [{idx}] {br_name}：無 token，略過"); continue
                br_sids = set(sids_p1)
                for pn in range(2, br_total + 1):
                    try:
                        sf = {"serialNo": "1", "newbookDate": newbookDate,
                              "searchField": [], "searchInput": [], "op": [],
                              "keepsite": [code], "cln": [], "groupType": "newArrival",
                              "pageNo": pn, "limit": 30, "hyftdToken": br_token}
                        resp = sess2.post(GQL_URL,
                            json={"operationName": "newarrivals", "variables": {"searchForm": sf}, "query": query_str2},
                            timeout=30)
                        if len(resp.content) < 200: time.sleep(0.5); continue
                        _, sids_pn, _, new_br_tok = parse_nav(resp.text)
                        if new_br_tok: br_token = new_br_tok
                        br_sids.update(sids_pn)
                    except Exception as e:
                        print(f"      [{code}] page {pn} 失敗：{e}")
                    time.sleep(0.15)
                for sid in br_sids:
                    bibid_to_branches.setdefault(sid, []).append(code)
            browser.close()

    for b in all_books:
        branches = bibid_to_branches.get(b["bibId"], [])
        b["branches"] = branches
        b["branch"]   = branches[0] if branches else ""
        b["month"]    = month_label(newbookDate)

    return [b for b in all_books if b.get("title")]

# ── 書介補充（只補新書）────────────────────────────────

DESC_QUERY = """query bookdetail($marcId: Int) {
  getBookDetail(id: $marcId) { values { key value } }
}"""

def get_desc_session():
    captured = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()
        def on_request(request):
            if "graphql" in request.url and not captured:
                csrf = request.headers.get("x-csrf-token", "")
                if csrf:
                    captured["csrf"]    = csrf
                    captured["cookies"] = {c["name"]: c["value"] for c in ctx.cookies()}
        page.on("request", on_request)
        page.goto("https://book.tpml.edu.tw/bookDetail?id=899196",
                  wait_until="networkidle", timeout=30000)
        browser.close()
    return captured.get("cookies", {}), captured.get("csrf", "")

def fetch_descriptions(books):
    total = len(books)
    if total == 0: return
    print(f"  補充書介：{total} 本新書…")
    cookies, csrf = get_desc_session()
    if not csrf: print("  無法取得 CSRF，跳過書介"); return
    session = requests.Session()
    session.cookies.update(cookies)
    session.verify = False
    updated = 0
    for i, book in enumerate(books):
        if i > 0 and i % DESC_BATCH_SIZE == 0:
            cookies, csrf = get_desc_session()
            session = requests.Session()
            session.cookies.update(cookies)
            session.verify = False
        bib_id = book.get("bibId")
        if not bib_id: continue
        try:
            r = session.post(GQL_URL,
                json={"operationName": "bookdetail", "variables": {"marcId": int(bib_id)}, "query": DESC_QUERY},
                headers={"x-csrf-token": csrf, "Content-Type": "application/json",
                         "Referer": f"https://book.tpml.edu.tw/bookDetail?id={bib_id}"},
                timeout=10)
            if r.status_code == 200:
                vals = r.json().get("data", {}).get("getBookDetail", {}).get("values", [])
                d = {v["key"]: v["value"] for v in vals}
                if d.get("bookdesc"):
                    book["description"] = d["bookdesc"].strip(); updated += 1
                if d.get("authordesc"):
                    book["authorDesc"] = d["authordesc"].strip()
        except Exception: pass
        time.sleep(0.05)
    print(f"  書介完成：{updated}/{total}")

# ── 主程式 ────────────────────────────────────────────

def main():
    now = datetime.datetime.now()
    print(f"{'='*55}")
    print(f"北圖新書通報 — 每日增量更新  {now.strftime('%Y-%m-%d %H:%M')}")
    print(f"{'='*55}\n")

    # 取當月代碼
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        months = get_available_months(page)
        browser.close()

    if not months:
        print("無法取得月份清單"); return

    current_month_code = months[0]
    current_month      = month_label(current_month_code)
    print(f"當月：{current_month}（共 {len(months)} 個月可用）\n")

    # 載入現有資料
    try:
        existing = json.load(open(OUTPUT_FILE, encoding="utf-8"))
    except FileNotFoundError:
        existing = []

    # 分離當月 / 其他月份
    other_months_books = [b for b in existing if b.get("month") != current_month]
    existing_bids      = {b["bibId"] for b in existing if b.get("bibId")}
    print(f"現有資料：{len(existing)} 本（其中 {len(other_months_books)} 本屬其他月份）\n")

    # 爬當月
    print(f"重新爬取 {current_month}…")
    fresh_books = scrape_month(current_month_code)
    print(f"爬取完成：{len(fresh_books)} 本\n")

    # 覆蓋保護：若新爬數量比舊當月資料少超過 10%，警告並中止
    old_current_count = len([b for b in existing if b.get("month") == current_month])
    if old_current_count > 0 and len(fresh_books) < old_current_count * 0.9:
        print(f"⛔ 中止：新爬 {len(fresh_books)} 本 < 舊資料 {old_current_count} 本的 90%，疑似爬取不完整，保留原資料。")
        return

    # 找出新書（現有資料沒有的 bibId）
    new_books = [b for b in fresh_books if b.get("bibId") and b["bibId"] not in existing_bids]
    print(f"新增書目：{len(new_books)} 本")

    # 保留舊書的書介（合併回）
    bid_to_old = {b["bibId"]: b for b in existing if b.get("bibId")}
    for b in fresh_books:
        old = bid_to_old.get(b.get("bibId", ""))
        if old:
            if old.get("description") and not b.get("description"):
                b["description"] = old["description"]
            if old.get("authorDesc") and not b.get("authorDesc"):
                b["authorDesc"] = old["authorDesc"]

    # 只對新書補書介
    if new_books:
        fetch_descriptions(new_books)

    # 合併：其他月份 + 最新當月
    all_books = other_months_books + fresh_books

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_books, f, ensure_ascii=False, indent=None, separators=(",", ":"))

    month_counts = {}
    for b in all_books:
        m = b.get("month", "?")
        month_counts[m] = month_counts.get(m, 0) + 1

    print(f"\n✅ 更新完成：共 {len(all_books)} 本")
    print("月份分布：")
    for m, cnt in sorted(month_counts.items(), reverse=True):
        print(f"  {m}：{cnt} 本")
    has_desc = sum(1 for b in all_books if b.get("description"))
    print(f"書介覆蓋：{has_desc}/{len(all_books)}（{has_desc*100//len(all_books) if all_books else 0}%）")

if __name__ == "__main__":
    main()
