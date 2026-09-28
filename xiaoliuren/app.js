/**
 * 小六壬快速問事 — App 進入點
 *
 * 負責：hash router、view 掛載、主題、剪貼簿／下載、toast、analytics 包裝、service worker 註冊。
 * 起課／解讀／儲存邏輯全部在 xiaoliuren*.js 核心模組，這裡不重算任何盤。
 *
 * Analytics 原則：只送功能名稱（xiaoliuren_ 開頭），絕不送問題、數字、宮位、備註或任何 localStorage 內容。
 */
(function () {
    'use strict';

    const Palaces = window.XiaoLiuRenPalaces;
    const Core = window.XiaoLiuRenCore;
    const Interpreter = window.XiaoLiuRenInterpreter;
    const Prompt = window.XiaoLiuRenPrompt;
    const StoreModule = window.XiaoLiuRenStore;
    const Views = window.XiaoLiuRenViews || {};

    /** 顯示文案集中管理 */
    const MESSAGES = Object.freeze({
        appName: '小六壬快速問事',
        askTitle: '你想問什麼？',
        questionPlaceholder: '例如：這個案子下個月能不能談成？',
        questionRequired: '請先寫下你要問的事。',
        numbersLabel: '輸入三個直覺數字',
        numbersPlaceholder: '73 59 35 或 735935',
        numbersHint: '三個數字用空白或逗號分開，或直接輸入六位數（每兩位一組）。每個數字需大於等於 1。',
        randomNumbers: '產生三個隨機數',
        randomBadge: '隨機數',
        randomHint: '沒有直覺數字時可用隨機數（1～99），紀錄會標示為隨機產生。',
        cast: '起課',
        castAgain: '仍要起課（標記為重複起課）',
        hasPrimary: '此問題已有第一課，建議不要重複起課。',
        viewPrimary: '查看第一課',
        repeatedBadge: '重複起課',
        primaryBadge: '第一課',
        conflict: '結果存在矛盾，可信度下降。',
        conflictDetail: '本課第三宮與第一課第三宮方向相反。兩課請分別看待，不要把相反的結果解釋成一致。',
        copyPrompt: '複製 AI 解盤 Prompt',
        copied: '已複製到剪貼簿',
        copyFailed: '無法自動複製，請手動選取文字。',
        followUp: '追問',
        addNote: '加備註',
        saveNote: '儲存備註',
        noteSaved: '備註已儲存',
        verify: '驗證結果',
        notFound: '找不到這筆紀錄，可能已被刪除。',
        backHome: '回到問事',
        deleted: '已刪除',
        cleared: '已清除全部紀錄',
        exported: '已匯出 JSON',
        imported: '匯入完成',
        confirmDelete: '確認刪除',
        confirmClear: '確認清除全部',
        cancel: '取消',
        offlineReady: '已可離線使用',
        themeApplied: '主題已切換',
        followUpFrom: '追問自',
        clearFollowUp: '取消追問來源',
    });

    const store = StoreModule.createStore({ storage: window.localStorage });

    /* ------------------------------------------------------------------ */
    /* 小工具                                                              */
    /* ------------------------------------------------------------------ */

    const esc = (value) =>
        String(value == null ? '' : value).replace(
            /[&<>"']/g,
            (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
        );

    function formatDateTime(iso) {
        return Prompt.formatDateTime(iso).replace('（台北時間）', '');
    }

    let toastTimer = null;
    function toast(message) {
        const el = document.getElementById('toast');
        if (!el) return;
        el.textContent = message;
        el.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
    }

    function track(name) {
        if (typeof window.gtag !== 'function') return;
        if (!/^xiaoliuren_[a-z_]+$/.test(name)) return; // 只允許固定命名的功能事件
        try {
            window.gtag('event', name, { tool: 'xiaoliuren' });
        } catch (_err) {
            /* analytics 失敗不影響功能 */
        }
    }

    function copyText(text) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            return navigator.clipboard.writeText(text).then(
                () => true,
                () => legacyCopy(text),
            );
        }
        return Promise.resolve(legacyCopy(text));
    }

    function legacyCopy(text) {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            document.body.removeChild(ta);
            return ok;
        } catch (_err) {
            return false;
        }
    }

    function download(filename, text, type) {
        const blob = new Blob([text], { type: type || 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /* ------------------------------------------------------------------ */
    /* 共用片段                                                            */
    /* ------------------------------------------------------------------ */

    function chainHtml(palaces) {
        return (
            '<span class="inline-chain">' +
            palaces.map((p) => esc(p)).join('<span class="sep" aria-hidden="true">→</span>') +
            '</span>'
        );
    }

    function badgesHtml(record) {
        const parts = [];
        parts.push(
            record.isPrimary
                ? `<span class="badge primary">${MESSAGES.primaryBadge}</span>`
                : `<span class="badge repeated">${MESSAGES.repeatedBadge}</span>`,
        );
        if (record.conflictWithPrimary) parts.push('<span class="badge conflict">矛盾</span>');
        if (Core.isRandomRawInput(record.rawInput)) parts.push(`<span class="badge">${MESSAGES.randomBadge}</span>`);
        parts.push(`<span class="badge">${esc(Core.categoryLabel(record.category))}</span>`);
        const label = StoreModule.VERIFICATION_LABELS[record.verification] || record.verification;
        parts.push(`<span class="badge verify-${esc(record.verification)}">${esc(label)}</span>`);
        return `<div class="badges">${parts.join('')}</div>`;
    }

    function verificationHtml(record) {
        return (
            `<div class="segmented" role="group" aria-label="${MESSAGES.verify}" data-verify-group="${esc(record.id)}">` +
            StoreModule.VERIFICATIONS.map(
                (v) =>
                    `<button type="button" data-verify="${v}" data-id="${esc(record.id)}" aria-pressed="${
                        record.verification === v ? 'true' : 'false'
                    }">${esc(StoreModule.VERIFICATION_LABELS[v])}</button>`,
            ).join('') +
            '</div>'
        );
    }

    /** 綁定 root 內所有驗證按鈕，變更後呼叫 onChange(record)。 */
    function bindVerification(root, onChange) {
        root.querySelectorAll('[data-verify]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const updated = store.setVerification(btn.dataset.id, btn.dataset.verify);
                if (!updated) return;
                const group = root.querySelector(`[data-verify-group="${CSS.escape(updated.id)}"]`);
                if (group) {
                    group.querySelectorAll('[data-verify]').forEach((b) => {
                        b.setAttribute('aria-pressed', b.dataset.verify === updated.verification ? 'true' : 'false');
                    });
                }
                track('xiaoliuren_verify');
                if (onChange) onChange(updated);
            });
        });
    }

    /* ------------------------------------------------------------------ */
    /* 主題                                                                */
    /* ------------------------------------------------------------------ */

    function applyTheme(theme) {
        const html = document.documentElement;
        if (theme === 'light' || theme === 'dark') {
            html.setAttribute('data-theme', theme);
        } else {
            html.removeAttribute('data-theme');
        }
        updateThemeColor();
    }

    function updateThemeColor() {
        const bg = getComputedStyle(document.body).backgroundColor;
        document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
            m.setAttribute('content', bg);
        });
    }

    function setTheme(theme) {
        store.setSettings({ theme });
        applyTheme(theme);
    }

    /* ------------------------------------------------------------------ */
    /* Router                                                              */
    /* ------------------------------------------------------------------ */

    const ROUTES = { home: 'home', result: 'result', history: 'history', validation: 'validation', settings: 'settings' };

    function parseHash() {
        const raw = (location.hash || '').replace(/^#\/?/, '');
        const [path, query] = raw.split('?');
        const segments = path.split('/').filter(Boolean);
        const name = segments[0] || 'home';
        return {
            name: ROUTES[name] || 'home',
            params: segments.slice(1),
            query: new URLSearchParams(query || ''),
        };
    }

    function navigate(hash) {
        if (location.hash === hash) {
            render();
        } else {
            location.hash = hash;
        }
    }

    const app = {
        MESSAGES,
        store,
        Palaces,
        Core,
        Interpreter,
        Prompt,
        Store: StoreModule,
        state: { pendingFollowUp: null },
        esc,
        formatDateTime,
        toast,
        track,
        copyText,
        download,
        chainHtml,
        badgesHtml,
        verificationHtml,
        bindVerification,
        navigate,
        setTheme,
        render,
    };

    function render() {
        const route = parseHash();
        const view = Views[route.name] || Views.home;
        const root = document.getElementById('view');
        if (!root || !view) return;
        root.innerHTML = '';
        root.scrollTop = 0;
        document.querySelectorAll('.tabbar a').forEach((a) => {
            const active = a.dataset.route === route.name || (route.name === 'result' && a.dataset.route === 'home');
            if (active) a.setAttribute('aria-current', 'page');
            else a.removeAttribute('aria-current');
        });
        document.title = view.title ? `${view.title}｜${MESSAGES.appName}` : MESSAGES.appName;
        try {
            view.render(root, route.params, app, route.query);
        } catch (err) {
            root.innerHTML = `<section class="panel"><h2>頁面發生錯誤</h2><p class="muted">${esc(err && err.message)}</p><p><a href="#/">${MESSAGES.backHome}</a></p></section>`;
        }
        track(`xiaoliuren_view_${route.name}`);
        window.scrollTo(0, 0);
    }

    /* ------------------------------------------------------------------ */
    /* PWA                                                                 */
    /* ------------------------------------------------------------------ */

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        if (!/^https?:$/.test(location.protocol)) return; // file:// 不支援 SW，但頁面仍可用
        navigator.serviceWorker
            .register('./sw.js', { scope: './' })
            .then((reg) => {
                if (!navigator.serviceWorker.controller && reg.installing) {
                    reg.installing.addEventListener('statechange', (e) => {
                        if (e.target.state === 'activated') toast(MESSAGES.offlineReady);
                    });
                }
            })
            .catch(() => {
                /* SW 註冊失敗不影響功能 */
            });
    }

    window.addEventListener('appinstalled', () => track('xiaoliuren_pwa_installed'));

    /* ------------------------------------------------------------------ */
    /* 啟動                                                                */
    /* ------------------------------------------------------------------ */

    applyTheme(store.getSettings().theme);
    if (window.matchMedia) {
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', updateThemeColor);
    }
    window.addEventListener('hashchange', render);
    if (!location.hash) history.replaceState(null, '', '#/');
    render();
    registerServiceWorker();

    window.XiaoLiuRenApp = app;
})();
