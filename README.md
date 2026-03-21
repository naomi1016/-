# 北圖本月新書通報

台北市立圖書館本月新進書目瀏覽器，支援語義搜尋、AI 摘要、色系篩選，並具備 PWA 離線功能。

---

## 專案結構

```
├── index.html          # 進入點
├── src/
│   ├── main.tsx        # React 根掛載
│   ├── App.tsx
│   ├── components/
│   └── hooks/
├── public/
│   └── books.json      # 書目資料（靜態）
├── vite.config.ts
└── package.json
```

---

## 環境變數

此專案在 **build 時**由 Vite 將環境變數注入至 bundle（透過 `vite.config.ts` 的 `define`），因此需要在 Vercel 後台設定以下變數：

| 變數名稱 | 用途 | 必填 |
|---|---|---|
| `GEMINI_API_KEY` | Google Gemini API，用於 AI 搜尋摘要與意圖分析 | 是 |

> **注意**：這個變數會在 build 時直接嵌入前端 bundle，請不要放入高敏感度的 API Key，並在 Google Cloud Console 限制該 Key 的允許來源（HTTP referrer）。

---

## 本地開發

```bash
# 安裝依賴
npm install

# 建立 .env 檔（參考以下格式）
echo "GEMINI_API_KEY=your_key_here" > .env

# 啟動開發伺服器
npm run dev
# → http://localhost:3000
```

---

## 透過 GitHub 連動 Vercel 自動佈署

### 1. 將專案推上 GitHub

```bash
git init
git add .
git commit -m "init"
# 在 GitHub 建立 repo 後：
git remote add origin https://github.com/你的帳號/repo名稱.git
git push -u origin main
```

### 2. 在 Vercel 匯入專案

1. 前往 [vercel.com](https://vercel.com) → **Add New Project**
2. 選擇你的 GitHub repo（需授權 Vercel 存取）
3. Vercel 會自動偵測 Vite，確認 Build 設定：
   - **Framework Preset**：Vite
   - **Build Command**：`npm run build`
   - **Output Directory**：`dist`
   - **Install Command**：`npm install`

### 3. 設定環境變數

在 **Configure Project** 頁面（或之後到 **Settings → Environment Variables**）新增：

| Key | Value | Environment |
|---|---|---|
| `GEMINI_API_KEY` | `你的 Gemini API Key` | Production, Preview, Development |

### 4. 完成佈署

點擊 **Deploy**。之後每次 `git push` 到 `main` branch，Vercel 會自動觸發重新 build 與佈署。

---

## 手動佈署（CLI，不透過 GitHub）

```bash
npm install -g vercel
vercel login
vercel --prod
```

佈署時 CLI 會詢問 Build 設定，照上方填入即可。環境變數可在 CLI 互動中設定，或之後到 Vercel Dashboard 補上。

---

## 技術棧

- **React 19** + **TypeScript**
- **Vite 6** + **Tailwind CSS 4**
- **Google Gemini API**（語義搜尋、AI 摘要）
- **@xenova/transformers**（本地 WASM embedding）
- **vite-plugin-pwa**（PWA 離線支援）
- **Fuse.js**（模糊搜尋）
