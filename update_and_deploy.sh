#!/bin/bash
# 北圖新書通報 自動更新與部署腳本
# 每天中午 12:00 由 cron 自動執行
# 手動執行：bash update_and_deploy.sh

set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$PROJECT_DIR/logs"
LOG_FILE="$LOG_DIR/update_$(date +%Y%m%d_%H%M%S).log"

mkdir -p "$LOG_DIR"

# 所有輸出同時記錄到 log
exec > >(tee -a "$LOG_FILE") 2>&1

echo "=============================="
echo " 北圖新書通報 自動更新開始"
echo " $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================="

cd "$PROJECT_DIR"

# ── Step 1: 爬取最新書目 ──────────────────────────────
echo ""
echo "[1/4] 爬取最新書目..."
/usr/bin/python3 scrape_tpml.py
echo "✅ 書目爬取完成"

# ── Step 2: 萃取封面主色 ─────────────────────────────
echo ""
echo "[2/4] 萃取封面主色..."
/usr/bin/python3 extract_cover_colors.py
echo "✅ 封面主色萃取完成"

# ── Step 3: 建置前端 ─────────────────────────────────
echo ""
echo "[3/4] 建置前端..."
/usr/local/bin/npm run build
echo "✅ 前端建置完成"

# ── Step 4: 提交並推送至 GitHub ──────────────────────
echo ""
echo "[4/4] 推送至 GitHub..."

/usr/bin/git add public/books.json
/usr/bin/git diff --cached --quiet && {
  echo "ℹ️  書目無變動，跳過 commit"
} || {
  /usr/bin/git commit -m "chore: 自動更新書目 $(date '+%Y-%m-%d')"
  /usr/bin/git push origin main
  echo "✅ 已推送至 GitHub"
}

echo ""
echo "=============================="
echo " 全部完成 $(date '+%Y-%m-%d %H:%M:%S')"
echo "=============================="

# 清理 30 天前的舊 log
find "$LOG_DIR" -name "update_*.log" -mtime +30 -delete
