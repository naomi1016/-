"""
神經網路向量預運算腳本（路線 B）

使用 sentence-transformers 的 paraphrase-multilingual-MiniLM-L12-v2 模型
將書目資料轉換成 384 維向量，輸出 public/neural_embeddings.json

安裝依賴：
    pip install sentence-transformers

執行方式：
    python3 generate_neural_embeddings.py

每次更新 books.json 後都應重新執行。
首次執行會下載模型約 500 MB，後續從快取載入只需 30 秒。
"""

import json
from sentence_transformers import SentenceTransformer

INPUT_FILE  = "public/books.json"
OUTPUT_FILE = "public/neural_embeddings.json"
MODEL_NAME  = "paraphrase-multilingual-MiniLM-L12-v2"


def build_doc(book: dict) -> str:
    """各欄位加權後串接（重複次數 = 權重）"""
    title  = book.get("title",       "") or ""
    author = book.get("author",      "") or ""
    desc   = book.get("description", "") or ""
    pub    = book.get("publisher",   "") or ""
    return " ".join([title] * 3 + [author] * 2 + [desc] + [pub])


def main():
    books = json.load(open(INPUT_FILE, encoding="utf-8"))
    N = len(books)
    print(f"書目數量：{N}")

    print(f"載入模型：{MODEL_NAME}")
    print("（首次執行會自動下載模型，約 500 MB，請稍候…）")
    model = SentenceTransformer(MODEL_NAME)

    docs = [build_doc(b) for b in books]

    print("計算向量中…")
    embeddings = model.encode(
        docs,
        show_progress_bar=True,
        normalize_embeddings=True,  # L2 正規化後，點積即等同餘弦相似度
        batch_size=64,
    )

    output = {
        "model": MODEL_NAME,
        "dim":   int(embeddings.shape[1]),
        "books": [
            {
                "bibId": b.get("bibId", ""),
                "vec":   [round(float(v), 5) for v in emb],
            }
            for b, emb in zip(books, embeddings)
        ],
    }

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))

    size_mb = len(json.dumps(output, ensure_ascii=False)) / 1024 / 1024
    print(f"✅ 已輸出 {OUTPUT_FILE}（約 {size_mb:.1f} MB）")


if __name__ == "__main__":
    main()
