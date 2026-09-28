/**
 * 固定案例的迴歸測試。
 * 這些期望值全部由通用演算法算出，不在核心中針對本案例做任何特例處理。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { LiuyaoCore as C, LiuyaoPrompt as P } from './_load.js';

const CASE = {
    question: '她心中的哪個人 是我還是他',
    yao: [7, 6, 9, 8, 7, 8],
    date: new Date('2026-09-05T14:12:02.711Z'),
    timeZone: 'Asia/Taipei',
};

const chart = C.buildChart({ ...CASE, gender: 'male' });

test('本卦與變卦不因接上排盤而改變', () => {
    assert.equal(chart.mainHexagram.name, '既濟');
    assert.equal(chart.changedHexagram.name, '節');
});

test('動爻由 zero-based 索引改為 one-based 爻位', () => {
    // 原本頁面輸出的 changedIndex 為 [1, 2]，對外一律改成第 2、第 3 爻
    assert.deepEqual(chart.changingLines, [2, 3]);
    assert.deepEqual(
        chart.yao.map((v, i) => (v === 6 || v === 9 ? i : -1)).filter((i) => i >= 0),
        [1, 2],
    );
    assert.deepEqual(chart.lines.map((l) => l.position), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(chart.lines.map((l) => l.value), CASE.yao);
});

test('起卦時間同時保留 UTC 與台灣當地時間', () => {
    assert.equal(chart.time.timezone, 'Asia/Taipei');
    assert.equal(chart.time.startedAtUtc, '2026-09-05T14:12:02.711Z');
    assert.equal(chart.time.startedAtLocal, '2026-09-05 22:12:02');
});

test('干支、月建、日辰、旬空皆已由程式算好', () => {
    assert.equal(chart.time.yearGanzhi, '丙午');
    assert.equal(chart.time.monthGanzhi, '丙申');
    assert.equal(chart.time.dayGanzhi, '壬午');
    assert.equal(chart.time.hourGanzhi, '辛亥');
    assert.equal(chart.time.monthBranch, '申');
    assert.equal(chart.time.dayBranch, '午');
    assert.equal(chart.time.dayStem, '壬');
    assert.deepEqual(chart.time.xunkong, ['申', '酉']);
});

test('八宮、世應與宮五行', () => {
    assert.equal(chart.mainHexagram.palace, '坎');
    assert.equal(chart.mainHexagram.palaceElement, '水');
    assert.equal(chart.mainHexagram.generation, '三世卦');
    assert.equal(chart.mainHexagram.shiLine, 3);
    assert.equal(chart.mainHexagram.yingLine, 6);
    assert.equal(chart.mainHexagram.lowerTrigram, '離');
    assert.equal(chart.mainHexagram.upperTrigram, '坎');
    assert.equal(chart.changedHexagram.palace, '坎');
    assert.equal(chart.changedHexagram.generation, '一世卦');
});

test('六爻的納甲、五行、六親與六神', () => {
    assert.deepEqual(
        chart.lines.map((l) => l.najiaStem + l.najiaBranch),
        ['己卯', '己丑', '己亥', '戊申', '戊戌', '戊子'],
    );
    assert.deepEqual(chart.lines.map((l) => l.element), ['木', '土', '水', '金', '土', '水']);
    assert.deepEqual(
        chart.lines.map((l) => l.relative),
        ['子孫', '官鬼', '兄弟', '父母', '官鬼', '兄弟'],
    );
    // 壬日起玄武於初爻
    assert.deepEqual(
        chart.lines.map((l) => l.sixSpirit),
        ['玄武', '青龍', '朱雀', '勾陳', '螣蛇', '白虎'],
    );
    assert.deepEqual(chart.lines.map((l) => l.shiYing), [null, null, '世', null, null, '應']);
});

test('動爻的變爻六親與回頭剋', () => {
    const second = chart.lines[1];
    assert.equal(second.moving, true);
    assert.equal(second.movingType, '老陰動');
    assert.equal(second.changed.najiaStem + second.changed.najiaBranch, '丁卯');
    assert.equal(second.changed.relative, '子孫');
    assert.ok(second.changed.transforms.includes('回頭剋'));

    const third = chart.lines[2];
    assert.equal(third.moving, true);
    assert.equal(third.movingType, '老陽動');
    assert.equal(third.changed.najiaStem + third.changed.najiaBranch, '丁丑');
    assert.equal(third.changed.relative, '官鬼');
    assert.ok(third.changed.transforms.includes('回頭剋'));

    // 靜爻沒有變爻資料
    for (const p of [1, 4, 5, 6]) assert.equal(chart.lines[p - 1].changed, null);
});

test('伏神、旬空與暗動', () => {
    assert.deepEqual(chart.hexagramRelations.missingRelatives, ['妻財']);
    const shi = chart.lines[2];
    assert.equal(shi.hiddenSpirit.relative, '妻財');
    assert.equal(shi.hiddenSpirit.najiaStem + shi.hiddenSpirit.najiaBranch, '戊午');

    assert.equal(chart.lines[3].relations.void, true); // 戊申在旬空
    assert.equal(chart.lines[5].relations.hiddenAction, true); // 戊子逢午日沖而暗動
});

test('roleMapping 保留三個角色，第三人仍待判斷', () => {
    assert.equal(chart.roleMapping.querent.label, '我');
    assert.equal(chart.roleMapping.querent.primarySymbol, '世爻');
    assert.equal(chart.roleMapping.target.label, '她');
    assert.equal(chart.roleMapping.target.primarySymbol, '妻財');
    assert.ok(chart.roleMapping.target.reason);
    assert.equal(chart.roleMapping.thirdPerson.label, '他');
    assert.equal(chart.roleMapping.thirdPerson.status, 'requires_judgement');
    assert.deepEqual(chart.roleMapping.thirdPerson.candidates, ['應爻', '兄弟爻', '官鬼爻']);
});

test('不再只輸出原本的六個簡單欄位', () => {
    for (const key of ['question', 'yao', 'changingLines', 'mainHexagram', 'changedHexagram', 'time', 'lines', 'roleMapping']) {
        assert.ok(key in chart, `缺少 ${key}`);
    }
    assert.equal('changedIndex' in chart, false);
    assert.equal('timestamp' in chart, false);
    assert.equal('main' in chart, false);
    assert.equal('changed' in chart, false);
});

test('解卦 Prompt 帶上規則、三角色與完整 JSON', () => {
    const prompt = P.buildPrompt(chart);
    assert.ok(prompt.includes('納甲六爻法的解卦者'));
    assert.ok(prompt.includes('禁止自行重新起卦'));
    assert.ok(prompt.includes('月建與日辰 → 世應 → 用神'));
    assert.ok(prompt.includes('「我」'));
    assert.ok(prompt.includes('「她」'));
    assert.ok(prompt.includes('「他」'));
    assert.ok(prompt.includes('不得無條件直接指定為應爻'));
    assert.ok(prompt.includes(CASE.question));
    // JSON 完整帶入，模型不必自行推算
    const json = prompt.slice(prompt.indexOf('{'));
    assert.deepEqual(JSON.parse(json), JSON.parse(JSON.stringify(chart)));
});
