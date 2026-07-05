"""
補爬歷史月份書目
- 從網站取得所有可用月份
- 重新爬取所有月份（含已爬過的）
- 同一本書在不同月份會各自保留一筆記錄
- 每月爬完後立即 upsert 進 DB，中途中斷也不會丟失已完成的月份
"""
import time
import db as book_db
from update_books import (
    scrape_month, fetch_descriptions, get_available_months,
    TARGET_URL, OUTPUT_FILE, month_label
)
from playwright.sync_api import sync_playwright


def main():
    # 取得網站上所有可用月份
    print("取得可用月份清單…")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        month_codes = get_available_months(page)
        browser.close()

    print(f"共 {len(month_codes)} 個月：{[month_label(c) for c in month_codes]}\n")

    conn = book_db.get_connection()

    for code in month_codes:
        label = month_label(code)
        print(f"{'='*55}")
        print(f"開始爬取 {label}…")
        print(f"{'='*55}")

        fresh = scrape_month(code)
        print(f"爬取完成：{len(fresh)} 本\n")

        if not fresh:
            print(f"  ⚠️  {label} 無資料，跳過\n")
            continue

        # 從 DB 取已有書介（跨月份），預先填入
        existing_descs = book_db.get_descriptions_by_bibid(conn)
        for b in fresh:
            bid = b.get("bibId", "")
            if bid in existing_descs:
                if not b.get("description"):
                    b["description"] = existing_descs[bid]["description"]
                if not b.get("authorDesc"):
                    b["authorDesc"] = existing_descs[bid]["authorDesc"]

        # 只補沒有書介的書
        new_books = [b for b in fresh if b.get("bibId") and not b.get("description")]
        print(f"補充書介：{len(new_books)} 本…")
        if new_books:
            fetch_descriptions(new_books)

        upserted = book_db.upsert_books(conn, fresh)
        total = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        print(f"✅ {label} 完成：upsert {upserted} 本，DB 總計 {total} 本\n")
        time.sleep(2)

    # 匯出最終 JSON
    total = book_db.export_to_json(conn, OUTPUT_FILE, year="2026")
    conn.close()
    print(f"{'='*55}")
    print(f"全部完成，public/books.json 共 {total} 本")

    # 月份分布
    conn2 = book_db.get_connection()
    rows = conn2.execute(
        "SELECT month, COUNT(*) as c FROM books GROUP BY month ORDER BY month DESC"
    ).fetchall()
    print("月份分布：")
    for r in rows:
        print(f"  {r[0] or '(無月份)'}：{r[1]} 本")
    conn2.close()


if __name__ == "__main__":
    main()
