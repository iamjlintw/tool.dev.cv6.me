/**
 * 首頁：問題輸入 → 分類 → 三個數字 → 起課。
 * 已有第一課時先提示，使用者可選擇仍要起課（標記為重複起課）。
 */
(function () {
    'use strict';

    window.XiaoLiuRenViews = window.XiaoLiuRenViews || {};

    window.XiaoLiuRenViews.home = {
        title: '問事',
        render(root, params, app) {
            const { MESSAGES: M, Core, Interpreter, store, esc } = app;
            const follow = app.state.pendingFollowUp;

            const categoryOptions = Core.CATEGORIES.map(
                (c) =>
                    `<option value="${c.id}"${follow && follow.category === c.id ? ' selected' : ''}>${esc(c.label)}</option>`,
            ).join('');

            root.innerHTML = `
                <section class="panel">
                    <h1 class="hero-title">${M.askTitle}</h1>
                    ${
                        follow
                            ? `<div class="notice" id="followNotice">
                                   <p class="small"><strong>${M.followUpFrom}：</strong>${esc(follow.sourceQuestion)}</p>
                                   <button type="button" class="link small" id="clearFollow">${M.clearFollowUp}</button>
                               </div>`
                            : ''
                    }
                    <form id="castForm" novalidate>
                        <div class="field">
                            <label for="question">問題</label>
                            <textarea id="question" name="question" placeholder="${M.questionPlaceholder}" autocomplete="off" required>${esc(
                                follow ? follow.question : '',
                            )}</textarea>
                        </div>
                        <div class="field">
                            <label for="category">問題類型</label>
                            <select id="category" name="category">${categoryOptions}</select>
                            <p class="hint">分類只影響解讀文案，不影響起課。</p>
                        </div>
                        <div class="field">
                            <label for="numbers">${M.numbersLabel}</label>
                            <input id="numbers" name="numbers" class="numbers" type="text" inputmode="numeric" autocomplete="off" enterkeyhint="go" placeholder="${M.numbersPlaceholder}" />
                            <p class="hint">${M.numbersHint}</p>
                            <div class="actions" style="margin-top:8px">
                                <button type="button" id="randomButton" class="small">${M.randomNumbers}</button>
                                <span id="randomFlag" class="badge" hidden>${M.randomBadge}</span>
                            </div>
                            <p class="hint">${M.randomHint}</p>
                        </div>
                        <div id="formError" class="error" role="alert" hidden></div>
                        <div id="primaryNotice" class="notice" hidden></div>
                        <button type="submit" class="primary block" id="castButton">${M.cast}</button>
                    </form>
                </section>
                <section class="panel small muted">
                    <p><strong>怎麼問比較準：</strong>一次只問一件事、一個核心問題；心裡默念問題後，寫下浮現的三個數字。</p>
                    <p>三宮依序代表：前段（背景）→ 中段（核心發展）→ 後段（後續趨勢）。同一問題以第一課為準。</p>
                </section>
            `;

            const form = root.querySelector('#castForm');
            const questionEl = root.querySelector('#question');
            const categoryEl = root.querySelector('#category');
            const numbersEl = root.querySelector('#numbers');
            const errorEl = root.querySelector('#formError');
            const noticeEl = root.querySelector('#primaryNotice');
            const clearFollow = root.querySelector('#clearFollow');
            const randomButton = root.querySelector('#randomButton');
            const randomFlag = root.querySelector('#randomFlag');
            // 數字是否由「產生隨機數」填入；使用者手動改動後即視為直覺輸入
            let numbersFromRandom = false;

            randomButton.addEventListener('click', () => {
                numbersEl.value = Core.randomNumbers().join(' ');
                numbersFromRandom = true;
                randomFlag.hidden = false;
                showError('');
                app.track('xiaoliuren_random_numbers');
            });

            if (clearFollow) {
                clearFollow.addEventListener('click', () => {
                    app.state.pendingFollowUp = null;
                    app.render();
                });
            }

            function showError(message) {
                errorEl.textContent = message;
                errorEl.hidden = !message;
            }

            function hideNotice() {
                noticeEl.hidden = true;
                noticeEl.innerHTML = '';
            }

            function cast(force) {
                const question = questionEl.value.trim();
                const category = categoryEl.value;
                const parsed = Core.parseInput(numbersEl.value);
                if (!question) {
                    showError(M.questionRequired);
                    questionEl.focus();
                    return;
                }
                if (!parsed.ok) {
                    showError(parsed.message);
                    numbersEl.focus();
                    return;
                }
                showError('');

                const calc = Core.calculateXiaoLiuRen(parsed.numbers);
                const interpretation = Interpreter.interpret(calc.palaces, category);
                const result = store.addReading(
                    {
                        question,
                        category,
                        rawInput: (numbersFromRandom ? Core.RANDOM_PREFIX : '') + numbersEl.value.trim(),
                        numbers: calc.numbers,
                        palaces: calc.palaces,
                        interpretation: interpretation.summary,
                        parentReadingId: follow ? follow.parentId : null,
                    },
                    { force },
                );

                if (!result.ok && result.reason === 'HAS_PRIMARY') {
                    const p = result.primary;
                    noticeEl.innerHTML = `
                        <p><strong>${M.hasPrimary}</strong></p>
                        <p class="small">第一課（${esc(app.formatDateTime(p.datetime))}）：${app.chainHtml(p.palaces)}</p>
                        <div class="actions">
                            <a class="badge primary" href="#/result/${esc(p.id)}" style="align-self:center">${M.viewPrimary}</a>
                            <button type="button" id="forceCast">${M.castAgain}</button>
                        </div>`;
                    noticeEl.hidden = false;
                    noticeEl.querySelector('#forceCast').addEventListener('click', () => cast(true));
                    noticeEl.scrollIntoView({ block: 'nearest' });
                    return;
                }

                app.state.pendingFollowUp = null;
                app.track('xiaoliuren_cast');
                if (force) app.track('xiaoliuren_cast_repeated');
                app.navigate(`#/result/${result.record.id}`);
            }

            form.addEventListener('submit', (e) => {
                e.preventDefault();
                hideNotice();
                cast(false);
            });
            questionEl.addEventListener('input', hideNotice);
            numbersEl.addEventListener('input', () => {
                showError('');
                numbersFromRandom = false;
                randomFlag.hidden = true;
            });

            (follow ? numbersEl : questionEl).focus();
        },
    };
})();
