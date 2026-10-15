# 行政小工具 (Admin Tools)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-orange.svg)](dist/work-tools/manifest.webmanifest)
[![Platform](https://img.shields.io/badge/Platform-Web%20%7C%20iOS%20%7C%20Android-lightgrey.svg)](https://works.workertool.workers.dev/)

> **15 天期限計算 ＋ 倉頡碼查詢** —— 專為行政辦公量身打造的極簡、高效、全功能單檔離線 PWA WebApp。

---

## 🌟 功能亮點

### 1. 📅 15 天期限計算 (澳門法定工作日)
- **合規計算**：發出當日不計入，由翌日起算；第 15 天若遇星期六、日或澳門公眾假期／補假／豁免上班日，自動順延至首個正常工作日。
- **日曆視覺化**：直觀標記「發出日」、「第 1–14 天」、「15 天期限」與「順延明細」，一目了然。
- **雙軌假期資料**：優先線上連線澳門政府公眾假期 iCal；離線或載入失敗時自動降級至內建備份表（已覆蓋 2026–2027 年）。
- **跨年防護**：如計算日期超出目前已知假期範圍，即時彈出提示，避免誤判。

### 2. 🔤 倉頡碼字典查詢
- **字庫齊全**：內建超過 70,000+ 字繁體與簡體字倉頡碼（五代／三代對照）。
- **字根拆解**：即時顯示英文字母碼與對應中文字根。
- **快速操作**：點擊卡片一鍵複製倉頡碼；支援繁簡快速切換與即時搜尋。

### 3. 📱 優秀的 PWA 體驗
- **離線可用**：Service Worker 快取核心資源，斷網照常開啟。
- **加到主畫面**：支援 iOS Safari 與 Android Chrome 加到主畫面，全螢幕無網址列，體驗媲美原生 App。
- **懸浮導航與手勢**：底部浮動 Tab 列，支援左右滑動切頁手勢，亦可一鍵縮小隱藏導航列。
- **零隱私追蹤**：100% 本地運算，不採集用戶輸入、無 Cookie、無第三方分析追蹤。

### 4. 🎨 現代復古與台灣質感設計體系
- 遵循嚴謹的 [`docs/設計規格.md`](docs/設計規格.md) 設計定稿。
- 暖紙底（`#faf6ee`）配墨字（`#2e2a24`）、宣紙質地卡片（`#fffdf8`）與現代水藍點綴（`#1e9ab8`）。
- 嚴格鎖定字級階梯（無 rem 殘留、固定 8px 圓角）。

---

## 🚀 在線體驗

- **Cloudflare Workers 線上版**：[https://works.workertool.workers.dev/](https://works.workertool.workers.dev/)
- **GitHub Pages 線上版**：可在本倉庫啟用 GitHub Pages 後直接造訪。

---

## 📁 專案目錄結構

```text
├── tobacco-15day.html         # 15天期限計算源碼（單頁含樣式與純邏輯）
├── cangjie.html               # 倉頡碼查詢源碼（含 70,000+ 字庫與字典引擎）
├── build_combo.py             # 兩頁合一構建腳本（注入 Tab、PWA SW、版本號）
├── dist/                      # 構建產物目錄
│   └── work-tools/            # 最終部署用完整 PWA 套件
│       ├── index.html         # 合併後的主頁面（單檔自包含）
│       ├── sw.js              # Service Worker 快取腳本
│       ├── manifest.webmanifest # PWA 安裝清單
│       ├── version.txt        # 版本輪詢標記
│       └── *.png              # PWA 圖示（192、512、maskable）
├── pwa/                       # PWA 模板與圖示生成器
├── docs/                      # 規格文檔
│   └── 設計規格.md             # 視覺色彩、圓角、排版定稿規範
├── verify_combo.js            # 本地 57+ 組功能與安全驗收測試
├── sweep_v191.js              # 日曆邊界 12 組全覆蓋測試
├── verify_prod.js             # 線上生產環境一致性校驗
├── publish_works.sh           # 一鍵構建與部署自動化腳本
└── .github/workflows/         # GitHub Actions 自動部署工作流
    └── deploy.yml             # 自動發佈到 GitHub Pages
```

---

## 🛠️ 本地開發與構建

### 1. 本地預覽
無需任何構建環境，直接以瀏覽器開啟 `dist/work-tools/index.html`，或啟動本機靜態伺服器：

```bash
# 使用 Python 內建伺服器
python -m http.server 8080 -d dist/work-tools
```
造訪 `http://localhost:8080` 即可預覽。

### 2. 構建 Combo 單檔
修改 `tobacco-15day.html` 或 `cangjie.html` 後，執行：

```bash
python build_combo.py
```
腳本會自動抽取兩頁樣式與邏輯，注入雙向滑動切換、版本檢測，並輸出至 `dist/work-tools/`。

### 3. 執行測試驗收
本專案自帶完備的自動化測試套件（基於 Node.js）：

```bash
# 執行核心功能、安全與版式驗收 (57+ 組)
node verify_combo.js

# 執行日曆跨月、跨年、節假日邊界測試 (12 組)
node sweep_v191.js
```

---

## 🚢 部署方式

### 方式 A：GitHub Pages (推薦)
本專案已配置 GitHub Actions 工作流（[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)）。
1. 將代碼推送到 GitHub 倉庫的 `main` 或 `master` 分支。
2. 進入倉庫 **Settings** → **Pages**。
3. 在 **Build and deployment** 下方的 **Source** 選擇 **GitHub Actions**。
4. 推送代碼後即會自動執行測試並部署至 `https://<你的帳號>.github.io/<倉庫名>/`。

### 方式 B：Cloudflare Workers / Cloudflare Pages
將 `dist/work-tools/` 目錄下的文件直接上傳至 Cloudflare Pages 或 Workers 靜態託管即可。

---

## 🔒 隱私與安全宣言

1. **本地執行**：所有日期運算與倉頡查碼完全在使用者本機端執行，不將任何查詢文字傳輸至遠端伺服器。
2. **零追蹤**：無任何分析埋點代碼、無使用者畫像分析。
3. **安全防護**：全站無 `eval()`、無外部未授權 CDN 注入，避免 XSS 與供應鏈風險。

---

## 📄 開源授權

本專案採用 [MIT License](LICENSE) 授權開放。
