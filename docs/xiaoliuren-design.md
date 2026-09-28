# 小六壬快速問事 — 設計文件

> 狀態：已定稿（2026-09-28 全部待確認事項拍板，見第 14、15 節），作為 v1 最終實作規格。
> 規格來源：使用者提供的產品需求（三數連續起課法）。本文件只記錄設計決策與與本 repo 現況的對照，不重抄需求。

## 1. 目標與範圍

- 純前端、無後端、可離線的「小六壬快速問事」工具：問題 → 三個數字 → 起課 → 三宮 → 本地解讀 → AI Prompt → 歷史／驗證。
- 起課結果一律由程式產生；AI 只能解讀，不能改盤。
- 嚴格分層：解析（parser）→ 起課（calculator）→ 六宮資料（palaces）→ 解讀（interpreter）→ Prompt（promptGenerator）→ 儲存（history / validator）→ UI（views）。核心層不得讀 DOM、不得呼叫 AI、必須 deterministic。

## 2. 架構決策（與本 repo 現況的對照）

需求書假設從零建一個 Vite 專案（`src/` + `dist/` + `DEPLOY.md`）。本 repo 的既有規範是：

| 面向 | 需求書 | 本 repo（AGENTS.md） |
|---|---|---|
| 建置 | Vite build → `dist/` | 無建置步驟，直接 ship HTML/JS |
| 模組 | ES modules（`import`） | 傳統 script 掛在 global，`file://` 可開 |
| 測試 | 需求未指定（Vite 慣用 vitest） | Node 內建 `node --test`，`tests/_load.js` 用 vm 載入頁面用的同一份 script |
| 部署 | 手動 FTP 上傳 `dist/` | `./ftp-sync.sh push`，遞迴同步 `.html/.js/.json/.css…`，排除 `scripts/`、`tests/`、`*.md` |
| 位置 | 網站根目錄 | 各工具為根目錄單頁 |

### 2.1 建議方案 A：本 repo 子資料夾、無建置（推薦）

```
xiaoliuren/
  index.html            # 單頁 App 殼 + hash router
  manifest.json
  sw.js                 # service worker，scope 僅限 /xiaoliuren/
  icons/                # PWA 圖示（192 / 512 / maskable / apple-touch）
  styles.css
  app.js                # 進入點：router、views 掛載
  xiaoliurenPalaces.js  # 六宮資料（global: XiaoLiuRenPalaces）
  xiaoliurenCore.js     # parser + calculator（global: XiaoLiuRenCore）
  xiaoliurenInterpreter.js
  xiaoliurenPrompt.js
  xiaoliurenStore.js    # history + validator（localStorage 序列化）
  views/                # home / result / history / validation / settings
tests/
  xiaoliurenCore.test.js
  xiaoliurenInterpreter.test.js
  xiaoliurenStore.test.js
```

- **為何用子資料夾而非根目錄單頁**：service worker 的 scope 是其所在目錄。若 `sw.js` 放在根目錄，會接管整站（JSON formatter、密碼產生器等）的請求並快取，這是不可接受的副作用。放在 `xiaoliuren/` 下 scope 自然只涵蓋本工具。`manifest.json` 的 `start_url` / `scope` 也同樣設為 `./`。
- **為何不用 Vite**：與 repo「無建置」原則一致；`ftp-sync.sh push` 直接同步即可，不需另寫 `DEPLOY.md`（現有 AGENTS.md 已涵蓋部署）。核心模組沿用 `liuyaoCore.js` 的 IIFE + global 寫法，測試用既有 `tests/_load.js` 模式，不新增任何相依。
- 需求書的 `src/…` 分層以「檔案 = 模組」方式保留，只是不透過 `import`，改由 `index.html` 依序載入。
- 相對路徑（`./`）一律使用，搬到任何子目錄都能開，滿足需求書「base: './'」的意圖。
- 首頁 `index.html` 加一筆連結到 `xiaoliuren/`。

### 2.2 替代方案 B：Vite 專案

放在 `xiaoliuren-src/`（含自己的 `package.json`），`vite build` 輸出到 `xiaoliuren/`，再由 `ftp-sync.sh` 同步。需把 `xiaoliuren-src/` 加入同步排除清單，測試改用 vitest。完全照需求書字面執行，但引入建置步驤與第二套測試工具，違反 repo 慣例。**不建議**，除非未來要拆成獨立站。

### 2.3 替代方案 C：獨立站（子網域）

同「ai 斗數」的做法另開 repo。本工具無後端、無金鑰，目前沒有必要；若之後要接 AI API adapter 且需 server-side proxy 保護金鑰，再考慮。

## 3. 核心演算法

### 3.1 起課（calculator）

```
PALACES = ['大安','留連','速喜','赤口','小吉','空亡']   // index 0–5
cur = 0
for n in numbers: cur = (cur + n - 1) % 6 ; push PALACES[cur]
```

- 輸入：正整數陣列，長度固定 3。
- 輸出結構照需求書第七節（`numbers`、`steps[{number,start,result}]`、`palaces`）。
- 九組固定測試盤已於 2026-09-28 用上述公式驗證全部吻合，將轉為 `tests/xiaoliurenCore.test.js` 的表格測試。
- 大數：JS 安全整數範圍內（≤ 2^53−1）以 `Number` 計算；超過則解析階段判為錯誤（見 3.2）。

### 3.2 解析（parser）

輸入先 `trim()`、全形數字與全形分隔符正規化為半形。

| 格式 | 判定 | 結果 |
|---|---|---|
| A：三個數字 | 以空白、`,`、`、`、`/`、`-`、`;` 任一分隔，恰好得到 3 個 token，且每個 token 為純數字 | 各 token 轉整數 |
| B：六位數 | 去除分隔符後恰為 6 位純數字且原字串無分隔符 | 每兩位切一段 |
| 其他 | — | `{ ok: false, error: '請輸入三個數字，或剛好六位數字' }` |

錯誤細分（顯示文案集中在 `app.js` 的 `MESSAGES` 常數）：

- 非數字字元
- 數量不是 3
- 含 0 或負數（例如六位數 `970085` 切出 `00`）— 整筆判錯，禁止 0 → 6 / 10 之類轉換（Q3 已確認）
- 超過安全整數範圍

parser 回傳 `{ ok, numbers, format: 'triple' | 'six-digit', error }`，不丟例外。

### 3.3 六宮資料（palaces）

每宮欄位照需求書第八節；另加設計所需欄位：

- `tone`: `'steady' | 'delay' | 'fast' | 'friction' | 'gain' | 'void'`（宮性標籤，供解讀引擎與矛盾判定用，不直接顯示為吉凶）
- `polarity`: `+1 | 0 | -1`（大安、速喜、小吉 = +1；留連、赤口 = 0；空亡 = −1）— 僅用於機械式初步矛盾偵測，不取代三宮解讀，UI 不顯示「吉／凶」二元字樣（Q5 已確認）。

## 4. 本地解讀引擎（interpreter）

不硬寫 6³ × 8 類 = 1,728 段文字，改採**組合式**：

1. **位置片段**：`positionText[palace][position][category]`，6 宮 × 3 位（前／中／後）× 8 類 = 144 段，每段一句完整自然語言。
2. **轉折規則**：相鄰兩宮的 `tone` 變化對應連接句，例如 `steady → fast`「之後步調會明顯加快」、`fast → friction`「但升溫後容易出現需要說清楚的摩擦」、`void → fast`「原本落空的部分可能突然重新啟動」。約 15–20 條，不分類別。
3. **特例覆寫**：少數具代表性的組合（如三宮同宮、`空亡 → 空亡 → x`）給整段手寫解讀，優先於組合結果。
4. 輸出：`{ summary, segments: [{ position, palace, keyword, text }], caveats[] }`。`caveats` 放「此為趨勢判讀，不指定單一結果」之類的固定提醒。

分類只影響第 1 點選用哪一組片段，**不進入 calculator**。文案由我先撰稿，須經你審閱後定稿。

## 5. AI Prompt 產生器

固定範本照需求書第十四節，另加：

- 分類、起課時間（台北時間，沿用 `Asia/Taipei`）、三宮的關鍵詞。
- 若此課為 Repeated Reading，附上 Primary Reading 的結果並註明「兩課若相斥，請如實指出矛盾，不得調和」。
- 只產生文字並複製到剪貼簿；不內建任何 API 呼叫。AI adapter 只保留介面 `AiAdapter = { name, interpret(prompt) }`，不接任何供應商、無 API Key UI、不存金鑰、不引外部 SDK（Q7 已確認）。

## 6. 資料模型（localStorage）

Key：`xiaoliuren.readings.v1`（陣列）、`xiaoliuren.settings.v1`。

```json
{
  "id": "uuid",
  "datetime": "2026-09-28T10:12:00+08:00",
  "question": "…",
  "questionKey": "正規化後用來比對『同一問題』的字串",
  "category": "work",
  "rawInput": "73 59 35",
  "numbers": [73, 59, 35],
  "palaces": ["大安", "小吉", "速喜"],
  "interpretation": "本地解讀全文快照",
  "isPrimary": true,
  "parentReadingId": null,
  "conflictWithPrimary": false,
  "verification": "pending | hit | partial | miss | contradiction",
  "notes": ""
}
```

- 需求書的 `whetherPrimary` / `parentQuestionId` 對應 `isPrimary` / `parentReadingId`（沿用 repo camelCase 慣例）。
- 另加 `method: "three-number-sequential"` 與 `steps`（三步起課過程）欄位；`method` 為未來支援其他流派預留，v1 只有這一個值。
- 儲存前做 schema 版本檢查；匯入 JSON 時逐筆驗證欄位型別，拒絕整包不合格的檔案，不部分寫入。
- 提供：列表、關鍵字搜尋（問題、備註）、單筆刪除、清除全部（二次確認）、匯出 JSON、匯入 JSON（合併、以 id 去重、逐筆驗證、寫入前預覽，Q8 已確認，細節見第 15 節）。

## 7. Primary / Repeated 與矛盾

- 「同一核心問題」= `questionKey` 相同，分類不參與比對（Q4 已確認）。`questionKey` = trim → 全形字元正規化（NFKC）→ 移除所有空白 → 移除句尾標點 → 英文轉小寫，保留實際文字內容；不做 NLP／模糊比對。
- 已有 Primary 時，起課前顯示「此問題已有第一課，建議不要重複起課」，並提供「仍要起課」按鈕；新課標記 `isPrimary: false`、`parentReadingId` 指向 Primary。
- 矛盾判定：Repeated 的第三宮 `polarity` 與 Primary 的第三宮 `polarity` 符號相反（+1 vs −1）→ `conflictWithPrimary: true`，結果頁顯示「結果存在矛盾，可信度下降。」。0（留連、赤口）視為中性／未定，不構成矛盾（Q5 已確認）。
- UI 不提供任何「合併兩課」功能，解讀文字也不會參照另一課。

## 8. 追問建議

結果頁提供「追問」區塊：列出建議追問（為什麼／障礙在哪裡／誰會主動／快還是慢／發展方式／現在狀態），點選後帶入首頁問題框並自動組成「〔原問題〕— 障礙在哪裡？」，`parentReadingId` 指向原課但 `isPrimary: true`（因為是不同問題）。同時列出「不建議追問」清單作為提醒，不做阻擋。

## 9. 驗證模式

- 每筆紀錄可標記：命中 1、部分命中 0.5、錯誤 0、矛盾 0、待驗證不計。
- 統計頁顯示：總題數、已驗證題數、命中率、部分命中率、矛盾率（分母皆為已驗證題數）。
- 不加時間鎖：任何紀錄建立後皆可立即手動標記，預設 `pending`（Q6 已確認）。「未來題不得預先算命中」由「待驗證不計分」滿足，系統不自行判斷可否驗證。
- 統計欄位見第 15 節額外決策 4。

## 10. UI 與路由

Hash router：`#/`（首頁）、`#/result/:id`、`#/history`、`#/validation`、`#/settings`。無 hash 或未知路徑導回首頁，不依賴 server rewrite。

- 首頁：問題框（`textarea`，自動長高）、分類選單、數字框（`inputmode="numeric"`、`pattern="[0-9 ,/、-]*"`）、「起課」大按鈕。已有 Primary 時在按鈕上方顯示提示。
- 結果頁：問題、分類、三數、三宮縱向卡片（前／中／後 + 關鍵詞）、整體解讀、四個動作：複製 AI Prompt、追問、保存（預設已保存，此鈕改為「加備註」）、驗證標記。
- 歷史頁：搜尋框、列表（時間、問題、三宮、Primary／Repeated 標籤、驗證狀態）、匯出／匯入／清除。
- 驗證頁：統計卡 + 待驗證清單。
- 設定頁：主題（跟隨系統／淺／深）、資料管理捷徑、版本資訊。
- 樣式：mobile first、`env(safe-area-inset-*)`、無橫向溢出、`prefers-color-scheme` + 手動切換（存 `settings`）、色票沿用蓍草頁的 `--ink / --accent / --paper` 命名。文案集中於 `MESSAGES` 常數，所有動態內容輸出前經 `escapeHtml`。

## 11. PWA

- `manifest.json`：`name`、`short_name`、`start_url: './'`、`scope: './'`、`display: standalone`、`theme_color`、icons。
- `sw.js`：install 時預快取 App shell（本目錄所有靜態檔）；fetch 採 cache-first，版本字串變動即清舊快取。不快取跨目錄資源。無外部 CDN 相依，離線可完整起課、查歷史、看解讀、產生 Prompt。
- 頁面加 `<link rel="manifest">`、`apple-touch-icon`、`theme-color` meta。

## 12. 測試

沿用 `node --test`，新增 `tests/_loadXiaoliuren.js` 以 vm 載入 `xiaoliuren/*.js`：

- parser：格式 A 各分隔符、格式 B 六位數（含 `03` → 3）、全形輸入、錯誤格式、0／負數、超大整數、四個數字、五位數。
- calculator：九組固定測試盤、determinism（同輸入重跑 100 次）、`steps.start` 鏈接正確。
- interpreter：每宮 × 位置 × 分類皆有非空文案、特例覆寫生效、分類不改變 `palaces`。
- store：序列化往返、匯入驗證拒絕壞資料、Primary／Repeated 判定、矛盾判定、驗證統計。
- prompt：含問題、數字、三宮、不得重算聲明。

## 13. 部署與文件

- `./ftp-sync.sh push` 即可，`xiaoliuren/` 內所有 `.html/.js/.json/.css/.png` 皆在同步白名單。
- 更新 `AGENTS.md`：加入 `xiaoliuren/` 模組說明、SW scope 注意事項、analytics 是否載入。
- 不另寫 `DEPLOY.md` / `README.md`（repo 以 AGENTS.md 為單一文件，Q1 已確認）。

## 14. 待確認事項（已全部確認，2026-09-28）

| # | 問題 | 決策 | 日期 |
|---|---|---|---|
| Q1 | 架構 | **方案 A**：本 repo 子資料夾、無建置、無 Vite、不新增 package.json／vitest，沿用 `node --test`；模組以 IIFE + global 暴露、傳統 `<script>` 載入；文件統一寫進 `AGENTS.md`，不另寫 README／DEPLOY。 | 2026-09-28 |
| Q2 | 路徑與名稱 | 資料夾 `xiaoliuren/`；首頁連結與 App 名稱「小六壬快速問事」；PWA `short_name`「小六壬」。 | 2026-09-28 |
| Q3 | 0 與負數 | 一律輸入錯誤，合法數字必須 ≥ 1；六位數切出 `00` 整筆判錯；禁止任何 0 → 6／10 轉換。 | 2026-09-28 |
| Q4 | 同一問題判定 | 正規化後完全相同即同一問題，分類不參與；正規化 = trim、全形正規化、移除所有空白、移除句尾標點、英文統一大小寫；不做 NLP／embedding／模糊比對。 | 2026-09-28 |
| Q5 | 矛盾判定 | 第三宮為主結果宮；polarity 大安／速喜／小吉 +1、留連／赤口 0、空亡 −1；Primary 與 Repeated 第三宮 +1 vs −1 → `conflictWithPrimary = true`；留連／赤口中性不判矛盾；只做機械式初步偵測，不取代三宮解讀。 | 2026-09-28 |
| Q6 | 驗證時間鎖 | 不加。建立後即可手動標記五種狀態，預設 `pending`，系統不自行判斷可否驗證。 | 2026-09-28 |
| Q7 | AI adapter | 只留介面 `AiAdapter = { name, interpret(prompt) }`；不接 OpenAI／Anthropic／Gemini、無 API Key UI、不存金鑰、無外部 SDK。v1 唯一 AI 功能是產生 Prompt 並複製。 | 2026-09-28 |
| Q8 | 匯入策略 | 合併匯入、以 id 去重、相同 id 跳過不覆寫；整份 JSON 無法解析則整份拒絕；結構正確但個別 record 不合法時，預覽列出錯誤筆，正式匯入只寫合法筆；不靜默修正（含 `palaces` 與 `numbers` 不一致者一律判為不合法）。預覽顯示總筆數／可匯入／已存在／錯誤筆數，確認後才寫入。寫入後執行關係整理：同 `questionKey` 以最早一筆為 Primary，其餘為 Repeated 並重算矛盾，指向不存在紀錄的 `parentReadingId` 設為 null；預覽頁有明示，完成 toast 回報整理筆數。 | 2026-09-28 |
| Q9 | Analytics | 載入 `../analytics.js`，做法與六爻頁一致。只送 page view 與功能名稱（切頁、起課、複製 Prompt、看歷史、看驗證、PWA install）；禁送問題全文、報數、結果與問題的綁定、notes、匯入匯出內容、任何 localStorage 資料。 | 2026-09-28 |
| Q10 | 分類 | 固定 8 類：`work` 工作、`relationship` 感情、`money` 財運、`sideproject` 副業、`social` 人際、`study` 學習、`competition` 比賽、`general` 一般事件。去留通常歸工作、專案依職場／個人歸工作／副業，皆由使用者自選。分類只影響 interpreter，絕不影響 calculator。 | 2026-09-28 |
| Q11 | 解讀文案 | 由 Agent 先完整撰寫 v1（6 宮 × 3 位 × 8 類、轉折規則、代表性特例），不阻塞開發；使用者實際使用後再校正。文案守則：不只輸出吉凶、不過度斷言、空亡≠結束、赤口≠壞事、速喜≠長期成功、大安≠巨大成功、小吉不誇大、留連保留拖延／牽掛／反覆核心、三宮呈現前→中→後。 | 2026-09-28 |
| Q12 | 深色模式 | 跟隨系統／淺色／深色三段，預設跟隨系統，存 `xiaoliuren.settings.v1`；跟隨系統時用 `prefers-color-scheme`；切換不重新整理。 | 2026-09-28 |

## 15. 額外決策（2026-09-28 確認）

1. **Service Worker**：`/xiaoliuren/sw.js`，scope 僅 `/xiaoliuren/`；不得接管根目錄或其他工具。禁止快取 repo 其他資料夾、analytics endpoint、外站、未來 AI API。App shell 採 cache-first。
2. **歷史紀錄是核心功能**：起課完成即自動保存，結果頁不設「儲存」而是「加備註」。刪除 Repeated 不影響 Primary；指向該 Repeated 的追問改指向其 Primary。刪除 Primary 而仍有同 `questionKey` 的 Repeated 時，最早一筆 Repeated 自動升為 Primary（`isPrimary = true`、`parentReadingId = null`），其餘 Repeated 的 `parentReadingId` 改指向新 Primary 並重算 `conflictWithPrimary`；指向被刪紀錄的追問（不同 `questionKey`）改指向新 Primary，若無可承接者則設為 `null`。不留 orphan relation。
3. **追問是新問題**：如「今年副業會成功嗎 — 障礙在哪裡？」屬新 Primary Reading，`isPrimary = true`，可保留 `parentReadingId` 指向來源課。只有 `questionKey` 相同才是 Repeated Reading。
4. **驗證統計**：已驗證 = `hit`、`partial`、`miss`、`contradiction`（不含 `pending`）。分數 hit 1、partial 0.5、miss 0、contradiction 0。顯示：總題數、待驗證、已驗證、命中數、部分命中數、錯誤數、矛盾數、加權命中率 `(hit + partial × 0.5) / verified`、完全命中率 `hit / verified`、矛盾率 `contradiction / verified`。
5. **演算法不可修改**：`PALACES = ['大安','留連','速喜','赤口','小吉','空亡']`，`nextIndex = (currentIndex + number - 1) % 6`，第一數自大安起，第二、三數自前一宮起。不得改為各自 mod 6、加年月日時、加農曆、加五行、依分類或 AI 修改。其他流派須以新的 `method` 加入。
6. **固定 Regression Tests**：第 3.1 節九組測試永久保留於 `tests/xiaoliurenCore.test.js`；任何重構使其中一組改變即測試失敗，不得修改 expected。
7. **完成標準**：不只 skeleton；`node --test` 全過；確認 `xiaoliuren/index.html` 可開、HTTP 靜態部署、hash router、localStorage、manifest、SW scope、手機 viewport、深淺色、匯出匯入、Primary／Repeated、矛盾偵測、驗證統計、Prompt 複製、analytics 不含問題內容。

## 16. 實作與驗證紀錄（2026-09-28）

- 檔案：`xiaoliuren/`（index.html、styles.css、app.js、manifest.json、sw.js、xiaoliurenPalaces.js、xiaoliurenCore.js、xiaoliurenInterpreter.js、xiaoliurenPrompt.js、xiaoliurenStore.js、views/{home,result,history,validation,settings}.js、icons/）；`tests/_loadXiaoliuren.js` 與四份 `tests/xiaoliuren*.test.js`；`index.html` 首頁連結；`AGENTS.md` 模組說明。
- `node --test tests/*.test.js`：130 tests 全數通過（含九組固定 regression）。
- 瀏覽器（Chrome，本機 http 靜態伺服）實測：起課 → 結果頁；同問題重複起課先提示、force 後標記 Repeated 並偵測矛盾；追問成為新 Primary 並保留來源；複製 Prompt；加備註；驗證標記與統計；匯入預覽（總筆數／可匯入／重複／錯誤）與合併寫入；刪除 Primary 後最早 Repeated 升格、追問改指向；主題三段切換不重新整理；390px 視口三頁皆無橫向溢出；SW scope 為 `/xiaoliuren/`，快取 19 個 shell 檔且不含上層資源；以 stub 攔截 gtag 確認事件只有 `xiaoliuren_*` 名稱與 `{ tool }`，不含問題或數字。
- 已知限制：iOS 數字鍵盤（`inputmode="numeric"`）沒有空白與逗號，手機建議直接輸入六位數；主題切換後 `theme-color` 以當前背景色更新，部分瀏覽器僅在 PWA 模式反映；SW 版本需手動改 `VERSION`；`file://` 開啟時 SW 不註冊但其餘功能可用。
