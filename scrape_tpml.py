"""
北圖新書通報爬蟲 v12（最終版）
發現重點：
- 分頁請求使用 limit:30（非 pagesize）+ hyftdToken + pageNo
- x-csrf-token header 是必要的
- newarrivals 回應已含所有書目資料（bookImg, sid, title, isbn 等）
  無需額外 marcSummary 請求

流程：
1. Playwright 開啟頁面，攔截第 1 頁請求，取得 query/headers/cookies
2. 用 page.evaluate 在瀏覽器上下文取第 1 頁回應，拿到 hyftdToken
3. 用 requests 帶 cookies+csrf 取第 2–56 頁
4. 解析並輸出 public/books.json
"""
import json, time, warnings, re
import requests
from playwright.sync_api import sync_playwright

warnings.filterwarnings("ignore")

TARGET_URL  = "https://book.tpml.edu.tw/newArrivals?serialNo=1"
GQL_URL     = "https://book.tpml.edu.tw/api/HyLibWS/graphql"
OUTPUT_FILE = "public/books.json"


# ── 解析 newarrivals 回應 ─────────────────────────────────
def refs_to_dict(refs) -> dict:
    d = {}
    if isinstance(refs, dict):
        refs = list(refs.values())
    for r in (refs or []):
        if isinstance(r, dict) and r.get("key"):
            d[r["key"]] = r.get("value", "")
    return d


def parse_nav_regex(list_json_str: str) -> list:
    """用 regex 從 list JSON 字串萃取書目（避免 Playwright dict/list 轉換問題）"""
    books = []
    # 找每一個 bookImg，再在同一書籍的 ref block 裡找其他欄位
    # 每本書的 ref block 在同一個 values item 內
    # 用 regex 找到所有書籍的 ref arrays

    # 每個書籍的 ref 陣列：[{"key":"bookImg","value":"..."}, {"key":"title","value":"..."}...]
    # 找 values 陣列中每個 item 的 ref
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
        books.append({
            "title":      title,
            "author":     d.get("author", ""),
            "isbn":       d.get("isbn", ""),
            "callNumber": d.get("callNumString", d.get("CNO", "")).strip(),
            "bibId":      d.get("sid", ""),
            "coverUrl":   d.get("bookImg", ""),
        })
    return books


def parse_nav_structured(nav: dict) -> tuple:
    """解析 newarrivals，回傳 (page_no, total_page, token, books)"""
    info       = nav.get("info", {})
    page_no    = info.get("pageNo", 0)
    total_page = info.get("totalPage", 1)
    token      = info.get("hyftdToken")

    list_str = json.dumps(nav.get("list", {}), ensure_ascii=False)
    books    = parse_nav_regex(list_str)
    return page_no, total_page, token, books


def scrape():
    all_books = []
    seen_bids = set()

    # ── 步驟一：Playwright 取 session 資訊 ───────────────
    with sync_playwright() as p:
        print("啟動瀏覽器，建立 session…")
        browser = p.chromium.launch(headless=True)
        ctx     = browser.new_context(
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
        time.sleep(4)

        # 取第 1 頁資料（在瀏覽器 context 裡，完整 cookie/session）
        page1_result = page.evaluate("""
            async ([url, query]) => {
                const sf = {serialNo:"1", searchField:[], searchInput:[], op:[],
                             keepsite:[], cln:[], groupType:"newArrival", pageNo:1, limit:30};
                const payload = {
                    operationName: "newarrivals",
                    variables: {searchForm: sf},
                    query: query
                };
                const res  = await fetch(url, {
                    method: "POST",
                    headers: {"Content-Type": "application/json"},
                    credentials: "include",
                    body: JSON.stringify(payload)
                });
                return await res.text();
            }
        """, [GQL_URL, captured["query"]])

        pw_cookies = ctx.cookies()
        browser.close()

    # 解析第 1 頁
    try:
        data1   = json.loads(page1_result)
        nav1    = data1.get("data", {}).get("newarrivals", {})
        pg1, total_page, token, books1 = parse_nav_structured(nav1)
        for b in books1:
            bid = b["bibId"] or b["isbn"] or b["title"]
            if bid and bid not in seen_bids:
                seen_bids.add(bid); all_books.append(b)
        print(f"第 1/{total_page} 頁：{len(books1)} 筆，token={token}，累計 {len(all_books)}")
        if books1:
            print(f"  範例：{books1[0]['title'][:40]}")
            print(f"  封面：{books1[0]['coverUrl'][:60]}\n")
    except Exception as e:
        print(f"第 1 頁解析失敗：{e}")
        total_page = 56
        token      = None

    # ── 步驟二：requests 取第 2–N 頁 ────────────────────
    session = requests.Session()
    skip = {"content-length", "host", "connection", "accept-encoding"}
    for k, v in captured["headers"].items():
        if k.lower() not in skip:
            session.headers[k] = v

    for ck in pw_cookies:
        session.cookies.set(ck["name"], ck["value"], domain=ck.get("domain", ""))

    query_str = captured["query"]

    failed_pages = []
    for pn in range(2, total_page + 1):
        success = False
        for attempt in range(3):  # 最多重試 3 次
            try:
                sf = {
                    "serialNo":   "1",
                    "searchField": [], "searchInput": [], "op": [],
                    "keepsite": [], "cln": [],
                    "groupType":  "newArrival",
                    "pageNo":     pn,
                    "limit":      30,
                    "hyftdToken": token,
                }
                payload = {"operationName": "newarrivals",
                           "variables": {"searchForm": sf},
                           "query": query_str}

                resp = session.post(GQL_URL, json=payload, timeout=30)
                if len(resp.content) < 200:
                    print(f"  第 {pn} 頁回應異常（{len(resp.content)} bytes），重試 {attempt+1}/3…")
                    time.sleep(2 ** attempt)
                    continue

                nav  = resp.json().get("data", {}).get("newarrivals", {})
                pg, tp, new_tok, books = parse_nav_structured(nav)
                if new_tok:
                    token = new_tok

                new = 0
                for b in books:
                    bid = b["bibId"] or b["isbn"] or b["title"]
                    if bid and bid not in seen_bids:
                        seen_bids.add(bid); all_books.append(b); new += 1

                if pn % 10 == 0 or pn == total_page:
                    print(f"  第 {pn}/{total_page} 頁，新增 {new}，累計 {len(all_books)}")

                success = True
                break

            except Exception as e:
                print(f"  第 {pn} 頁 attempt {attempt+1} 失敗：{e}")
                time.sleep(2 ** attempt)

        if not success:
            failed_pages.append(pn)
        time.sleep(0.3)

    if failed_pages:
        print(f"\n⚠️  跳過失敗頁：{failed_pages}")

    return [b for b in all_books if b.get("title")]


def main():
    print("=" * 55)
    print("北圖新書通報爬蟲 v12（最終版）")
    print("=" * 55 + "\n")
    books = scrape()
    if not books:
        print("未取得任何書目")
        return
    print(f"\n✅ 共取得 {len(books)} 筆書目")
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(books, f, ensure_ascii=False, indent=2)
    print(f"✅ 已儲存至 {OUTPUT_FILE}")
    print("\n前五筆預覽：")
    for b in books[:5]:
        print(f"  • {b['title'][:40]}")
        print(f"    作者：{b['author'][:30]}  分類號：{b['callNumber']}")
        print(f"    封面：{b['coverUrl'][:60]}")


if __name__ == "__main__":
    main()
