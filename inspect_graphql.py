"""
攔截北圖 GraphQL API，印出完整回應結構
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
        if "graphql" in response.url:
            try:
                data = response.json()
                # 只收前 3 個不同結構的回應
                if len(samples) < 3:
                    samples.append(data)
            except:
                pass

    page.on("response", on_resp)
    page.goto("https://book.tpml.edu.tw/newArrivals?serialNo=1",
              wait_until="networkidle", timeout=30000)
    time.sleep(4)

    print(f"共攔截 {len(samples)} 個 GraphQL 回應（前3個）\n")
    for i, s in enumerate(samples):
        print(f"=== 回應 {i+1} ===")
        print(json.dumps(s, ensure_ascii=False, indent=2)[:3000])
        print()

    browser.close()
