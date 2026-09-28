/**
 * 小六壬本地解讀引擎測試：文案完整度、組合結構、特例覆寫、分類不影響宮位。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    XiaoLiuRenInterpreter as Interpreter,
    XiaoLiuRenCore as Core,
    XiaoLiuRenPalaces as Palaces,
} from './_loadXiaoliuren.js';

const { interpret, _tables } = Interpreter;
const CATEGORY_IDS = Core.CATEGORIES.map((c) => c.id);
const POSITION_IDS = Interpreter.POSITIONS.map((p) => p.id);

test('位置片段完整：6 宮 × 3 位 × 8 類皆為非空、以句號結尾的文案', () => {
    let count = 0;
    for (const palace of Palaces.NAMES) {
        for (const pos of POSITION_IDS) {
            for (const cat of CATEGORY_IDS) {
                const text = _tables.POSITION_TEXT[palace][pos][cat];
                assert.equal(typeof text, 'string', `${palace}/${pos}/${cat}`);
                assert.ok(text.length >= 12, `${palace}/${pos}/${cat} 太短`);
                assert.ok(/。$/.test(text), `${palace}/${pos}/${cat} 應以句號結尾`);
                count++;
            }
        }
    }
    assert.equal(count, 144);
});

test('轉折規則完整：36 組 tone 配對皆有文案', () => {
    const tones = Palaces.PALACES.map((p) => p.tone);
    for (const a of tones) {
        for (const b of tones) {
            assert.equal(typeof _tables.TRANSITIONS[`${a}>${b}`], 'string', `${a}>${b}`);
        }
    }
    assert.equal(Object.keys(_tables.TRANSITIONS).length, 36);
});

test('六宮資料欄位齊全', () => {
    const required = [
        'name', 'index', 'keyword', 'generalMeaning', 'positiveMeaning', 'negativeMeaning',
        'speed', 'stability', 'relationshipMeaning', 'workMeaning', 'moneyMeaning', 'actionMeaning',
        'tone', 'polarity',
    ];
    for (const p of Palaces.PALACES) {
        for (const key of required) {
            assert.ok(p[key] !== undefined && p[key] !== '', `${p.name}.${key}`);
        }
    }
});

test('輸出結構：三段 segments、兩段 transitions、summary、advice、caveats', () => {
    const r = interpret(['大安', '速喜', '赤口'], 'relationship');
    assert.equal(r.category, 'relationship');
    assert.equal(r.categoryLabel, '感情');
    assert.deepEqual(r.palaces, ['大安', '速喜', '赤口']);
    assert.deepEqual(r.segments.map((s) => s.position), ['before', 'middle', 'after']);
    assert.deepEqual(r.segments.map((s) => s.positionLabel), ['前段', '中段', '後段']);
    assert.deepEqual(r.segments.map((s) => s.palace), ['大安', '速喜', '赤口']);
    assert.equal(r.segments[0].keyword, Palaces.get('大安').keyword);
    assert.equal(r.transitions.length, 2);
    assert.deepEqual(r.transitions.map((t) => [t.from, t.to]), [['大安', '速喜'], ['速喜', '赤口']]);
    assert.ok(r.summary.includes(r.segments[0].text));
    assert.ok(r.summary.includes(r.transitions[0].text));
    assert.ok(r.summary.includes(r.segments[2].text));
    assert.ok(r.advice.startsWith('行動建議：'));
    assert.ok(r.summary.includes(r.advice));
    assert.equal(r.caveats.length, 3);
});

test('範例：大安 → 速喜 → 赤口（感情）呈現基礎、升溫、需要說清楚', () => {
    const r = interpret(['大安', '速喜', '赤口'], 'relationship');
    assert.match(r.segments[0].text, /基礎/);
    assert.match(r.segments[1].text, /升溫/);
    assert.match(r.segments[2].text, /說清楚/);
    assert.match(r.transitions[1].text, /摩擦/);
});

test('範例：大安 → 速喜 → 赤口（工作）呈現基本盤穩、加速、協調或談判', () => {
    const r = interpret(['大安', '速喜', '赤口'], 'work');
    assert.match(r.segments[0].text, /穩/);
    assert.match(r.segments[1].text, /加速/);
    assert.match(r.segments[2].text, /協調|談判/);
});

test('分類只影響文案，不影響宮位', () => {
    const base = interpret(['留連', '空亡', '速喜'], 'work');
    for (const cat of CATEGORY_IDS) {
        const r = interpret(['留連', '空亡', '速喜'], cat);
        assert.deepEqual(r.palaces, base.palaces);
        assert.deepEqual(r.segments.map((s) => s.palace), base.segments.map((s) => s.palace));
    }
    // 不同分類文案應不同
    assert.notEqual(interpret(['留連', '空亡', '速喜'], 'work').summary, interpret(['留連', '空亡', '速喜'], 'money').summary);
});

test('未知分類視為一般事件', () => {
    const r = interpret(['小吉', '小吉', '小吉'], 'nope');
    assert.equal(r.category, 'general');
    assert.equal(r.categoryLabel, '一般事件');
});

test('特例覆寫：三宮同宮', () => {
    for (const name of Palaces.NAMES) {
        const r = interpret([name, name, name], 'general');
        assert.equal(r.specials.length >= 1, true, name);
        assert.ok(r.specials[0].startsWith(`三宮皆${name}`));
        assert.ok(r.summary.includes(r.specials[0]));
    }
});

test('特例覆寫：空亡相關樣式', () => {
    assert.match(interpret(['空亡', '空亡', '大安'], 'general').specials.join(''), /前兩宮皆空亡/);
    assert.match(interpret(['大安', '空亡', '空亡'], 'general').specials.join(''), /後兩宮皆空亡/);
    assert.match(interpret(['空亡', '留連', '速喜'], 'general').specials.join(''), /起點是空亡/);
    assert.equal(interpret(['大安', '大安', '空亡'], 'general').specials.length, 0);
});

test('特例覆寫：速喜接赤口、留連接速喜、首尾大安', () => {
    assert.match(interpret(['大安', '速喜', '赤口'], 'general').specials.join(''), /速喜接赤口/);
    assert.match(interpret(['速喜', '赤口', '小吉'], 'general').specials.join(''), /速喜接赤口/);
    assert.match(interpret(['留連', '速喜', '大安'], 'general').specials.join(''), /留連接速喜/);
    assert.match(interpret(['大安', '留連', '大安'], 'general').specials.join(''), /首尾皆大安/);
});

test('文案守則：空亡不固定解成結束、赤口不固定解成壞事', () => {
    for (const cat of CATEGORY_IDS) {
        const voidAfter = interpret(['大安', '大安', '空亡'], cat).segments[2].text;
        assert.doesNotMatch(voidAfter, /一定結束|注定結束|必然結束/);
        const frictionAfter = interpret(['大安', '大安', '赤口'], cat).segments[2].text;
        assert.doesNotMatch(frictionAfter, /大凶|必敗|一定失敗/);
    }
    assert.match(Palaces.get('空亡').generalMeaning, /不一定是結束/);
    assert.match(Palaces.get('赤口').generalMeaning, /不一定是壞事/);
    assert.match(Palaces.get('速喜').generalMeaning, /不代表一定能長期/);
    assert.match(Palaces.get('大安').generalMeaning, /不是爆發型/);
    assert.match(Palaces.get('小吉').generalMeaning, /不是暴利/);
    assert.match(Palaces.get('留連').keyword, /拖延/);
});

test('deterministic：同輸入結果相同', () => {
    const a = JSON.stringify(interpret(['赤口', '留連', '小吉'], 'social'));
    const b = JSON.stringify(interpret(['赤口', '留連', '小吉'], 'social'));
    assert.equal(a, b);
});

test('非法宮位丟例外', () => {
    assert.throws(() => interpret(['大安', '大安'], 'work'), TypeError);
    assert.throws(() => interpret(['大安', '大安', '天德'], 'work'), TypeError);
    assert.throws(() => interpret(null, 'work'), TypeError);
});

test('所有 216 種組合皆可解讀且不含 undefined', () => {
    let n = 0;
    for (const a of Palaces.NAMES) {
        for (const b of Palaces.NAMES) {
            for (const c of Palaces.NAMES) {
                const r = interpret([a, b, c], 'general');
                assert.doesNotMatch(r.summary, /undefined|null/);
                n++;
            }
        }
    }
    assert.equal(n, 216);
});
