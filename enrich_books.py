"""
北圖新書通報資料豐富化腳本 v5
- 自動抓取最近 3 個月的新書
- 每本書標記所屬月份（month: "2026-03"）
- 完成後自動補充書籍簡介（bookdesc / authordesc）

使用方式：
    python3 enrich_books.py

輸出：public/books.json（覆蓋現有檔案）
預計執行時間：約 90–150 分鐘（3 個月 × 每月 30–50 分鐘）
"""
import json, time, warnings, re
import requests
from playwright.sync_api import sync_playwright

warnings.filterwarnings("ignore")

TARGET_URL  = "https://book.tpml.edu.tw/newArrivals?serialNo=1"
GQL_URL     = "https://book.tpml.edu.tw/api/HyLibWS/graphql"
OUTPUT_FILE = "public/books.json"
MONTHS_TO_SCRAPE = 3   # 最近幾個月
BATCH_SIZE       = 12  # 每批館別數（低於 17 確保 CSRF 不過期）
DESC_BATCH_SIZE  = 200 # 書介補充時每批換一次 token

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

# ── 工具函式 ──────────────────────────────────────────

def fea_to_type(fea: str) -> str:
    fea = fea.lower()
    if "book" in fea:    return "圖書"
    if "media" in fea:   return "視聽資料"
    if "journal" in fea: return "期刊"
    if fea:              return "其他"
    return ""

def detect_language(isbn: str) -> str:
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

def refs_to_dict(refs) -> dict:
    d = {}
    if isinstance(refs, dict): refs = list(refs.values())
    for r in (refs or []):
        if isinstance(r, dict) and r.get("key"):
            d[r["key"]] = r.get("value", "")
    return d

def parse_list_str(list_json_str: str) -> list:
    books = []
    for ref_block in re.finditer(r'"ref"\s*:\s*(\[.*?\])\s*,\s*"__typename"', list_json_str, re.DOTALL):
        raw = ref_block.group(1)
        try:
            refs = json.loads(raw)
        except Exception:
            continue
        d = refs_to_dict(refs)
        title = d.get("title", "")
        if not title:
            continue
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

def parse_sids(list_json_str: str) -> list:
    sids = []
    for ref_block in re.finditer(r'"ref"\s*:\s*(\[.*?\])\s*,\s*"__typename"', list_json_str, re.DOTALL):
        try:
            refs = json.loads(ref_block.group(1))
        except Exception:
            continue
        d = refs_to_dict(refs)
        if d.get("title") and d.get("sid"):
            sids.append(d["sid"])
    return sids

def parse_nav(raw: str):
    if not raw:
        return [], [], 1, None
    try:
        data = json.loads(raw)
    except Exception:
        return [], [], 1, None
    nav = data.get("data", {}).get("newarrivals", {})
    info = nav.get("info", {})
    total_page = info.get("totalPage", 1)
    token = info.get("hyftdToken")
    list_str = json.dumps(nav.get("list", {}), ensure_ascii=False)
    books = parse_list_str(list_str)
    sids = [b["bibId"] for b in books if b["bibId"]]
    return books, sids, total_page, token

# newbookDate 作為第 5 個參數傳入
EVALUATE_JS = """
    async ([url, query, csrf, keepsite, newbookDate]) => {
        const sf = {
            serialNo: "1",
            newbookDate: newbookDate,
            searchField: [], searchInput: [], op: [],
            keepsite: keepsite, cln: [], groupType: "newArrival"
        };
        const payload = {
            operationName: "newarrivals",
            variables: {searchForm: sf},
            query: query
        };
        const res = await fetch(url, {
            method: "POST",
            headers: {"Content-Type": "application/json", "x-csrf-token": csrf},
            credentials: "include",
            body: JSON.stringify(payload)
        });
        return await res.text();
    }
"""

# ── 月份工具 ──────────────────────────────────────────

def get_available_months(page) -> list:
    """從頁面 select 取出可用月份清單（最新在前）"""
    options = page.locator("select").nth(1).locator("option").all()
    months = []
    for opt in options:
        val = opt.get_attribute("value") or ""
        if re.match(r"^\d{6}$", val):
            months.append(val)
    return months  # e.g. ["202603","202602","202601",...]

def month_label(code: str) -> str:
    """202603 → 2026-03"""
    return f"{code[:4]}-{code[4:]}"

# ── 單月爬蟲 ─────────────────────────────────────────

def scrape_month(newbookDate: str) -> list:
    """爬取指定月份（newbookDate 如 "202603"）的全部書目＋館別，回傳書目列表"""
    label = month_label(newbookDate)
    print(f"\n{'='*55}")
    print(f"爬取月份：{label}")
    print(f"{'='*55}")

    all_books:           list = []
    seen_bids:           set  = set()
    bibid_to_branches:   dict = {}

    # ── 步驟一：全館未過濾 page 1 ────────────────────
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                       "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
        )
        page = ctx.new_page()
        captured = {"headers": {}, "query": ""}

        def on_req(request):
            if "graphql" in request.url and request.method == "POST":
                try:
                    body = json.loads(request.post_data or "{}")
                    if body.get("operationName") == "newarrivals" and not captured["query"]:
                        captured["headers"] = dict(request.headers)
                        captured["query"]   = body.get("query", "")
                except Exception:
                    pass

        page.on("request", on_req)
        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        time.sleep(5)

        csrf      = captured["headers"].get("x-csrf-token", "")
        query_str = captured["query"]

        print(f"步驟一：取 {label} 未過濾 page 1…")
        raw_p1 = page.evaluate(EVALUATE_JS, [GQL_URL, query_str, csrf, [], newbookDate])
        books1, _, total_page, global_token = parse_nav(raw_p1)
        for b in books1:
            if b["bibId"] and b["bibId"] not in seen_bids:
                seen_bids.add(b["bibId"]); all_books.append(b)
        print(f"  page 1: {len(books1)} 本，totalPage={total_page}")

        # ── 步驟二：requests 取剩餘頁 ─────────────────
        session = requests.Session()
        skip = {"content-length", "host", "connection", "accept-encoding"}
        for k, v in captured["headers"].items():
            if k.lower() not in skip:
                session.headers[k] = v
        for ck in ctx.cookies():
            session.cookies.set(ck["name"], ck["value"], domain=ck.get("domain", ""))

        print(f"\n步驟二：取 {label} page 2–{total_page}…")
        token = global_token
        for pn in range(2, total_page + 1):
            try:
                sf = {"serialNo": "1", "newbookDate": newbookDate,
                      "searchField": [], "searchInput": [], "op": [],
                      "keepsite": [], "cln": [], "groupType": "newArrival",
                      "pageNo": pn, "limit": 30, "hyftdToken": token}
                resp = session.post(GQL_URL,
                                    json={"operationName": "newarrivals",
                                          "variables": {"searchForm": sf},
                                          "query": query_str},
                                    timeout=30)
                if len(resp.content) < 200:
                    time.sleep(1); continue
                books, _, _, new_tok = parse_nav(resp.text)
                if new_tok: token = new_tok
                new = 0
                for b in books:
                    if b["bibId"] and b["bibId"] not in seen_bids:
                        seen_bids.add(b["bibId"]); all_books.append(b); new += 1
                if pn % 10 == 0 or pn == total_page:
                    print(f"  page {pn}/{total_page}，新增 {new}，累計 {len(all_books)}")
            except Exception as e:
                print(f"  page {pn} 失敗：{e}")
            time.sleep(0.2)

        print(f"\n書目蒐集完成：{len(all_books)} 筆")
        browser.close()

    # ── 步驟三：分批取各館別 ─────────────────────────
    branch_items   = list(BRANCH_MAP.items())
    total_branches = len(branch_items)
    print(f"\n步驟三：取 {label} 各館別（{total_branches} 間，每批 {BATCH_SIZE} 間）…")

    with sync_playwright() as p:
        for batch_start in range(0, total_branches, BATCH_SIZE):
            batch     = branch_items[batch_start: batch_start + BATCH_SIZE]
            batch_end = min(batch_start + BATCH_SIZE, total_branches)
            print(f"── 批次 {batch_start+1}–{batch_end} / {total_branches}，重新取 session…")

            browser = p.chromium.launch(headless=True)
            ctx2 = browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                           "AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
            )
            page2 = ctx2.new_page()
            cap2  = {"headers": {}, "query": ""}

            def on_req2(request):
                if "graphql" in request.url and request.method == "POST":
                    try:
                        body = json.loads(request.post_data or "{}")
                        if body.get("operationName") == "newarrivals" and not cap2["query"]:
                            cap2["headers"] = dict(request.headers)
                            cap2["query"]   = body.get("query", "")
                    except Exception:
                        pass

            page2.on("request", on_req2)
            page2.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
            time.sleep(4)

            csrf2      = cap2["headers"].get("x-csrf-token", "")
            query_str2 = cap2["query"] or query_str

            sess2 = requests.Session()
            skip2 = {"content-length", "host", "connection", "accept-encoding"}
            for k, v in cap2["headers"].items():
                if k.lower() not in skip2:
                    sess2.headers[k] = v
            for ck in ctx2.cookies():
                sess2.cookies.set(ck["name"], ck["value"], domain=ck.get("domain", ""))

            for idx, (code, br_name) in enumerate(batch, batch_start + 1):
                try:
                    raw_br = page2.evaluate(EVALUATE_JS, [GQL_URL, query_str2, csrf2, [code], newbookDate])
                    _, sids_p1, br_total, br_token = parse_nav(raw_br)
                except Exception as e:
                    print(f"  [{idx}/{total_branches}] {br_name}（{code}）evaluate 失敗：{e}")
                    continue

                if not br_token:
                    print(f"  [{idx}/{total_branches}] {br_name}（{code}）：無 token，略過")
                    continue

                br_sids = set(sids_p1)
                for pn in range(2, br_total + 1):
                    try:
                        sf = {"serialNo": "1", "newbookDate": newbookDate,
                              "searchField": [], "searchInput": [], "op": [],
                              "keepsite": [code], "cln": [], "groupType": "newArrival",
                              "pageNo": pn, "limit": 30, "hyftdToken": br_token}
                        resp = sess2.post(GQL_URL,
                                          json={"operationName": "newarrivals",
                                                "variables": {"searchForm": sf},
                                                "query": query_str2},
                                          timeout=30)
                        if len(resp.content) < 200:
                            time.sleep(0.5); continue
                        _, sids_pn, _, new_br_tok = parse_nav(resp.text)
                        if new_br_tok: br_token = new_br_tok
                        br_sids.update(sids_pn)
                    except Exception as e:
                        print(f"    [{code}] page {pn} 失敗：{e}")
                    time.sleep(0.15)

                print(f"  [{idx}/{total_branches}] {br_name}（{code}）：{len(br_sids)} 本（{br_total} 頁）")
                for sid in br_sids:
                    bibid_to_branches.setdefault(sid, []).append(code)

            browser.close()
            print()

    # ── 步驟四：寫入館別＋月份 ────────────────────────
    for b in all_books:
        branches  = bibid_to_branches.get(b["bibId"], [])
        b["branches"] = branches
        b["branch"]   = branches[0] if branches else ""
        b["month"]    = month_label(newbookDate)

    return [b for b in all_books if b.get("title")]


# ── 書介補充 ──────────────────────────────────────────

DESC_QUERY = """query bookdetail($marcId: Int) {
  getBookDetail(id: $marcId) {
    values { key value }
  }
}"""

def get_desc_session():
    """用 Playwright 取得可用於書介查詢的 session + CSRF"""
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


def fetch_descriptions(books: list) -> None:
    """原地更新書目的 description / authorDesc 欄位"""
    total = len(books)
    print(f"\n{'='*55}")
    print(f"補充書介：共 {total} 本…")
    print(f"{'='*55}")

    cookies, csrf = get_desc_session()
    if not csrf:
        print("無法取得 CSRF token，跳過書介補充"); return

    session = requests.Session()
    session.cookies.update(cookies)
    session.verify = False

    updated = 0
    for i, book in enumerate(books):
        # 每 DESC_BATCH_SIZE 本換一次 token
        if i > 0 and i % DESC_BATCH_SIZE == 0:
            print(f"  → 更新 token（已處理 {i}/{total}）")
            cookies, csrf = get_desc_session()
            session = requests.Session()
            session.cookies.update(cookies)
            session.verify = False

        bib_id = book.get("bibId")
        if not bib_id:
            continue

        try:
            r = session.post(
                GQL_URL,
                json={"operationName": "bookdetail",
                      "variables": {"marcId": int(bib_id)},
                      "query": DESC_QUERY},
                headers={"x-csrf-token": csrf, "Content-Type": "application/json",
                         "Referer": f"https://book.tpml.edu.tw/bookDetail?id={bib_id}"},
                timeout=10,
            )
            if r.status_code == 200:
                vals = r.json().get("data", {}).get("getBookDetail", {}).get("values", [])
                d = {v["key"]: v["value"] for v in vals}
                if d.get("bookdesc"):
                    book["description"] = d["bookdesc"].strip()
                    updated += 1
                if d.get("authordesc"):
                    book["authorDesc"] = d["authordesc"].strip()
        except Exception:
            pass

        if (i + 1) % 100 == 0:
            print(f"  進度：{i+1}/{total}，已取得書介：{updated}")
        time.sleep(0.05)

    print(f"書介補充完成：{updated}/{total} 本取得書介")


# ── 主程式 ────────────────────────────────────────────

def main():
    print("=" * 55)
    print("北圖新書通報資料豐富化腳本 v5（多月份版）")
    print("=" * 55)

    # 先取可用月份清單
    print("\n取得可用月份清單…")
    available_months = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        available_months = get_available_months(page)
        browser.close()

    if not available_months:
        print("無法取得月份清單，請確認網路連線"); return

    target_months = available_months[:MONTHS_TO_SCRAPE]
    print(f"將爬取月份：{[month_label(m) for m in target_months]}\n")

    # 逐月爬取
    all_books = []
    for month_code in target_months:
        books = scrape_month(month_code)
        print(f"✅ {month_label(month_code)} 完成：{len(books)} 本")
        all_books.extend(books)

    print(f"\n{'='*55}")
    print(f"全部月份爬取完成：共 {len(all_books)} 本書")

    # 補充書介
    fetch_descriptions(all_books)

    # 寫出
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_books, f, ensure_ascii=False, indent=None, separators=(",", ":"))

    # 統計
    month_counts = {}
    for b in all_books:
        month_counts[b.get("month", "?")] = month_counts.get(b.get("month", "?"), 0) + 1

    print(f"\n✅ 已儲存至 {OUTPUT_FILE}")
    print("月份分布：")
    for m, cnt in sorted(month_counts.items(), reverse=True):
        print(f"  {m}：{cnt} 本")
    has_desc = sum(1 for b in all_books if b.get("description"))
    print(f"書介覆蓋：{has_desc}/{len(all_books)}（{has_desc*100//len(all_books)}%）")


if __name__ == "__main__":
    main()
