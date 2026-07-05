"""
北圖新書通報 — SQLite 資料庫操作模組

所有 books 的讀寫都走這裡，public/books.json 只是給前端的匯出檔。
"""
import json
import sqlite3
import datetime

DB_PATH = "books.db"

_CREATE_TABLE = """
CREATE TABLE IF NOT EXISTS books (
    bibId        TEXT NOT NULL DEFAULT '',
    month        TEXT NOT NULL DEFAULT '',
    title        TEXT NOT NULL DEFAULT '',
    author       TEXT DEFAULT '',
    isbn         TEXT DEFAULT '',
    publisher    TEXT DEFAULT '',
    publishYear  INTEGER,
    callNumber   TEXT DEFAULT '',
    coverUrl     TEXT DEFAULT '',
    materialType TEXT DEFAULT '',
    language     TEXT DEFAULT '',
    branch       TEXT DEFAULT '',
    branches     TEXT DEFAULT '[]',
    description  TEXT DEFAULT '',
    authorDesc   TEXT DEFAULT '',
    coverColor   TEXT,
    createdAt    TEXT NOT NULL,
    updatedAt    TEXT NOT NULL,
    PRIMARY KEY (bibId, month)
)
"""

_UPSERT = """
INSERT INTO books (
    bibId, month, title, author, isbn, publisher, publishYear,
    callNumber, coverUrl, materialType, language,
    branch, branches, description, authorDesc, coverColor,
    createdAt, updatedAt
) VALUES (
    :bibId, :month, :title, :author, :isbn, :publisher, :publishYear,
    :callNumber, :coverUrl, :materialType, :language,
    :branch, :branches, :description, :authorDesc, :coverColor,
    :createdAt, :updatedAt
)
ON CONFLICT(bibId, month) DO UPDATE SET
    title        = excluded.title,
    author       = excluded.author,
    isbn         = excluded.isbn,
    publisher    = excluded.publisher,
    publishYear  = excluded.publishYear,
    callNumber   = excluded.callNumber,
    coverUrl     = excluded.coverUrl,
    materialType = excluded.materialType,
    language     = excluded.language,
    branch       = excluded.branch,
    branches     = excluded.branches,
    description  = CASE WHEN excluded.description != '' THEN excluded.description
                        ELSE books.description END,
    authorDesc   = CASE WHEN excluded.authorDesc != '' THEN excluded.authorDesc
                        ELSE books.authorDesc END,
    coverColor   = COALESCE(books.coverColor, excluded.coverColor),
    updatedAt    = excluded.updatedAt
"""


def _ensure_schema(conn):
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='books'"
    ).fetchone()
    if row is None:
        conn.execute(_CREATE_TABLE)
        conn.commit()
    elif "PRIMARY KEY (bibId, month)" not in (row[0] or ""):
        _migrate_to_composite_pk(conn)


def _migrate_to_composite_pk(conn):
    """將舊的 bibId 單一主鍵遷移至 (bibId, month) 複合主鍵。"""
    print("  📦 遷移 schema：bibId → (bibId, month) 複合主鍵…")
    conn.execute("ALTER TABLE books RENAME TO books_v1")
    conn.execute(_CREATE_TABLE.replace("IF NOT EXISTS ", ""))
    conn.execute("""
        INSERT OR IGNORE INTO books
        (bibId, month, title, author, isbn, publisher, publishYear,
         callNumber, coverUrl, materialType, language, branch, branches,
         description, authorDesc, coverColor, createdAt, updatedAt)
        SELECT bibId, month, title, author, isbn, publisher, publishYear,
               callNumber, coverUrl, materialType, language, branch, branches,
               description, authorDesc, coverColor, createdAt, updatedAt
        FROM books_v1
        WHERE bibId != '' AND month != ''
    """)
    count = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
    conn.commit()
    print(f"  ✅ 遷移完成：{count} 本書目已轉移（books_v1 備份保留）")


def get_connection(db_path=DB_PATH):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    _ensure_schema(conn)
    return conn


def upsert_books(conn, books):
    """將書目 list upsert 進 DB，保留已有的 coverColor / description。"""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    rows = [_to_row(b, now) for b in books if b.get("bibId") and b.get("month")]
    conn.executemany(_UPSERT, rows)
    conn.commit()
    return len(rows)


def get_all_books(conn, year=None):
    """回傳所有書目，格式與原本 JSON 相同。year 可傳入如 '2026' 來篩選特定年份。"""
    if year:
        rows = conn.execute(
            "SELECT * FROM books WHERE month LIKE ? ORDER BY month DESC, bibId ASC",
            (f"{year}-%",)
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM books ORDER BY month DESC, bibId ASC"
        ).fetchall()
    return [_to_dict(r) for r in rows]


def get_month_count(conn, month):
    row = conn.execute(
        "SELECT COUNT(*) FROM books WHERE month = ?", (month,)
    ).fetchone()
    return row[0]


def get_descriptions_by_bibid(conn):
    """回傳 {bibId: {description, authorDesc}}，用於跨月份保留書介。"""
    rows = conn.execute(
        """SELECT bibId, description, authorDesc FROM books
           WHERE (description != '' AND description IS NOT NULL)
              OR (authorDesc != '' AND authorDesc IS NOT NULL)"""
    ).fetchall()
    result = {}
    for r in rows:
        bid = r["bibId"]
        if bid not in result:
            result[bid] = {
                "description": r["description"] or "",
                "authorDesc":  r["authorDesc"] or "",
            }
        else:
            if r["description"] and not result[bid]["description"]:
                result[bid]["description"] = r["description"]
            if r["authorDesc"] and not result[bid]["authorDesc"]:
                result[bid]["authorDesc"] = r["authorDesc"]
    return result


def export_to_json(conn, output_path, year=None):
    """將 DB 書目匯出成 JSON，供前端使用。year 可傳入如 '2026' 只匯出該年書目。"""
    books = get_all_books(conn, year=year)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(books, f, ensure_ascii=False, indent=None, separators=(",", ":"))
    return len(books)


def sync_cover_colors(conn, books):
    """將 books list 中的 coverColor 同步回 DB（供 extract_cover_colors.py 呼叫）。"""
    now = datetime.datetime.now().isoformat(timespec="seconds")
    rows = [
        (json.dumps(b["coverColor"]) if b.get("coverColor") else None, now,
         b["bibId"], b.get("month", ""))
        for b in books if b.get("bibId")
    ]
    conn.executemany(
        "UPDATE books SET coverColor = COALESCE(?, coverColor), updatedAt = ? "
        "WHERE bibId = ? AND month = ?",
        rows,
    )
    conn.commit()


def migrate_from_json(conn, json_path):
    """首次執行時，從現有 JSON 遷移資料進 DB。之後自動跳過。"""
    count = conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]
    if count > 0:
        return
    try:
        with open(json_path, encoding="utf-8") as f:
            books = json.load(f)
        if books:
            upsert_books(conn, books)
            print(f"  📦 從 JSON 遷移 {len(books)} 本書目至 SQLite")
    except FileNotFoundError:
        pass


# ── 內部轉換 ──────────────────────────────────────────

def _to_row(book, now):
    return {
        "bibId":        book.get("bibId", ""),
        "month":        book.get("month", ""),
        "title":        book.get("title", ""),
        "author":       book.get("author", ""),
        "isbn":         book.get("isbn", ""),
        "publisher":    book.get("publisher", ""),
        "publishYear":  book.get("publishYear"),
        "callNumber":   book.get("callNumber", ""),
        "coverUrl":     book.get("coverUrl", ""),
        "materialType": book.get("materialType", ""),
        "language":     book.get("language", ""),
        "branch":       book.get("branch", ""),
        "branches":     json.dumps(book.get("branches", []), ensure_ascii=False),
        "description":  book.get("description", ""),
        "authorDesc":   book.get("authorDesc", ""),
        "coverColor":   json.dumps(book["coverColor"]) if book.get("coverColor") else None,
        "createdAt":    now,
        "updatedAt":    now,
    }


def _to_dict(row):
    d = dict(row)
    d["branches"] = json.loads(d.get("branches") or "[]")
    if d.get("coverColor"):
        d["coverColor"] = json.loads(d["coverColor"])
    else:
        d.pop("coverColor", None)
    d.pop("createdAt", None)
    d.pop("updatedAt", None)
    return d
