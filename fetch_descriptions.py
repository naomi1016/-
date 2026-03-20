"""
從台北市立圖書館網站補充書籍簡介（bookdesc）與作者簡介（authordesc）

執行方式：
    python3 fetch_descriptions.py

輸出：更新 public/books.json（新增 description / authorDesc 欄位）
預計執行時間：約 5–15 分鐘（1600 本書）
"""
import json, time, warnings
import requests
from playwright.sync_api import sync_playwright

warnings.filterwarnings("ignore")

GQL_URL    = "https://book.tpml.edu.tw/api/HyLibWS/graphql"
ENTRY_URL  = "https://book.tpml.edu.tw/bookDetail?id=899196"
INPUT_FILE = "public/books.json"
BATCH_SIZE = 200   # 每批後換一次 token（保守設定）

QUERY = """query bookdetail($marcId: Int) {
  getBookDetail(id: $marcId) {
    values { key value }
  }
}"""


def get_session_and_csrf():
    """用 Playwright 取得 session cookie + CSRF token"""
    captured = {}
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context()
        page = ctx.new_page()

        def on_request(request):
            if "graphql" in request.url and not captured:
                csrf = request.headers.get("x-csrf-token", "")
                if csrf:
                    captured["csrf"] = csrf
                    captured["cookies"] = {c["name"]: c["value"] for c in ctx.cookies()}

        page.on("request", on_request)
        page.goto(ENTRY_URL, wait_until="networkidle", timeout=30000)
        browser.close()

    return captured.get("cookies", {}), captured.get("csrf", "")


def fetch_desc(session, csrf, bib_id: int) -> dict:
    """回傳 {description, authorDesc}，失敗回傳空 dict"""
    try:
        r = session.post(
            GQL_URL,
            json={"operationName": "bookdetail", "variables": {"marcId": bib_id}, "query": QUERY},
            headers={
                "x-csrf-token": csrf,
                "Content-Type": "application/json",
                "Referer": f"https://book.tpml.edu.tw/bookDetail?id={bib_id}",
            },
            timeout=10,
        )
        if r.status_code != 200:
            return {}
        vals = r.json().get("data", {}).get("getBookDetail", {}).get("values", [])
        d = {v["key"]: v["value"] for v in vals}
        result = {}
        if d.get("bookdesc"):
            result["description"] = d["bookdesc"].strip()
        if d.get("authordesc"):
            result["authorDesc"] = d["authordesc"].strip()
        return result
    except Exception:
        return {}


def main():
    data = json.load(open(INPUT_FILE, encoding="utf-8"))
    total = len(data)
    print(f"共 {total} 本書，開始補充書介…")

    cookies, csrf = get_session_and_csrf()
    if not csrf:
        print("無法取得 CSRF token，請確認網路連線")
        return

    session = requests.Session()
    session.cookies.update(cookies)
    session.verify = False

    updated = 0
    for i, book in enumerate(data):
        # 每 BATCH_SIZE 本換一次 token
        if i > 0 and i % BATCH_SIZE == 0:
            print(f"  → 更新 token（已處理 {i}/{total}）")
            cookies, csrf = get_session_and_csrf()
            session = requests.Session()
            session.cookies.update(cookies)
            session.verify = False

        bib_id = book.get("bibId")
        if not bib_id:
            continue

        result = fetch_desc(session, csrf, int(bib_id))
        if result:
            book.update(result)
            updated += 1

        if (i + 1) % 50 == 0:
            print(f"  進度：{i+1}/{total}，已取得書介：{updated}")
            # 寫入中間結果，避免中斷後全部重來
            json.dump(data, open(INPUT_FILE, "w", encoding="utf-8"),
                      ensure_ascii=False, indent=None, separators=(",", ":"))

        time.sleep(0.05)  # 輕量限速

    json.dump(data, open(INPUT_FILE, "w", encoding="utf-8"),
              ensure_ascii=False, indent=None, separators=(",", ":"))
    print(f"\n完成！共 {total} 本書，取得書介 {updated} 本，已寫入 {INPUT_FILE}")


if __name__ == "__main__":
    main()
