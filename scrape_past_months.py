"""
補抓歷史月份書目

圖書館會回頭補登舊月份的書（編目完成才上架），而每日更新只處理
當月與前一月份，更早的月份會逐漸落後。這支腳本用來一次補齊。

每個月份爬完就立即 upsert 並匯出 JSON，中途中斷不會丟失已完成的月份
（upsert 只做 INSERT/UPDATE，不刪資料）。

用法：
  python3 scrape_past_months.py                    # 補抓來源站上所有 2026 過去月份
  python3 scrape_past_months.py 2026-05 2026-06    # 只補指定月份
"""
import sys
import time
import db as book_db
from update_books import (
    sync_month, get_available_months, month_label,
    TARGET_URL, OUTPUT_FILE,
)
from playwright.sync_api import sync_playwright

YEAR = "2026"
SLEEP_BETWEEN_MONTHS = 30   # 秒；連續爬多個月份容易被來源站限流


def resolve_targets(wanted):
    """回傳 (要處理的月份代碼 list, 當月代碼)。"""
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(TARGET_URL, wait_until="networkidle", timeout=90000)
        codes = get_available_months(page)
        browser.close()

    if not codes:
        return [], None

    current   = codes[0]
    by_label  = {month_label(c): c for c in codes}

    if wanted:
        targets = []
        for want in wanted:
            if want in by_label:
                targets.append(by_label[want])
            else:
                print(f"⚠️  來源站沒有 {want}，跳過")
        return targets, current

    # 預設：所有 2026 過去月份（當月由每日更新負責，不重複處理）
    return [c for c in codes
            if month_label(c).startswith(f"{YEAR}-") and c != current], current


def main():
    wanted = sys.argv[1:]

    print(f"{'='*55}")
    print("北圖新書通報 — 補抓歷史月份")
    print(f"{'='*55}\n")

    print("取得來源站可用月份…")
    targets, current = resolve_targets(wanted)

    if not targets:
        print("沒有需要處理的月份，結束。")
        return

    print(f"當月：{month_label(current)}（由每日更新負責，本次略過）")
    print(f"本次補抓 {len(targets)} 個月：{[month_label(c) for c in targets]}\n")

    conn = book_db.get_connection()
    results = []

    for i, code in enumerate(targets, 1):
        label = month_label(code)
        print(f"\n{'#'*55}")
        print(f"# 進度 {i}/{len(targets)}：{label}")
        print(f"{'#'*55}")

        try:
            count, written = sync_month(conn, code, role=f"補抓 {i}/{len(targets)}")
        except Exception as e:
            print(f"❌ {label} 發生錯誤，跳過：{e}")
            count, written = 0, False

        results.append((label, count, written))

        # 每個月份完成就匯出，讓進度可以隨時上線
        total = book_db.export_to_json(conn, OUTPUT_FILE, year=YEAR)
        print(f"   books.json 已更新：共 {total} 本")

        if i < len(targets):
            print(f"   等待 {SLEEP_BETWEEN_MONTHS} 秒後繼續…")
            time.sleep(SLEEP_BETWEEN_MONTHS)

    conn.close()

    print(f"\n{'='*55}")
    print("補抓完成，各月結果：")
    for label, count, written in results:
        print(f"  {label}：爬到 {count} 本　{'已寫入' if written else '未寫入（跳過）'}")

    conn2 = book_db.get_connection()
    rows = conn2.execute(
        "SELECT month, COUNT(*) c FROM books WHERE month LIKE ? GROUP BY month ORDER BY month",
        (f"{YEAR}-%",)
    ).fetchall()
    print(f"\n{YEAR} 年月份分布：")
    for r in rows:
        print(f"  {r[0]}：{r[1]} 本")
    conn2.close()


if __name__ == "__main__":
    main()
