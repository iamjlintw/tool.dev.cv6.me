/**
 * 結果頁：問題、三數、三宮（前 → 中 → 後）、整體解讀、複製 Prompt、追問、加備註、驗證。
 * 起課完成時已由 store 保存，本頁不重算任何盤。
 */
(function () {
    'use strict';

    window.XiaoLiuRenViews = window.XiaoLiuRenViews || {};

    const FOLLOW_UPS = ['為什麼', '障礙在哪裡', '誰會主動', '大約快還是慢', '發展方式', '現在狀態'];
    const AVOID = ['再問一次會不會成功', '再問一次會不會復合', '再問一次會不會離職', '不斷重新問同一終局'];

    window.XiaoLiuRenViews.result = {
        title: '結果',
        render(root, params, app) {
            const { MESSAGES: M, store, Interpreter, Prompt, esc } = app;
            const record = store.get(params[0]);

            if (!record) {
                root.innerHTML = `<section class="panel"><p>${M.notFound}</p><p><a href="#/">${M.backHome}</a></p></section>`;
                return;
            }

            const reading = Interpreter.interpret(record.palaces, record.category);
            const primary = !record.isPrimary && record.parentReadingId ? store.get(record.parentReadingId) : null;
            const source = record.isPrimary && record.parentReadingId ? store.get(record.parentReadingId) : null;
            const repeated = record.isPrimary ? store.repeatedOf(record.id) : [];

            const palaceCards = reading.segments
                .map(
                    (s, i) => `
                    ${i > 0 ? '<div class="palace-arrow" aria-hidden="true">↓</div>' : ''}
                    <div class="palace-card">
                        <div class="pos">${esc(s.positionLabel)}<br /><span class="sr-only">${esc(s.positionRole)}</span></div>
                        <div class="name">${esc(s.palace)}</div>
                        <div class="keyword">${esc(s.keyword)}</div>
                    </div>`,
                )
                .join('');

            const segments = reading.segments
                .map(
                    (s) => `
                    <div class="segment">
                        <div class="seg-title">${esc(s.positionLabel)}：${esc(s.palace)}</div>
                        <div>${esc(s.text)}</div>
                    </div>`,
                )
                .join('');

            root.innerHTML = `
                <section class="panel">
                    ${app.badgesHtml(record)}
                    <h2 style="word-break:break-word">${esc(record.question)}</h2>
                    <p class="muted small">${esc(app.formatDateTime(record.datetime))}　·　${esc(app.Core.METHOD_LABEL)}</p>
                    <div class="numbers-display" aria-label="三個數字">${record.numbers.map(esc).join('　')}</div>
                    <ul class="steps">
                        ${record.steps
                            .map((st) => `<li>${esc(st.number)}：從${esc(st.start)}起 → ${esc(st.result)}</li>`)
                            .join('')}
                    </ul>
                    ${
                        source
                            ? `<p class="small muted">${M.followUpFrom}：<a href="#/result/${esc(source.id)}">${esc(source.question)}</a></p>`
                            : ''
                    }
                    ${
                        primary
                            ? `<div class="notice${record.conflictWithPrimary ? ' danger' : ''}">
                                   <p><strong>本課為同一問題的${M.repeatedBadge}。</strong>第一課（${esc(app.formatDateTime(primary.datetime))}）：${app.chainHtml(primary.palaces)}　<a href="#/result/${esc(primary.id)}">${M.viewPrimary}</a></p>
                                   ${record.conflictWithPrimary ? `<p><strong>${M.conflict}</strong> ${M.conflictDetail}</p>` : ''}
                               </div>`
                            : ''
                    }
                    ${
                        repeated.length
                            ? `<div class="notice"><p class="small">此問題另有 ${repeated.length} 次重複起課：${repeated
                                  .map(
                                      (r) =>
                                          `<a href="#/result/${esc(r.id)}">${app.chainHtml(r.palaces)}${r.conflictWithPrimary ? '（矛盾）' : ''}</a>`,
                                  )
                                  .join('、')}。以本課（第一課）為準。</p></div>`
                            : ''
                    }
                </section>

                <section class="panel">
                    <h2>三宮</h2>
                    <div class="palace-chain">${palaceCards}</div>
                    <div class="segments">${segments}</div>
                </section>

                <section class="panel reading-text">
                    <h2>整體解讀（${esc(reading.categoryLabel)}）</h2>
                    ${reading.paragraphs.map((p) => `<p>${esc(p)}</p>`).join('')}
                    <ul class="caveats">${reading.caveats.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
                </section>

                <section class="panel">
                    <div class="actions">
                        <button type="button" class="primary" id="copyPrompt">${M.copyPrompt}</button>
                        <button type="button" id="toggleFollow" aria-expanded="false" aria-controls="followPanel">${M.followUp}</button>
                        <button type="button" id="toggleNote" aria-expanded="false" aria-controls="notePanel">${M.addNote}</button>
                    </div>
                    <div id="followPanel" hidden style="margin-top:14px">
                        <h3>可以追問的方向</h3>
                        <p class="small muted">追問是新的問題，會以新的第一課保存，並記錄來源。</p>
                        <div class="chips">
                            ${FOLLOW_UPS.map((f) => `<button type="button" data-follow="${esc(f)}">${esc(f)}</button>`).join('')}
                        </div>
                        <h3 style="margin-top:12px">不建議追問</h3>
                        <ul class="avoid-list">${AVOID.map((a) => `<li>${esc(a)}</li>`).join('')}</ul>
                    </div>
                    <div id="notePanel" hidden style="margin-top:14px">
                        <label for="noteInput">備註</label>
                        <textarea id="noteInput" placeholder="事後補充、實際發生了什麼…">${esc(record.notes)}</textarea>
                        <div class="actions"><button type="button" id="saveNote">${M.saveNote}</button></div>
                    </div>
                </section>

                <section class="panel">
                    <h2>${M.verify}</h2>
                    <p class="small muted">已知答案的事件可立刻標記；未來事件先留待驗證。</p>
                    ${app.verificationHtml(record)}
                </section>
            `;

            root.querySelector('#copyPrompt').addEventListener('click', () => {
                const text = Prompt.buildPrompt(record, { primary });
                app.copyText(text).then((ok) => {
                    app.toast(ok ? M.copied : M.copyFailed);
                    if (ok) app.track('xiaoliuren_copy_prompt');
                });
            });

            const toggle = (btnId, panelId) => {
                const btn = root.querySelector(`#${btnId}`);
                const panel = root.querySelector(`#${panelId}`);
                btn.addEventListener('click', () => {
                    const open = panel.hidden;
                    panel.hidden = !open;
                    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
                    if (open) {
                        const focusable = panel.querySelector('textarea, button');
                        if (focusable) focusable.focus();
                    }
                });
            };
            toggle('toggleFollow', 'followPanel');
            toggle('toggleNote', 'notePanel');

            root.querySelectorAll('[data-follow]').forEach((btn) => {
                btn.addEventListener('click', () => {
                    app.state.pendingFollowUp = {
                        parentId: record.id,
                        sourceQuestion: record.question,
                        question: `${record.question} — ${btn.dataset.follow}？`,
                        category: record.category,
                    };
                    app.track('xiaoliuren_follow_up');
                    app.navigate('#/');
                });
            });

            root.querySelector('#saveNote').addEventListener('click', () => {
                store.setNotes(record.id, root.querySelector('#noteInput').value);
                app.toast(M.noteSaved);
            });

            app.bindVerification(root, (updated) => {
                const badges = root.querySelector('.badges');
                if (badges) badges.outerHTML = app.badgesHtml(updated);
            });
        },
    };
})();
