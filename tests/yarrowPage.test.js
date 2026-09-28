/**
 * 頁面層測試：直接執行 liuyao-divination-yarrow.html 內的 script，
 * 以最小 DOM stub 驗證起卦時間固定、排盤接線、複製內容與重設清空。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { GanzhiCalendar, LiuyaoCore, LiuyaoPrompt } from './_load.js';

const html = readFileSync(new URL('../liuyao-divination-yarrow.html', import.meta.url), 'utf8');
const script = html.slice(
    html.indexOf('<script>', html.indexOf('</head>')) + '<script>'.length,
    html.lastIndexOf('</script>'),
);

/** 建一份剛載入完成的頁面實例，附上可觀察的 DOM stub。 */
function mountPage() {
    const elements = new Map();
    const makeElement = (id) => ({
        id,
        textContent: '',
        innerHTML: '',
        value: '',
        disabled: false,
        style: {},
        handlers: {},
        addEventListener(type, cb) {
            (this.handlers[type] = this.handlers[type] || []).push(cb);
        },
        fire(type, event) {
            for (const cb of this.handlers[type] || []) cb(event);
        },
    });

    const copied = [];
    const ready = [];
    const document = {
        getElementById(id) {
            if (!elements.has(id)) elements.set(id, makeElement(id));
            return elements.get(id);
        },
        addEventListener(type, cb) {
            if (type === 'DOMContentLoaded') ready.push(cb);
        },
        createElement: () => ({ value: '', select() {} }),
        body: { appendChild() {}, removeChild() {} },
        execCommand(command) {
            copied.push({ via: command });
        },
    };

    const window = {
        crypto: {
            getRandomValues(array) {
                for (let i = 0; i < array.length; i++) array[i] = Math.floor(Math.random() * 2 ** 32);
                return array;
            },
        },
    };

    const sandbox = {
        document,
        window,
        navigator: {
            clipboard: {
                writeText(text) {
                    copied.push({ via: 'clipboard', text });
                    return Promise.resolve();
                },
            },
        },
        GanzhiCalendar,
        LiuyaoCore,
        LiuyaoPrompt,
        setTimeout,
        clearTimeout,
        console,
        Date,
        Math,
        JSON,
        Uint32Array,
        Promise,
    };
    sandbox.window = window;
    sandbox.globalThis = sandbox;

    runInContext(script, createContext(sandbox));
    for (const cb of ready) cb();

    return { page: window.yarrowDivination, el: (id) => document.getElementById(id), copied };
}

test('頁面載入後即可取得實例，且尚未固定起卦時間', () => {
    const { page, el } = mountPage();
    assert.ok(page);
    assert.equal(page.divinationStartedAt, null);
    assert.equal(page.chart, null);
    assert.equal(el('copyJsonButton').disabled, true);
    assert.equal(el('copyPromptButton').disabled, true);
});

test('起卦時間在第一爻就固定，後續爻不再更動', () => {
    const { page } = mountPage();
    page.generateNext();
    const first = page.divinationStartedAt;
    assert.ok(first instanceof Date);
    page.generateNext();
    page.generateNext();
    assert.equal(page.divinationStartedAt, first);
    assert.equal(page.currentLine, 3);
});

test('蓍草演算法只產生 6/7/8/9，且逐爻明細保留', () => {
    const { page, el } = mountPage();
    for (let i = 0; i < 6; i++) page.generateNext();
    assert.equal(page.lines.length, 6);
    for (const value of page.lines) assert.ok([6, 7, 8, 9].includes(value));
    assert.equal(page.history.length, 6);
    assert.equal(page.history[0].rounds.length, 3);
    assert.ok(el('roundDetails').innerHTML.includes('第 3 操作'));
    assert.ok(el('historyList').innerHTML.includes('第 1 爻'));
    assert.equal(page.isComplete, true);
});

test('性別下拉會寫回實例並帶進盤面', () => {
    const { page, el } = mountPage();
    el('genderSelect').fire('change', { target: { value: 'male' } });
    assert.equal(page.gender, 'male');

    page.lines = [7, 6, 9, 8, 7, 8];
    page.divinationStartedAt = new Date('2026-09-05T14:12:02.711Z');
    page.displayHexagram();
    assert.equal(page.chart.gender, 'male');
    assert.equal(page.chart.roleMapping.target.primarySymbol, '妻財');
});

/** 用固定案例接上頁面，回傳掛好盤面的實例。 */
function mountWithCase() {
    const mounted = mountPage();
    mounted.el('questionInput').fire('input', { target: { value: '她心中的哪個人 是我還是他' } });
    mounted.page.lines = [7, 6, 9, 8, 7, 8];
    mounted.page.currentLine = 6;
    mounted.page.isComplete = true;
    mounted.page.divinationStartedAt = new Date('2026-09-05T14:12:02.711Z');
    mounted.page.displayHexagram();
    return mounted;
}

test('固定案例在頁面上呈現完整盤面', () => {
    const { page, el } = mountWithCase();
    assert.equal(page.chart.mainHexagram.name, '既濟');
    assert.ok(el('mainName').textContent.includes('既濟'));
    assert.ok(el('mainName').textContent.includes('坎宮三世卦'));
    assert.ok(el('changedName').textContent.includes('節'));
    assert.equal(el('changingLines').textContent, '變爻：第 2 爻、第 3 爻');
    assert.ok(el('timeBadge').textContent.includes('2026-09-05 22:12:02'));
    assert.ok(el('timeBadge').textContent.includes('壬午日'));
    assert.ok(el('xunkongBadge').textContent.includes('申、酉'));
});

test('表格含六神、六親、納甲、世應、動變與狀態欄', () => {
    const { el } = mountWithCase();
    const rows = el('hexagramBody').innerHTML;
    for (const text of ['上爻 (6)', '初爻 (1)', '玄武', '青龍', '白虎', '己卯', '戊子', '子孫', '官鬼', '兄弟', '父母']) {
        assert.ok(rows.includes(text), `表格缺少 ${text}`);
    }
    assert.ok(rows.includes('世'));
    assert.ok(rows.includes('應'));
    assert.ok(rows.includes('老陰動'));
    assert.ok(rows.includes('老陽動'));
    assert.ok(rows.includes('回頭剋'));
    assert.ok(rows.includes('妻財戊午')); // 伏神
    assert.ok(rows.includes('>空<')); // 旬空標記
    assert.ok(rows.includes('暗動'));
    // 由上而下顯示：上爻列在初爻之前
    assert.ok(rows.indexOf('上爻 (6)') < rows.indexOf('初爻 (1)'));
});

test('輸出區同時有摘要與完整 JSON', () => {
    const { el } = mountWithCase();
    const output = el('outputArea').textContent;
    assert.ok(output.includes('丙午年 丙申月 壬午日 辛亥時'));
    assert.ok(output.includes('旬空：申、酉'));
    assert.ok(output.includes('世爻：第3爻'));
    const json = JSON.parse(output.slice(output.indexOf('{')));
    assert.deepEqual(json.changingLines, [2, 3]);
    assert.equal(json.time.startedAtLocal, '2026-09-05 22:12:02');
    assert.equal(json.lines.length, 6);
    assert.equal(el('copyJsonButton').disabled, false);
    assert.equal(el('copyPromptButton').disabled, false);
});

test('兩顆複製按鈕分別送出 JSON 與解卦 Prompt', () => {
    const { el, copied } = mountWithCase();
    el('copyJsonButton').fire('click');
    el('copyPromptButton').fire('click');
    assert.equal(copied.length, 2);

    const json = JSON.parse(copied[0].text);
    assert.equal(json.mainHexagram.name, '既濟');
    assert.deepEqual(json.changingLines, [2, 3]);

    assert.ok(copied[1].text.includes('禁止自行重新起卦'));
    assert.ok(copied[1].text.includes('不得無條件直接指定為應爻'));
    assert.ok(copied[1].text.includes('"mainHexagram"'));
});

test('重設會清空起卦時間與完整盤面資料', () => {
    const { page, el } = mountWithCase();
    assert.ok(page.chart);
    page.reset();

    assert.equal(page.chart, null);
    assert.equal(page.divinationStartedAt, null);
    assert.deepEqual([...page.lines], []);
    assert.deepEqual([...page.history], []);
    assert.equal(page.currentLine, 0);
    assert.equal(page.isComplete, false);

    assert.equal(el('mainName').textContent, '主卦：—');
    assert.equal(el('changedName').textContent, '變卦：—');
    assert.equal(el('changingLines').textContent, '變爻：—');
    assert.equal(el('timeBadge').textContent, '起卦時間：—');
    assert.equal(el('xunkongBadge').textContent, '旬空：—');
    assert.ok(el('outputArea').textContent.startsWith('等待起卦完成'));
    assert.ok(el('hexagramBody').innerHTML.includes('尚無資料'));
    assert.equal(el('historyList').textContent, '尚無記錄');
    assert.equal(el('copyJsonButton').disabled, true);
    assert.equal(el('copyPromptButton').disabled, true);

    // 重設後再起卦會取得新的起卦時間
    page.generateNext();
    assert.ok(page.divinationStartedAt instanceof Date);
});

test('重設後重新起卦不會沿用舊盤面', () => {
    const { page } = mountWithCase();
    const before = page.chart.time.startedAtUtc;
    page.reset();
    page.lines = [7, 7, 7, 7, 7, 7];
    page.divinationStartedAt = new Date('2026-09-06T14:12:02.711Z');
    page.displayHexagram();
    assert.equal(page.chart.mainHexagram.name, '乾');
    assert.notEqual(page.chart.time.startedAtUtc, before);
    assert.equal(page.chart.time.dayGanzhi, '癸未');
});
