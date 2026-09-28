/**
 * 小六壬核心測試：解析、三數連續起課、固定 regression、問題正規化、矛盾判定。
 * 九組固定測試盤為永久 regression，不得修改 expected。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { XiaoLiuRenCore as Core, XiaoLiuRenPalaces as Palaces } from './_loadXiaoliuren.js';

const { parseInput, calculateXiaoLiuRen, normalizeQuestionKey, isConflicting, ERRORS } = Core;

/* ------------------------------------------------------------------ */
/* 固定 regression tests（額外決策 6）                                    */
/* ------------------------------------------------------------------ */

const REGRESSION = [
    [[38, 16, 12], ['留連', '小吉', '赤口']],
    [[26, 84, 37], ['留連', '大安', '大安']],
    [[73, 59, 35], ['大安', '小吉', '速喜']],
    [[91, 96, 17], ['大安', '空亡', '赤口']],
    [[24, 61, 62], ['空亡', '空亡', '大安']],
    [[14, 30, 5], ['留連', '大安', '小吉']],
    [[15, 63, 9], ['速喜', '小吉', '大安']],
    [[78, 79, 90], ['空亡', '空亡', '小吉']],
    [[95, 49, 61], ['小吉', '小吉', '小吉']],
];

for (const [numbers, expected] of REGRESSION) {
    test(`regression ${numbers.join(',')} → ${expected.join(' → ')}`, () => {
        assert.deepEqual(calculateXiaoLiuRen(numbers).palaces, expected);
    });
}

test('六宮順序與 polarity 固定', () => {
    assert.deepEqual([...Palaces.NAMES], ['大安', '留連', '速喜', '赤口', '小吉', '空亡']);
    assert.deepEqual(
        Palaces.NAMES.map((n) => Palaces.polarityOf(n)),
        [1, 0, 1, 0, 1, -1],
    );
});

/* ------------------------------------------------------------------ */
/* calculateXiaoLiuRen                                                  */
/* ------------------------------------------------------------------ */

test('輸出結構：method、numbers、steps（start 鏈接）、palaces', () => {
    const result = calculateXiaoLiuRen([73, 59, 35]);
    assert.equal(result.method, 'three-number-sequential');
    assert.deepEqual(result.numbers, [73, 59, 35]);
    assert.deepEqual(result.steps, [
        { number: 73, start: '大安', result: '大安' },
        { number: 59, start: '大安', result: '小吉' },
        { number: 35, start: '小吉', result: '速喜' },
    ]);
    assert.deepEqual(result.palaces, ['大安', '小吉', '速喜']);
});

test('第一數從大安起 1：1 → 大安、6 → 空亡、7 → 大安', () => {
    assert.equal(calculateXiaoLiuRen([1, 1, 1]).palaces[0], '大安');
    assert.equal(calculateXiaoLiuRen([6, 1, 1]).palaces[0], '空亡');
    assert.equal(calculateXiaoLiuRen([7, 1, 1]).palaces[0], '大安');
});

test('第二、三數從前一宮本身起 1（數 1 停留原宮）', () => {
    assert.deepEqual(calculateXiaoLiuRen([3, 1, 1]).palaces, ['速喜', '速喜', '速喜']);
    assert.deepEqual(calculateXiaoLiuRen([3, 2, 2]).palaces, ['速喜', '赤口', '小吉']);
});

test('deterministic：同輸入重跑 100 次結果相同，且不修改輸入', () => {
    const input = [38, 16, 12];
    const first = JSON.stringify(calculateXiaoLiuRen(input));
    for (let i = 0; i < 100; i++) {
        assert.equal(JSON.stringify(calculateXiaoLiuRen(input)), first);
    }
    assert.deepEqual(input, [38, 16, 12]);
});

test('非常大的正整數可計算', () => {
    const big = Number.MAX_SAFE_INTEGER; // 9007199254740991，(0 + big - 1) % 6 = 0 → 大安
    assert.equal(calculateXiaoLiuRen([big, 1, 1]).palaces[0], '大安');
    assert.equal(calculateXiaoLiuRen([big - 1, 1, 1]).palaces[0], '空亡');
});

test('0、負數、非三個、非整數一律丟例外', () => {
    assert.throws(() => calculateXiaoLiuRen([0, 1, 1]), RangeError);
    assert.throws(() => calculateXiaoLiuRen([1, -1, 1]), RangeError);
    assert.throws(() => calculateXiaoLiuRen([1, 1]), TypeError);
    assert.throws(() => calculateXiaoLiuRen([1, 1, 1, 1]), TypeError);
    assert.throws(() => calculateXiaoLiuRen([1.5, 1, 1]), RangeError);
    assert.throws(() => calculateXiaoLiuRen(['1', 1, 1]), RangeError);
});

/* ------------------------------------------------------------------ */
/* parseInput                                                           */
/* ------------------------------------------------------------------ */

test('格式 A：空白、逗號、斜線、頓號、分號、連字號分隔', () => {
    for (const raw of ['73 59 35', '73,59,35', '73 / 59 / 35', '73、59、35', '73;59;35', '73-59-35', ' 73 ,  59 , 35 ']) {
        const r = parseInput(raw);
        assert.equal(r.ok, true, raw);
        assert.deepEqual(r.numbers, [73, 59, 35]);
        assert.equal(r.format, 'triple');
    }
});

test('格式 A：全形數字與全形分隔符', () => {
    const r = parseInput('７３，５９，３５');
    assert.equal(r.ok, true);
    assert.deepEqual(r.numbers, [73, 59, 35]);
});

test('格式 B：六位數每兩位切分', () => {
    assert.deepEqual(parseInput('970385').numbers, [97, 3, 85]);
    assert.deepEqual(parseInput('128392').numbers, [12, 83, 92]);
    assert.deepEqual(parseInput('611630').numbers, [61, 16, 30]);
    assert.deepEqual(parseInput('234636').numbers, [23, 46, 36]);
    assert.equal(parseInput('970385').format, 'six-digit');
});

test('格式 B：六位數含 00 整筆判錯，不做 0 → 6 / 10 轉換', () => {
    const r = parseInput('970085');
    assert.equal(r.ok, false);
    assert.equal(r.error, ERRORS.NOT_POSITIVE);
    assert.equal(r.numbers, null);
});

test('0 與負數判錯', () => {
    assert.equal(parseInput('0 1 2').error, ERRORS.NOT_POSITIVE);
    assert.equal(parseInput('1 0 2').error, ERRORS.NOT_POSITIVE);
    assert.equal(parseInput('000000').error, ERRORS.NOT_POSITIVE);
    // 負號被視為分隔符，"-1 2 3" 等同 "1 2 3"；"1 2 -3" 亦然；純負數需非數字字元才會被擋
    assert.equal(parseInput('1 -2').ok, false);
});

test('數量不是 3、位數不是 6 判錯，不自行猜', () => {
    assert.equal(parseInput('73 59').error, ERRORS.COUNT);
    assert.equal(parseInput('73 59 35 12').error, ERRORS.COUNT);
    assert.equal(parseInput('12345').error, ERRORS.COUNT);
    assert.equal(parseInput('1234567').error, ERRORS.COUNT);
    assert.equal(parseInput('12').error, ERRORS.COUNT);
});

test('非數字字元判錯', () => {
    assert.equal(parseInput('73 59 3a').error, ERRORS.NOT_NUMERIC);
    assert.equal(parseInput('七三 五九 三五').error, ERRORS.NOT_NUMERIC);
    assert.equal(parseInput('1.5 2 3').error, ERRORS.NOT_NUMERIC);
});

test('空白輸入判錯', () => {
    assert.equal(parseInput('').error, ERRORS.EMPTY);
    assert.equal(parseInput('   ').error, ERRORS.EMPTY);
    assert.equal(parseInput(null).error, ERRORS.EMPTY);
    assert.equal(parseInput(undefined).error, ERRORS.EMPTY);
});

test('超過安全整數判錯；安全整數上限可通過', () => {
    assert.equal(parseInput('9007199254740992 1 1').error, ERRORS.TOO_LARGE);
    assert.equal(parseInput('99999999999999999999 1 1').error, ERRORS.TOO_LARGE);
    const ok = parseInput('9007199254740991 1 1');
    assert.equal(ok.ok, true);
    assert.equal(ok.numbers[0], 9007199254740991);
});

test('前導零：格式 A 允許（07 → 7），格式 B 03 → 3', () => {
    assert.deepEqual(parseInput('07 08 09').numbers, [7, 8, 9]);
    assert.deepEqual(parseInput('010203').numbers, [1, 2, 3]);
});

test('parseInput 永不丟例外，錯誤附文案', () => {
    for (const raw of ['', 'abc', '1 2', '000000', {}, 123]) {
        const r = parseInput(raw);
        assert.equal(typeof r.ok, 'boolean');
        if (!r.ok) assert.equal(typeof r.message, 'string');
    }
});

/* ------------------------------------------------------------------ */
/* normalizeQuestionKey                                                 */
/* ------------------------------------------------------------------ */

test('questionKey：trim、去空白、去句尾標點、全形正規化、英文小寫', () => {
    const base = normalizeQuestionKey('今年副業會成功嗎？');
    assert.equal(normalizeQuestionKey('今年副業會成功嗎'), base);
    assert.equal(normalizeQuestionKey('今 年 副 業 會 成 功 嗎？'), base);
    assert.equal(normalizeQuestionKey('  今年副業會成功嗎？？ '), base);
    assert.equal(normalizeQuestionKey('今年副業會成功嗎…'), base);
    assert.equal(normalizeQuestionKey('Ａ 案會過嗎?'), normalizeQuestionKey('a案會過嗎？'));
});

test('questionKey：不同文字視為不同問題（不做語意比對）', () => {
    assert.notEqual(normalizeQuestionKey('今年副業會成功嗎'), normalizeQuestionKey('今年副業為什麼沒有成功'));
    assert.notEqual(normalizeQuestionKey('今年副業會成功嗎'), normalizeQuestionKey('今年副業會成功嗎 — 障礙在哪裡？'));
});

test('questionKey：保留句中標點與內容', () => {
    assert.equal(normalizeQuestionKey('A？還是B？'), 'a?還是b');
});

/* ------------------------------------------------------------------ */
/* isConflicting                                                        */
/* ------------------------------------------------------------------ */

test('矛盾判定：第三宮 +1 vs −1 才算', () => {
    assert.equal(isConflicting(['速喜', '小吉', '空亡'], ['空亡', '留連', '速喜']), true);
    assert.equal(isConflicting(['大安', '大安', '大安'], ['大安', '大安', '空亡']), true);
    assert.equal(isConflicting(['大安', '大安', '空亡'], ['大安', '大安', '空亡']), false);
    assert.equal(isConflicting(['大安', '大安', '大安'], ['大安', '大安', '小吉']), false);
    // 留連、赤口中性
    assert.equal(isConflicting(['大安', '大安', '留連'], ['大安', '大安', '空亡']), false);
    assert.equal(isConflicting(['大安', '大安', '赤口'], ['大安', '大安', '大安']), false);
    // 第一、二宮相反不算
    assert.equal(isConflicting(['空亡', '空亡', '大安'], ['大安', '大安', '大安']), false);
});

/* ------------------------------------------------------------------ */
/* 分類                                                                 */
/* ------------------------------------------------------------------ */

test('八個分類固定，且分類不影響起課', () => {
    assert.deepEqual(
        Core.CATEGORIES.map((c) => c.id),
        ['work', 'relationship', 'money', 'sideproject', 'social', 'study', 'competition', 'general'],
    );
    assert.equal(Core.categoryLabel('relationship'), '感情');
    assert.equal(Core.categoryLabel('unknown'), '一般事件');
    assert.equal(calculateXiaoLiuRen.length, 1, 'calculateXiaoLiuRen 只接受 numbers 一個參數');
});
