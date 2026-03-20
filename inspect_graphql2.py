"""
攔截北圖 GraphQL API，找出書目清單的完整 query 與欄位結構
"""
from playwright.sync_api import sync_playwright
import time, json

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
    ).new_page()

    samples = []

    def on_resp(response):
        if "graphql" not in response.url:
            return
        try:
            data = response.json()
            d = data.get("data", {})
            # 只記錄含有書目清單的回應（有 marcList 或 bibList 或 list 且含書名欄位）
            text = json.dumps(d, ensure_ascii=False)
            if any(k in text for k in ["titleProper", "title", "callno", "author", "marcList", "bibList", "newArrival"]):
                samples.append({"url": response.url, "data": d})
        except:
            pass

    page.on("response", on_resp)
    page.goto("https://book.tpml.edu.tw/newArrivals?serialNo=1",
              wait_until="networkidle", timeout=30000)
    time.sleep(5)

    print(f"找到 {len(samples)} 個含書目資料的 GraphQL 回應\n")
    for i, s in enumerate(samples[:5]):
        print(f"=== 回應 {i+1} ===")
        print(json.dumps(s["data"], ensure_ascii=False, indent=2)[:4000])
        print()

    if not samples:
        print("未找到書目資料，印出所有 GraphQL 回應的 data keys：")
        # 重新收集
        all_keys = set()
        def on_resp2(response):
            if "graphql" not in response.url:
                return
            try:
                data = response.json().get("data", {})
                for k in data.keys():
                    all_keys.add(k)
                    sub = data[k]
                    if isinstance(sub, dict):
                        for k2 in sub.keys():
                            all_keys.add(f"{k}.{k2}")
            except:
                pass

        page2 = browser.new_context().new_page()
        page2.on("response", on_resp2)
        page2.goto("https://book.tpml.edu.tw/newArrivals?serialNo=1",
                   wait_until="networkidle", timeout=30000)
        time.sleep(5)
        print("所有出現過的 data keys：")
        for k in sorted(all_keys):
            print(" ", k)

    browser.close()
