# schedule-app（PWA + Capacitor）

此專案已加入 PWA 與 Capacitor 基礎設定，可安裝到手機桌面，並可包成 iOS / Android App。

## 1) PWA（網頁可安裝）
- `manifest.webmanifest`：定義 App 名稱、圖示、啟動路徑。
- `sw.js`：快取 App Shell，提供基本離線能力。
- `pwa.js`：註冊 Service Worker。

## 2) Capacitor（打包成原生 App）

### 安裝依賴
```bash
npm install
```

### 初始化原生平台
```bash
npx cap add android
npx cap add ios
```

### 同步網頁資源
```bash
npx cap sync
```

### 開啟原生 IDE
```bash
npx cap open android
npx cap open ios
```

## 備註
- 目前 `webDir` 設定為專案根目錄 `.`，適合純前端靜態專案。
- 若後續改成框架建置（如 Vite `dist/`），請同步更新 `capacitor.config.ts` 的 `webDir`。
