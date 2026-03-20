"""
攔截含有實際書目清單的 GraphQL 回應，取得完整 query 與書目資料
"""
from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
    ).new_page()

    book_responses = []
    all_requests   = []

    def on_request(request):
        if "graphql" in request.url:
            try:
                body = request.post_data
                if body and any(k in body for k in ["newarrivals", "newArrival", "marcBrief", "bibList"]):
                    all_requests.append({"url": request.url, "body": body[:2000]})
            except:
                pass

    def on_resp(response):
        if "graphql" not in response.url:
            return
        try:
            data = response.json().get("data", {})
            text = json.dumps(data, ensure_ascii=False)
            # 找含有實際書名資料的回應（有 title 字串且不是 layout 定義）
            if '"title"' in text and '"author"' in text and '"isbn"' in text:
                book_responses.append(data)
        except:
            pass

    page.on("request",  on_request)
    page.on("response", on_resp)

    page.goto("https://book.tpml.edu.tw/newArrivals?serialNo=1",
              wait_until="networkidle", timeout=30000)
    time.sleep(5)

    print(f"含書目 POST 請求：{len(all_requests)} 個")
    for r in all_requests[:3]:
        print("\n=== 請求 body ===")
        print(r["body"])

    print(f"\n含 title+author+isbn 的回應：{len(book_responses)} 個")
    for i, d in enumerate(book_responses[:3]):
        print(f"\n=== 書目回應 {i+1} ===")
        print(json.dumps(d, ensure_ascii=False, indent=2)[:5000])

    # 如果還是沒有，把所有 newarrivals 相關回應完整印出
    if not book_responses:
        print("\n找不到書目回應，改印所有含 newarrivals 的回應：")
        hits2 = []
        def on_resp2(response):
            if "graphql" not in response.url:
                return
            try:
                data = response.json().get("data", {})
                if any("newarrival" in k.lower() for k in data.keys()):
                    hits2.append(data)
            except:
                pass

        page2 = browser.new_context(
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
        ).new_page()
        page2.on("response", on_resp2)
        page2.goto("https://book.tpml.edu.tw/newArrivals?serialNo=1",
                   wait_until="networkidle", timeout=30000)
        time.sleep(5)
        for i, d in enumerate(hits2[:5]):
            print(f"\n=== newarrivals 回應 {i+1} ===")
            print(json.dumps(d, ensure_ascii=False, indent=2)[:5000])

    browser.close()
