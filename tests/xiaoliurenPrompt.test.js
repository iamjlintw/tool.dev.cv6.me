/**
 * 小六壬 AI Prompt 產生器測試：內容必含問題、數字、三宮、不得重算聲明；Repeated 附第一課。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { XiaoLiuRenPrompt as Prompt } from './_loadXiaoliuren.js';

const reading = {
    id: 'r1',
    datetime: '2026-09-28T02:00:00.000Z',
    question: '今年副業會成功嗎？',
    category: 'sideproject',
    numbers: [73, 59, 35],
    palaces: ['大安', '小吉', '速喜'],
    isPrimary: true,
    conflictWithPrimary: false,
};

test('Prompt 含問題、分類、起課方式、輸入、排盤結果、規則', () => {
    const text = Prompt.buildPrompt(reading);
    assert.match(text, /問題：\n今年副業會成功嗎？/);
    assert.match(text, /問題分類：\n副業/);
    assert.match(text, /起課方式：\n三數連續起課法/);
    assert.match(text, /輸入：\n73, 59, 35/);
    assert.match(text, /排盤結果：\n大安 → 小吉 → 速喜/);
    assert.match(text, /六宮順序為大安、留連、速喜、赤口、小吉、空亡。/);
    assert.match(text, /第一宮為背景，第二宮為核心發展，第三宮為後續趨勢。/);
    assert.match(text, /不得重新計算起課結果，不得更改宮位，不得為了符合問題預設結論。/);
    assert.match(text, /必須承認資訊不足，不得強行指定。/);
});

test('起課時間以台北時間呈現', () => {
    const text = Prompt.buildPrompt(reading);
    assert.match(text, /起課時間：\n2026\/09\/28 10:00（台北時間）/);
});

test('三宮對應含關鍵詞', () => {
    const text = Prompt.buildPrompt(reading);
    assert.match(text, /第一宮（背景／前段）：大安（穩定、維持、定局）/);
    assert.match(text, /第三宮（後續／結果傾向）：速喜（快速、消息、升溫）/);
});

test('Primary 不附重複起課段落', () => {
    const text = Prompt.buildPrompt(reading, { primary: { palaces: ['空亡', '空亡', '空亡'] } });
    assert.doesNotMatch(text, /Repeated Reading/);
});

test('Repeated 且矛盾：附第一課並要求如實指出矛盾', () => {
    const repeated = Object.assign({}, reading, {
        isPrimary: false,
        palaces: ['速喜', '小吉', '空亡'],
        conflictWithPrimary: true,
    });
    const text = Prompt.buildPrompt(repeated, { primary: { palaces: ['空亡', '留連', '速喜'] } });
    assert.match(text, /本課為同一問題的重複起課（Repeated Reading）/);
    assert.match(text, /第一課（Primary Reading）結果：空亡 → 留連 → 速喜/);
    assert.match(text, /結果存在矛盾，可信度下降/);
    assert.match(text, /不得把兩個相反結果調和成一致/);
});

test('Repeated 不矛盾：仍附第一課並要求分別說明', () => {
    const repeated = Object.assign({}, reading, { isPrimary: false, conflictWithPrimary: false });
    const text = Prompt.buildPrompt(repeated, { primary: { palaces: ['大安', '大安', '大安'] } });
    assert.match(text, /請分別說明兩課/);
    assert.doesNotMatch(text, /可信度下降/);
});

test('空問題顯示未填寫；缺三宮丟例外', () => {
    assert.match(Prompt.buildPrompt(Object.assign({}, reading, { question: '  ' })), /問題：\n（未填寫）/);
    assert.throws(() => Prompt.buildPrompt({ palaces: ['大安'] }), TypeError);
});

test('AiAdapter 只保留介面，無任何實作', () => {
    assert.deepEqual([...Prompt.AiAdapter.adapters], []);
    assert.equal(Prompt.AiAdapter.shape.name, 'string');
});

test('數字來源：隨機產生與直覺輸入分別標示', () => {
    assert.match(Prompt.buildPrompt(Object.assign({}, reading, { rawInput: '73 59 35' })), /數字來源：\n直覺輸入/);
    assert.match(Prompt.buildPrompt(Object.assign({}, reading, { rawInput: '隨機：73 59 35' })), /數字來源：\n隨機產生（1～99）/);
});
