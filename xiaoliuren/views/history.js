/**
 * 歷史頁：搜尋、列表、刪除（兩段式確認）、清除全部、匯出 JSON、匯入 JSON（先預覽再寫入）。
 */
(function () {
    'use strict';

    window.XiaoLiuRenViews = window.XiaoLiuRenViews || {};

    window.XiaoLiuRenViews.history = {
        title: '歷史紀錄',
        render(root, params, app, query) {
            const { MESSAGES: M, store, esc } = app;
            const keyword = query && query.get('q') ? query.get('q') : '';

            root.innerHTML = `
                <section class="panel">
                    <h2>歷史紀錄</h2>
                    <div class="field">
                        <label for="searchInput" class="sr-only">搜尋</label>
                        <input id="searchInput" type="search" placeholder="搜尋問題、備註或宮位" value="${esc(keyword)}" autocomplete="off" />
                    </div>
                    <div class="actions">
                        <button type="button" id="exportBtn">匯出 JSON</button>
                        <button type="button" id="importBtn">匯入 JSON</button>
                        <button type="button" class="danger" id="clearBtn">清除全部</button>
                    </div>
                    <input type="file" id="importFile" accept="application/json,.json" class="sr-only" tabindex="-1" />
                    <div id="importPreview" hidden style="margin-top:14px"></div>
                    <div id="clearConfirm" hidden style="margin-top:14px"></div>
                </section>
                <section>
                    <ul class="record-list" id="recordList"></ul>
                </section>
            `;

            const listEl = root.querySelector('#recordList');
            const searchEl = root.querySelector('#searchInput');

            function renderList() {
                const rows = store.search(searchEl.value);
                if (!rows.length) {
                    listEl.innerHTML = `<li class="empty">${searchEl.value.trim() ? '沒有符合的紀錄。' : '還沒有任何紀錄。<br /><a href="#/">去問第一件事</a>'}</li>`;
                    return;
                }
                listEl.innerHTML = rows
                    .map(
                        (r) => `
                        <li class="record" data-id="${esc(r.id)}">
                            <a class="q" href="#/result/${esc(r.id)}">${esc(r.question)}</a>
                            <div class="meta">
                                <span>${esc(app.formatDateTime(r.datetime))}</span>
                                <span>${app.chainHtml(r.palaces)}</span>
                            </div>
                            ${app.badgesHtml(r)}
                            ${r.notes ? `<p class="small muted" style="margin:0 0 6px">備註：${esc(r.notes)}</p>` : ''}
                            <div class="row">
                                <a class="small" href="#/result/${esc(r.id)}">查看</a>
                                <span class="delete-slot"><button type="button" class="small danger" data-delete="${esc(r.id)}">刪除</button></span>
                            </div>
                        </li>`,
                    )
                    .join('');

                listEl.querySelectorAll('[data-delete]').forEach((btn) => {
                    btn.addEventListener('click', () => {
                        const slot = btn.parentElement;
                        slot.innerHTML = `<button type="button" class="small danger" data-confirm-delete="${esc(btn.dataset.delete)}">${M.confirmDelete}</button> <button type="button" class="small" data-cancel-delete>${M.cancel}</button>`;
                        slot.querySelector('[data-confirm-delete]').addEventListener('click', (e) => {
                            const { promoted } = store.deleteReading(e.currentTarget.dataset.confirmDelete);
                            app.toast(promoted ? `${M.deleted}，最早的重複起課已升為第一課` : M.deleted);
                            app.track('xiaoliuren_delete');
                            renderList();
                        });
                        slot.querySelector('[data-cancel-delete]').addEventListener('click', renderList);
                        slot.querySelector('[data-confirm-delete]').focus();
                    });
                });
            }

            searchEl.addEventListener('input', renderList);
            renderList();

            /* ---------- 匯出 ---------- */
            root.querySelector('#exportBtn').addEventListener('click', () => {
                const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
                app.download(`xiaoliuren-readings-${stamp}.json`, store.exportJson());
                app.toast(M.exported);
                app.track('xiaoliuren_export');
            });

            /* ---------- 匯入 ---------- */
            const fileEl = root.querySelector('#importFile');
            const previewEl = root.querySelector('#importPreview');
            root.querySelector('#importBtn').addEventListener('click', () => fileEl.click());
            fileEl.addEventListener('change', () => {
                const file = fileEl.files && fileEl.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => showPreview(String(reader.result || ''), file.name);
                reader.onerror = () => showPreviewError('讀取檔案失敗。');
                reader.readAsText(file);
                fileEl.value = '';
            });

            function showPreviewError(message) {
                previewEl.hidden = false;
                previewEl.innerHTML = `<div class="notice danger"><p>${esc(message)}</p></div>`;
            }

            function showPreview(text, filename) {
                const preview = store.previewImport(text);
                if (!preview.ok) {
                    showPreviewError(preview.error);
                    return;
                }
                const invalidRows = preview.invalid
                    .slice(0, 20)
                    .map((i) => `<li>第 ${i.index + 1} 筆${i.id ? `（${esc(i.id)}）` : ''}：${esc(i.errors.join('；'))}</li>`)
                    .join('');
                previewEl.hidden = false;
                previewEl.innerHTML = `
                    <div class="notice">
                        <p><strong>匯入預覽</strong>　<span class="small muted">${esc(filename)}</span></p>
                        <table class="preview-table">
                            <tr><td>JSON 總筆數</td><td>${preview.total}</td></tr>
                            <tr><td>可匯入筆數</td><td>${preview.importable}</td></tr>
                            <tr><td>已存在相同 id（跳過）</td><td>${preview.duplicates}</td></tr>
                            <tr><td>錯誤筆數（不匯入）</td><td>${preview.invalid.length}</td></tr>
                        </table>
                        ${invalidRows ? `<ul class="invalid-list">${invalidRows}${preview.invalid.length > 20 ? '<li>…其餘略</li>' : ''}</ul>` : ''}
                        <p class="small muted">合併匯入：相同 id 不覆寫；匯入後會整理同一問題的第一課／重複起課關係。</p>
                        <div class="actions">
                            <button type="button" class="primary" id="confirmImport" ${preview.importable ? '' : 'disabled'}>確認匯入 ${preview.importable} 筆</button>
                            <button type="button" id="cancelImport">${M.cancel}</button>
                        </div>
                    </div>`;
                previewEl.querySelector('#cancelImport').addEventListener('click', () => {
                    previewEl.hidden = true;
                    previewEl.innerHTML = '';
                });
                previewEl.querySelector('#confirmImport').addEventListener('click', () => {
                    const result = store.commitImport(preview);
                    previewEl.hidden = true;
                    previewEl.innerHTML = '';
                    app.toast(
                        `${M.imported}：新增 ${result.added} 筆${result.relationsAdjusted ? `，整理 ${result.relationsAdjusted} 筆關係` : ''}`,
                    );
                    app.track('xiaoliuren_import');
                    renderList();
                });
            }

            /* ---------- 清除全部 ---------- */
            const clearEl = root.querySelector('#clearConfirm');
            root.querySelector('#clearBtn').addEventListener('click', () => {
                const total = store.list().length;
                clearEl.hidden = false;
                clearEl.innerHTML = `
                    <div class="notice danger">
                        <p>確定要刪除全部 ${total} 筆紀錄？此動作無法復原，建議先匯出 JSON。</p>
                        <div class="actions">
                            <button type="button" class="danger" id="confirmClear">${M.confirmClear}</button>
                            <button type="button" id="cancelClear">${M.cancel}</button>
                        </div>
                    </div>`;
                clearEl.querySelector('#cancelClear').addEventListener('click', () => {
                    clearEl.hidden = true;
                    clearEl.innerHTML = '';
                });
                clearEl.querySelector('#confirmClear').addEventListener('click', () => {
                    store.clearAll();
                    clearEl.hidden = true;
                    clearEl.innerHTML = '';
                    app.toast(M.cleared);
                    app.track('xiaoliuren_clear_all');
                    renderList();
                });
                clearEl.querySelector('#confirmClear').focus();
            });
        },
    };
})();
