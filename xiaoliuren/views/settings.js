/**
 * 設定頁：主題（跟隨系統／淺色／深色）、資料管理捷徑、關於本工具。
 * 不提供任何 AI 供應商或 API Key 設定。
 */
(function () {
    'use strict';

    window.XiaoLiuRenViews = window.XiaoLiuRenViews || {};

    const THEME_LABELS = { system: '跟隨系統', light: '淺色', dark: '深色' };

    window.XiaoLiuRenViews.settings = {
        title: '設定',
        render(root, params, app) {
            const { MESSAGES: M, store, Store, esc } = app;
            const settings = store.getSettings();
            const count = store.list().length;

            root.innerHTML = `
                <section class="panel">
                    <h2>外觀</h2>
                    <div class="radio-group" role="radiogroup" aria-label="主題">
                        ${Store.THEMES.map(
                            (t) => `
                            <label>
                                <input type="radio" name="theme" value="${t}" ${settings.theme === t ? 'checked' : ''} />
                                <span>${esc(THEME_LABELS[t])}</span>
                            </label>`,
                        ).join('')}
                    </div>
                    <p class="hint">跟隨系統時依裝置的深淺色設定自動切換。</p>
                </section>

                <section class="panel">
                    <h2>資料</h2>
                    <p class="small muted">所有紀錄只存在這個瀏覽器的 localStorage，不會上傳。目前共 ${count} 筆。</p>
                    <div class="actions">
                        <a class="badge" href="#/history" style="align-self:center;padding:10px 14px">前往歷史紀錄：匯出／匯入／清除</a>
                    </div>
                </section>

                <section class="panel">
                    <h2>AI 解讀</h2>
                    <p class="small">本版只提供「${M.copyPrompt}」：把排盤結果與規則整理成一段文字，貼到任何 AI 助手即可。不內建任何 AI 服務、不需要 API Key、不會上傳你的問題。</p>
                </section>

                <section class="panel">
                    <h2>關於</h2>
                    <p class="small">起課方式：三數連續起課法。六宮固定順序為大安 → 留連 → 速喜 → 赤口 → 小吉 → 空亡。第一數從大安起 1，第二、三數各從前一宮本身起 1。分類、日期、時辰都不影響起課。</p>
                    <p class="small">三宮解讀：前段（起因／背景）→ 中段（核心發展）→ 後段（後續趨勢）。同一問題以第一課為準；重複起課會被標記，若第三宮方向相反會提示矛盾。</p>
                    <p class="small muted">${M.appName}　·　純前端、可離線（PWA）。</p>
                </section>
            `;

            root.querySelectorAll('input[name="theme"]').forEach((input) => {
                input.addEventListener('change', () => {
                    app.setTheme(input.value);
                    app.toast(`${M.themeApplied}：${THEME_LABELS[input.value]}`);
                    app.track('xiaoliuren_theme');
                });
            });
        },
    };
})();
