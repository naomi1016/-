"""
補爬剩餘月份（2025-09 至 2025-05）
- 跳過 DB 中已有足夠資料的月份（count > 2000）
- 每月完成後立即 upsert 並匯出 JSON
"""
import time
import db as book_db
from update_books import (
    scrape_month, fetch_descriptions, get_available_months,
    TARGET_URL, OUTPUT_FILE, month_label
)
from playwright.sync_api import sync_playwright

# 需要補爬的月份（已知 2025-10 以後已完成）
TARGET_MONTHS = {"2026-06", "2026-07"}


def main():
    conn = book_db.get_connection()

    # 確認各月目前數量
    rows = conn.execute(
        "SELECT month, COUNT(*) as c FROM books GROUP BY month ORDER BY month DESC"
    ).fetchall()
    print("目前 DB 各月數量：")
    for r in rows:
        marker = " ← 待補爬" if r[0] in TARGET_MONTHS else ""
        print(f"  {r[0]}：{r[1]} 本{marker}")
    print()

    # 取網站月份代碼對應
    print("取得可用月份清單…")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(TARGET_URL, wait_until="networkidle", timeout=60000)
        month_codes = get_available_months(page)
        browser.close()

    # 只處理目標月份，保持由新到舊的順序
    targets = [c for c in month_codes if month_label(c) in TARGET_MONTHS]
    print(f"待補爬月份（共 {len(targets)} 個）：{[month_label(c) for c in targets]}\n")

    for code in targets:
        label = month_label(code)
        current_count = conn.execute(
            "SELECT COUNT(*) FROM books WHERE month=?", (label,)
        ).fetchone()[0]
        print(f"{'='*55}")
        print(f"開始爬取 {label}（目前 DB：{current_count} 本）…")
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

        new_books = [b for b in fresh if b.get("bibId") and not b.get("description")]
        print(f"補充書介：{len(new_books)} 本…")
        if new_books:
            fetch_descriptions(new_books)

        upserted = book_db.upsert_books(conn, fresh)
        total = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
        print(f"✅ {label} 完成：upsert {upserted} 本，DB 總計 {total} 本\n")

        # 每月完成後立即匯出 JSON
        book_db.export_to_json(conn, OUTPUT_FILE, year="2026")
        print(f"  📄 public/books.json 已更新（{total} 本）\n")
        time.sleep(5)

    # 最終匯出
    total = book_db.export_to_json(conn, OUTPUT_FILE, year="2026")
    conn.close()

    print(f"{'='*55}")
    print(f"全部完成，public/books.json 共 {total} 本")
    conn2 = book_db.get_connection()
    rows = conn2.execute(
        "SELECT month, COUNT(*) as c FROM books GROUP BY month ORDER BY month DESC"
    ).fetchall()
    print("最終月份分布：")
    for r in rows:
        print(f"  {r[0]}：{r[1]} 本")
    conn2.close()


if __name__ == "__main__":
    main()
