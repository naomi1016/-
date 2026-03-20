"""
檢查北圖分頁按鈕的實際 DOM 結構
"""
from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_context(
        user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36"
    ).new_page()

    page.goto("https://book.tpml.edu.tw/newArrivals?serialNo=1",
              wait_until="networkidle", timeout=30000)
    time.sleep(3)

    # 印出所有可能是分頁的元素
    print("=== 含「頁」「next」「page」文字的元素 ===")
    for sel in ["[class*='page']", "[class*='pag']", "[class*='next']", "nav", "ul.pagination"]:
        els = page.query_selector_all(sel)
        for el in els[:3]:
            try:
                html = el.inner_html()
                if len(html) < 2000:
                    print(f"\n選擇器 [{sel}]:")
                    print(html[:1000])
            except:
                pass

    print("\n=== 所有 <button> 文字 ===")
    btns = page.query_selector_all("button")
    for b in btns:
        txt = b.inner_text().strip()
        cls = b.get_attribute("class") or ""
        if txt:
            print(f"  button: '{txt}' class='{cls}'")

    print("\n=== 所有 <a> 含數字或下一頁 ===")
    links = page.query_selector_all("a")
    for a in links:
        txt = a.inner_text().strip()
        cls = a.get_attribute("class") or ""
        href = a.get_attribute("href") or ""
        if txt and (txt.isdigit() or "頁" in txt or "next" in cls.lower()):
            print(f"  a: '{txt}' class='{cls}' href='{href}'")

    browser.close()
