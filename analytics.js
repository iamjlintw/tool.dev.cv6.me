/**
 * Google Analytics 4 共用載入器
 *
 * 使用方式：在頁面 <head> 內加入
 *     <script src="analytics.js"></script>
 *
 * 隱私原則（請務必遵守）：
 * - 只追蹤 page_view，不傳送任何使用者輸入的內容。
 * - 卦象、問事內容、密碼、貼上的 JSON / Markdown 一律不得作為事件參數送出。
 * - 需要自訂事件時，只送不含內容的操作名稱（例如按鈕名稱）。
 */
(function () {
    // GA4 評估 ID。此值本來就會公開在前端原始碼，不屬於機密。
    const MEASUREMENT_ID = 'G-XXXXXXXXXX';

    // 只在正式站啟用，本機開發（localhost / file://）不送出資料。
    const ENABLED_HOSTS = ['tool.dev.cv6.me'];

    if (ENABLED_HOSTS.indexOf(location.hostname) === -1) {
        return;
    }

    if (!MEASUREMENT_ID || MEASUREMENT_ID.indexOf('X') !== -1) {
        console.warn('[analytics] 尚未設定 GA4 評估 ID，追蹤未啟用。');
        return;
    }

    // 動態載入 gtag.js，讓 ID 只需維護一處。
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(MEASUREMENT_ID);
    document.head.appendChild(script);

    window.dataLayer = window.dataLayer || [];
    function gtag() {
        window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', MEASUREMENT_ID, {
        // 關閉 Google 廣告訊號與個人化廣告，降低個資疑慮。
        allow_google_signals: false,
        allow_ad_personalization_signals: false,
        // 網址不帶查詢字串，避免頁面參數意外把使用者輸入帶進報表。
        page_location: location.origin + location.pathname
    });
})();
