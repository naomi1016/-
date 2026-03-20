"""
TF-IDF 向量預運算腳本

讀取 public/books.json，為每本書計算 TF-IDF 向量，
輸出 public/embeddings.json 供瀏覽器端餘弦相似度搜尋使用。

執行方式：
    python3 generate_embeddings.py

每次更新 books.json 後（enrich_books.py / update_books.py）都應重新執行。
預計執行時間：約 10–30 秒
"""
import json, math, re
from collections import Counter, defaultdict

INPUT_FILE  = "public/books.json"
OUTPUT_FILE = "public/embeddings.json"

def tokenize(text: str) -> list:
    """中文字元 bigram + 單字元，英文以單詞為單位"""
    tokens = []
    # 中文 bigram
    chars = re.findall(r'[\u4e00-\u9fff]', text)
    for i in range(len(chars) - 1):
        tokens.append(chars[i] + chars[i + 1])
    tokens.extend(chars)               # 單字元也加入（支援短查詢）
    # 英文單詞
    tokens.extend(re.findall(r'[a-zA-Z]{2,}', text.lower()))
    return tokens

def build_doc(book: dict) -> str:
    """各欄位加權後串接（重複次數 = 權重）"""
    title  = book.get("title",       "") or ""
    author = book.get("author",      "") or ""
    desc   = book.get("description", "") or ""
    pub    = book.get("publisher",   "") or ""
    return " ".join([title]*3 + [author]*2 + [desc] + [pub])

def main():
    books = json.load(open(INPUT_FILE, encoding="utf-8"))
    N = len(books)
    print(f"書目數量：{N}")

    # ── Step 1: 計算各書 TF（normalized）────────────────
    all_tf: list[dict] = []
    df: dict = defaultdict(int)

    for book in books:
        tokens = tokenize(build_doc(book))
        tf_raw = Counter(tokens)
        total  = max(sum(tf_raw.values()), 1)
        tf_norm = {t: c / total for t, c in tf_raw.items()}
        all_tf.append(tf_norm)
        for t in tf_raw:
            df[t] += 1

    # ── Step 2: 計算 IDF 並剪枝（太罕見或太常見的詞去掉）────
    idf: dict = {}
    min_df = 2          # 至少出現在 2 本書
    max_df = N * 0.75   # 出現在 75% 以上的書（太通用）
    for term, freq in df.items():
        if min_df <= freq <= max_df:
            idf[term] = math.log(N / freq) + 1

    print(f"詞彙量（剪枝後）：{len(idf)}")

    # ── Step 3: 計算 TF-IDF 向量、L2 正規化、保留 top-80 詞 ──
    book_vecs = []
    for book, tf_norm in zip(books, all_tf):
        raw_vec: dict = {}
        for term, tf_val in tf_norm.items():
            if term in idf:
                raw_vec[term] = tf_val * idf[term]

        # L2 正規化
        norm = math.sqrt(sum(v * v for v in raw_vec.values())) or 1
        normed = {t: v / norm for t, v in raw_vec.items()}

        # 只保留權重最高的 80 個詞（控制 JSON 大小）
        top80 = dict(sorted(normed.items(), key=lambda x: -x[1])[:80])
        # 值取 4 位小數
        top80 = {t: round(v, 4) for t, v in top80.items()}

        book_vecs.append({
            "bibId": book.get("bibId", ""),
            "vec":   top80,
        })

    # ── Step 4: 輸出 ─────────────────────────────────────
    idf_out = {t: round(v, 4) for t, v in idf.items()}
    output  = {"idf": idf_out, "books": book_vecs}

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_kb = len(json.dumps(output, ensure_ascii=False)) / 1024
    print(f"✅ 已輸出 {OUTPUT_FILE}（約 {size_kb:.0f} KB）")

if __name__ == "__main__":
    main()
