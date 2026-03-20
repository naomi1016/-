"""
書封主色萃取腳本
- 下載書封圖片（60×60），過濾白色背景後 K-Means 取主色
- 結果寫入 books.json 的 coverColor: [r, g, b]
- 已有 coverColor 的書自動跳過（可斷點續跑）
- 使用 ThreadPoolExecutor 並行下載，速度更快

用法：
    python3 extract_cover_colors.py
"""
import json, time
from typing import Optional
import numpy as np
import requests
from PIL import Image
from sklearn.cluster import MiniBatchKMeans
from io import BytesIO
from concurrent.futures import ThreadPoolExecutor, as_completed

INPUT_FILE  = "public/books.json"
OUTPUT_FILE = "public/books.json"
MAX_WORKERS = 12
TIMEOUT     = 8
IMG_SIZE    = 60   # 縮小至 60×60 加速運算
N_CLUSTERS  = 5    # K-Means 群數
WHITE_THRESHOLD = 230  # 高於此值的像素視為背景白色

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 Chrome/124.0 Safari/537.36"
}


def extract_dominant_color(url: str) -> Optional[list]:
    """下載圖片，過濾白色背景，K-Means 取最大群的中心色"""
    try:
        resp = requests.get(url, timeout=TIMEOUT, headers=HEADERS)
        if resp.status_code != 200:
            return None
        img = Image.open(BytesIO(resp.content)).convert("RGB")
        img = img.resize((IMG_SIZE, IMG_SIZE), Image.LANCZOS)
        arr = np.array(img).reshape(-1, 3).astype(float)

        # 過濾近白色背景（三通道都 > WHITE_THRESHOLD）
        mask = ~((arr[:, 0] > WHITE_THRESHOLD) &
                 (arr[:, 1] > WHITE_THRESHOLD) &
                 (arr[:, 2] > WHITE_THRESHOLD))
        filtered = arr[mask]
        if len(filtered) < 30:   # 幾乎全白封面，改用全圖
            filtered = arr

        km = MiniBatchKMeans(n_clusters=N_CLUSTERS, n_init=3, random_state=0)
        km.fit(filtered)

        # 找像素數最多的群
        labels    = km.labels_
        counts    = np.bincount(labels)
        dominant  = km.cluster_centers_[np.argmax(counts)]
        return [int(round(c)) for c in dominant]
    except Exception:
        return None


def process_book(book: dict) -> tuple:
    """回傳 (bibId, color)"""
    color = extract_dominant_color(book["coverUrl"])
    return book.get("bibId", ""), color


def main():
    with open(INPUT_FILE, encoding="utf-8") as f:
        books = json.load(f)

    # 篩出需要處理的書（有封面 & 尚未有主色）
    todo = [b for b in books if b.get("coverUrl") and not b.get("coverColor")]
    print(f"共 {len(books)} 本，需萃取：{len(todo)} 本，已有：{len(books)-len(todo)} 本")

    if not todo:
        print("全部完成，無需重跑。")
        return

    # bibId → 所有同 bibId 的書（可能重複跨月）
    from collections import defaultdict
    bid_to_books = defaultdict(list)
    for b in books:
        bid_to_books[b.get("bibId", "")].append(b)

    done = 0
    failed = 0
    start = time.time()

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(process_book, b): b for b in todo}
        for future in as_completed(futures):
            bid, color = future.result()
            if color:
                for bk in bid_to_books[bid]:  # 同步給所有同 bibId 的書
                    bk["coverColor"] = color
                done += 1
            else:
                failed += 1

            total_done = done + failed
            if total_done % 200 == 0 or total_done == len(todo):
                elapsed = time.time() - start
                rate = total_done / elapsed if elapsed > 0 else 0
                remaining = (len(todo) - total_done) / rate if rate > 0 else 0
                print(f"  {total_done}/{len(todo)}  成功 {done}  失敗 {failed}"
                      f"  {rate:.1f} 本/秒  剩餘約 {remaining:.0f} 秒")

    # 存回
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(books, f, ensure_ascii=False, separators=(",", ":"))

    elapsed = time.time() - start
    has_color = sum(1 for b in books if b.get("coverColor"))
    print(f"\n✅ 完成！耗時 {elapsed:.0f} 秒")
    print(f"   成功 {done}／失敗 {failed}／無封面 {len(books)-len(todo)-sum(1 for b in books if b.get('coverColor') and b not in todo)}")
    print(f"   coverColor 覆蓋率：{has_color}/{len(books)}（{has_color*100//len(books)}%）")


if __name__ == "__main__":
    main()
