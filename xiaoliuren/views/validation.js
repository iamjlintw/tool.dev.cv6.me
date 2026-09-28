/**
 * 驗證頁：統計（總題數、待驗證、已驗證、各狀態數、加權命中率、完全命中率、矛盾率）＋逐筆標記。
 * 待驗證不計分；系統不自行判斷可否驗證。
 */
(function () {
    'use strict';

    window.XiaoLiuRenViews = window.XiaoLiuRenViews || {};

    const pct = (v) => (v === null ? '—' : `${Math.round(v * 1000) / 10}%`);

    window.XiaoLiuRenViews.validation = {
        title: '驗證',
        render(root, params, app) {
            const { store, esc } = app;

            root.innerHTML = `
                <section class="panel">
                    <h2>驗證統計</h2>
                    <div class="stats" id="stats"></div>
                    <p class="small muted" style="margin-top:10px">命中 1 分、部分命中 0.5 分、錯誤與矛盾 0 分、待驗證不計。比率皆以「已驗證」為分母。</p>
                </section>
                <section class="panel">
                    <h2>逐筆標記</h2>
                    <div class="field">
                        <label for="filterSelect">顯示</label>
                        <select id="filterSelect">
                            <option value="pending">待驗證</option>
                            <option value="all">全部</option>
                            <option value="verified">已驗證</option>
                        </select>
                    </div>
                    <ul class="record-list" id="verifyList"></ul>
                </section>
            `;

            const statsEl = root.querySelector('#stats');
            const listEl = root.querySelector('#verifyList');
            const filterEl = root.querySelector('#filterSelect');

            function renderStats() {
                const s = store.stats();
                const cell = (k, v, wide) => `<div class="stat${wide ? ' wide' : ''}"><div class="v">${v}</div><div class="k">${k}</div></div>`;
                statsEl.innerHTML = [
                    cell('總題數', s.total),
                    cell('待驗證', s.pending),
                    cell('已驗證', s.verified),
                    cell('命中', s.hit),
                    cell('部分命中', s.partial),
                    cell('錯誤', s.miss),
                    cell('矛盾', s.contradiction),
                    cell('加權命中率', pct(s.weightedHitRate)),
                    cell('完全命中率', pct(s.hitRate)),
                    cell('矛盾率', pct(s.contradictionRate)),
                ].join('');
            }

            function renderList() {
                const mode = filterEl.value;
                const rows = store.list().filter((r) => {
                    if (mode === 'pending') return r.verification === 'pending';
                    if (mode === 'verified') return r.verification !== 'pending';
                    return true;
                });
                if (!rows.length) {
                    listEl.innerHTML = `<li class="empty">${mode === 'pending' ? '沒有待驗證的紀錄。' : '沒有紀錄。'}</li>`;
                    return;
                }
                listEl.innerHTML = rows
                    .map(
                        (r) => `
                        <li class="record">
                            <a class="q" href="#/result/${esc(r.id)}">${esc(r.question)}</a>
                            <div class="meta">
                                <span>${esc(app.formatDateTime(r.datetime))}</span>
                                <span>${app.chainHtml(r.palaces)}</span>
                                ${r.isPrimary ? '' : '<span>重複起課</span>'}
                                ${r.conflictWithPrimary ? '<span class="badge conflict">矛盾</span>' : ''}
                            </div>
                            <div style="margin-top:8px">${app.verificationHtml(r)}</div>
                        </li>`,
                    )
                    .join('');
                app.bindVerification(listEl, () => {
                    renderStats();
                    if (filterEl.value !== 'all') renderList();
                });
            }

            filterEl.addEventListener('change', renderList);
            renderStats();
            renderList();
        },
    };
})();
