/**
 * 小六壬儲存層測試：序列化、Primary／Repeated、矛盾、刪除升格、驗證統計、匯出匯入、設定。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { XiaoLiuRenStore as Store, XiaoLiuRenCore as Core, makeStore } from './_loadXiaoliuren.js';

const input = (question, numbers, extra = {}) =>
    Object.assign(
        {
            question,
            category: 'work',
            rawInput: numbers.join(' '),
            numbers,
            interpretation: '解讀快照',
        },
        extra,
    );

/* ------------------------------------------------------------------ */
/* 基本讀寫                                                             */
/* ------------------------------------------------------------------ */

test('addReading 建立完整 schema 並立即保存到 storage', () => {
    const { store, storage } = makeStore();
    const res = store.addReading(input('A 案會過嗎？', [73, 59, 35]));
    assert.equal(res.ok, true);
    const r = res.record;
    assert.deepEqual(Object.keys(r).sort(), [
        'category', 'conflictWithPrimary', 'datetime', 'id', 'interpretation', 'isPrimary', 'method',
        'notes', 'numbers', 'palaces', 'parentReadingId', 'question', 'questionKey', 'rawInput', 'steps', 'verification',
    ]);
    assert.equal(r.method, 'three-number-sequential');
    assert.deepEqual(r.palaces, ['大安', '小吉', '速喜']);
    assert.equal(r.steps.length, 3);
    assert.equal(r.isPrimary, true);
    assert.equal(r.parentReadingId, null);
    assert.equal(r.conflictWithPrimary, false);
    assert.equal(r.verification, 'pending');
    assert.equal(r.notes, '');
    assert.equal(r.questionKey, Core.normalizeQuestionKey('A 案會過嗎？'));

    const saved = JSON.parse(storage.getItem(Store.READINGS_KEY));
    assert.equal(saved.length, 1);
    assert.deepEqual(saved[0], r);
});

test('序列化往返：list 讀回與寫入一致，最新在前', () => {
    const { store } = makeStore();
    store.addReading(input('一', [1, 1, 1]));
    store.addReading(input('二', [2, 2, 2]));
    const all = store.list();
    assert.deepEqual(all.map((r) => r.question), ['二', '一']);
    assert.equal(store.get(all[0].id).question, '二');
    assert.equal(store.get('nope'), null);
});

test('storage 內容損毀時視為空清單，不丟例外', () => {
    const { store, storage } = makeStore();
    storage.setItem(Store.READINGS_KEY, '{not json');
    assert.deepEqual(store.list(), []);
    storage.setItem(Store.READINGS_KEY, '{"a":1}');
    assert.deepEqual(store.list(), []);
});

test('未知分類存為 general；palaces 與 numbers 不一致丟例外', () => {
    const { store } = makeStore();
    assert.equal(store.addReading(input('x', [1, 1, 1], { category: 'zzz' })).record.category, 'general');
    assert.throws(() => store.addReading(input('y', [1, 1, 1], { palaces: ['空亡', '空亡', '空亡'] })));
});

/* ------------------------------------------------------------------ */
/* Primary / Repeated / 矛盾                                            */
/* ------------------------------------------------------------------ */

test('同一問題第二次起課：未 force 回 HAS_PRIMARY，force 標記為 Repeated', () => {
    const { store } = makeStore();
    const first = store.addReading(input('今年副業會成功嗎？', [15, 63, 9])).record; // 速喜 小吉 大安
    const blocked = store.addReading(input('今 年 副 業 會 成 功 嗎', [1, 1, 1]));
    assert.equal(blocked.ok, false);
    assert.equal(blocked.reason, 'HAS_PRIMARY');
    assert.equal(blocked.primary.id, first.id);
    assert.equal(store.list().length, 1);

    const repeated = store.addReading(input('今年副業會成功嗎', [24, 61, 62]), { force: true }).record; // 空亡 空亡 大安
    assert.equal(repeated.isPrimary, false);
    assert.equal(repeated.parentReadingId, first.id);
    assert.equal(repeated.conflictWithPrimary, false); // 第三宮 大安 vs 大安
    assert.equal(store.findPrimaryForQuestion('今年副業會成功嗎？').id, first.id);
    assert.deepEqual(store.repeatedOf(first.id).map((r) => r.id), [repeated.id]);
});

test('Repeated 第三宮 +1 vs −1 → conflictWithPrimary = true；中性宮不算', () => {
    const { store: s1 } = makeStore();
    s1.addReading(input('Q', [73, 59, 35])); // 大安 小吉 速喜，第三宮 +1
    const conflict = s1.addReading(input('Q', [1, 1, 6]), { force: true }).record; // 大安 大安 空亡
    assert.deepEqual(conflict.palaces, ['大安', '大安', '空亡']);
    assert.equal(conflict.conflictWithPrimary, true);

    const { store: s2 } = makeStore();
    s2.addReading(input('Q', [73, 59, 35]));
    const neutral = s2.addReading(input('Q', [1, 1, 2]), { force: true }).record; // 大安 大安 留連
    assert.deepEqual(neutral.palaces, ['大安', '大安', '留連']);
    assert.equal(neutral.conflictWithPrimary, false);

    const { store: s3 } = makeStore();
    s3.addReading(input('Q', [1, 1, 6])); // 第三宮 空亡 −1
    const reverse = s3.addReading(input('Q', [73, 59, 35]), { force: true }).record; // 第三宮 速喜 +1
    assert.equal(reverse.conflictWithPrimary, true);
});

test('追問是不同問題：isPrimary = true 並保留 parentReadingId', () => {
    const { store } = makeStore();
    const src = store.addReading(input('今年副業會成功嗎？', [73, 59, 35])).record;
    const follow = store.addReading(
        input('今年副業會成功嗎 — 障礙在哪裡？', [1, 2, 3], { parentReadingId: src.id }),
    ).record;
    assert.equal(follow.isPrimary, true);
    assert.equal(follow.parentReadingId, src.id);
    assert.equal(follow.conflictWithPrimary, false);
    assert.equal(store.repeatedOf(src.id).length, 0);
});

/* ------------------------------------------------------------------ */
/* 刪除與升格                                                           */
/* ------------------------------------------------------------------ */

test('刪 Repeated 不影響 Primary', () => {
    const { store } = makeStore();
    const p = store.addReading(input('Q', [73, 59, 35])).record;
    const r = store.addReading(input('Q', [1, 1, 6]), { force: true }).record;
    assert.equal(store.deleteReading(r.id).ok, true);
    assert.equal(store.get(p.id).isPrimary, true);
    assert.equal(store.list().length, 1);
});

test('刪 Primary：最早 Repeated 升格，其餘改指向並重算矛盾，追問改指向新 Primary', () => {
    const { store } = makeStore();
    const p = store.addReading(input('Q', [73, 59, 35])).record; // 第三宮 速喜 +1
    const r1 = store.addReading(input('Q', [1, 1, 6]), { force: true }).record; // 大安 大安 空亡 (−1)，與 p 矛盾
    const r2 = store.addReading(input('Q', [1, 1, 1]), { force: true }).record; // 大安 大安 大安 (+1)
    const follow = store.addReading(input('Q — 為什麼？', [2, 2, 2], { parentReadingId: p.id })).record;
    assert.equal(store.get(r1.id).conflictWithPrimary, true);
    assert.equal(store.get(r2.id).conflictWithPrimary, false);

    const { promoted } = store.deleteReading(p.id);
    assert.equal(promoted.id, r1.id);
    const n1 = store.get(r1.id);
    assert.equal(n1.isPrimary, true);
    assert.equal(n1.parentReadingId, null);
    assert.equal(n1.conflictWithPrimary, false);
    const n2 = store.get(r2.id);
    assert.equal(n2.isPrimary, false);
    assert.equal(n2.parentReadingId, r1.id);
    assert.equal(n2.conflictWithPrimary, true); // 空亡 vs 大安
    assert.equal(store.get(follow.id).parentReadingId, r1.id);
    assert.equal(store.findPrimary(p.questionKey).id, r1.id);
});

test('刪 Primary 且無 Repeated：追問的 parentReadingId 設為 null，不留 orphan', () => {
    const { store } = makeStore();
    const p = store.addReading(input('Q', [73, 59, 35])).record;
    const follow = store.addReading(input('Q — 為什麼？', [2, 2, 2], { parentReadingId: p.id })).record;
    const { promoted } = store.deleteReading(p.id);
    assert.equal(promoted, null);
    assert.equal(store.get(follow.id).parentReadingId, null);
    assert.equal(store.get(follow.id).isPrimary, true);
});

test('刪不存在的 id 回 ok:false；clearAll 清空', () => {
    const { store } = makeStore();
    store.addReading(input('Q', [1, 1, 1]));
    assert.equal(store.deleteReading('nope').ok, false);
    store.clearAll();
    assert.deepEqual(store.list(), []);
});

/* ------------------------------------------------------------------ */
/* 備註、驗證與統計                                                       */
/* ------------------------------------------------------------------ */

test('setNotes / setVerification；未知狀態丟例外', () => {
    const { store } = makeStore();
    const r = store.addReading(input('Q', [1, 1, 1])).record;
    assert.equal(store.setNotes(r.id, '事後確認').notes, '事後確認');
    assert.equal(store.setVerification(r.id, 'hit').verification, 'hit');
    assert.throws(() => store.setVerification(r.id, 'maybe'), RangeError);
    assert.equal(store.setVerification('nope', 'hit'), null);
});

test('統計：pending 不計，加權命中率、完全命中率、矛盾率', () => {
    const { store } = makeStore();
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'].map((q) => store.addReading(input(q, [1, 1, 1])).record.id);
    store.setVerification(ids[0], 'hit');
    store.setVerification(ids[1], 'hit');
    store.setVerification(ids[2], 'partial');
    store.setVerification(ids[3], 'miss');
    store.setVerification(ids[4], 'contradiction');
    // ids[5] 維持 pending
    const s = store.stats();
    assert.equal(s.total, 6);
    assert.equal(s.pending, 1);
    assert.equal(s.verified, 5);
    assert.equal(s.hit, 2);
    assert.equal(s.partial, 1);
    assert.equal(s.miss, 1);
    assert.equal(s.contradiction, 1);
    assert.equal(s.weightedHitRate, (2 + 0.5) / 5);
    assert.equal(s.hitRate, 2 / 5);
    assert.equal(s.contradictionRate, 1 / 5);
});

test('統計：無已驗證時比率為 null', () => {
    const { store } = makeStore();
    store.addReading(input('Q', [1, 1, 1]));
    const s = store.stats();
    assert.equal(s.verified, 0);
    assert.equal(s.weightedHitRate, null);
    assert.equal(s.hitRate, null);
    assert.equal(s.contradictionRate, null);
});

test('搜尋：問題、備註、宮位，不分大小寫', () => {
    const { store } = makeStore();
    const a = store.addReading(input('Apple 專案', [1, 1, 1])).record;
    store.addReading(input('香蕉', [6, 6, 6]));
    store.setNotes(a.id, '客戶回覆');
    assert.deepEqual(store.search('apple').map((r) => r.id), [a.id]);
    assert.deepEqual(store.search('回覆').map((r) => r.id), [a.id]);
    assert.equal(store.search('空亡').length, 1);
    assert.equal(store.search('').length, 2);
});

/* ------------------------------------------------------------------ */
/* 匯出／匯入                                                           */
/* ------------------------------------------------------------------ */

test('匯出格式含 schema/version/readings；匯入同檔全部為重複', () => {
    const { store } = makeStore();
    store.addReading(input('Q1', [1, 1, 1]));
    store.addReading(input('Q2', [2, 2, 2]));
    const text = store.exportJson();
    const parsed = JSON.parse(text);
    assert.equal(parsed.schema, 'xiaoliuren.readings');
    assert.equal(parsed.version, 1);
    assert.equal(parsed.readings.length, 2);

    const preview = store.previewImport(text);
    assert.equal(preview.ok, true);
    assert.equal(preview.total, 2);
    assert.equal(preview.importable, 0);
    assert.equal(preview.duplicates, 2);
    assert.deepEqual(preview.invalid, []);
});

test('匯入到另一個 store：合法筆新增、相同 id 跳過、關係整理', () => {
    const { store: a } = makeStore();
    a.addReading(input('Q', [73, 59, 35]));
    a.addReading(input('Q', [1, 1, 6]), { force: true });
    const text = a.exportJson();

    const { store: b } = makeStore(Date.UTC(2026, 8, 29), 'local');
    const preview = b.previewImport(text);
    assert.equal(preview.importable, 2);
    const result = b.commitImport(preview);
    assert.equal(result.added, 2);
    assert.equal(result.relationsAdjusted, 0);
    assert.equal(b.list().length, 2);
    assert.equal(b.findPrimary(Core.normalizeQuestionKey('Q')).palaces.join(''), '大安小吉速喜');

    // 再匯入一次全部跳過
    const again = b.previewImport(text);
    assert.equal(again.importable, 0);
    assert.equal(again.duplicates, 2);
    assert.equal(b.commitImport(again).added, 0);
});

test('匯入：無法解析或結構錯誤整份拒絕', () => {
    const { store } = makeStore();
    assert.equal(store.previewImport('{oops').ok, false);
    assert.equal(store.previewImport('123').ok, false);
    assert.equal(store.previewImport('{"foo":1}').ok, false);
    assert.equal(store.previewImport('{"schema":"other","readings":[]}').ok, false);
});

test('匯入：個別 record 不合法時列出錯誤，只匯入合法筆，不靜默修正', () => {
    const { store: a } = makeStore();
    a.addReading(input('Q1', [1, 1, 1]));
    a.addReading(input('Q2', [2, 2, 2]));
    const rows = JSON.parse(a.exportJson()).readings;
    rows[1].palaces = ['空亡', '空亡', '空亡']; // 與 numbers 不一致
    rows.push({ id: 'bad', question: 'x' }); // 缺欄位
    rows.push(Object.assign({}, rows[0], { id: 'dup-in-file' }));
    rows.push(Object.assign({}, rows[0], { id: 'dup-in-file' })); // 檔內重複

    const { store: b } = makeStore();
    const preview = b.previewImport(JSON.stringify(rows));
    assert.equal(preview.ok, true);
    assert.equal(preview.total, 5);
    assert.equal(preview.importable, 2); // rows[0] 與 dup-in-file 第一筆
    assert.equal(preview.duplicates, 1);
    assert.equal(preview.invalid.length, 2);
    assert.match(preview.invalid[0].errors.join(' '), /不一致/);
    assert.equal(preview.invalid[1].id, 'bad');
    const result = b.commitImport(preview);
    assert.equal(result.added, 2);
    assert.equal(b.list().length, 2);
});

test('匯入：同問題兩筆都是 Primary 時，整理為最早者為 Primary（有回報筆數）', () => {
    const { store: a } = makeStore(Date.UTC(2026, 8, 28), 'remote');
    a.addReading(input('Q', [73, 59, 35])); // 較早
    const { store: b } = makeStore(Date.UTC(2026, 8, 30), 'local');
    b.addReading(input('Q', [1, 1, 6])); // 較晚，本地 Primary
    const preview = b.previewImport(a.exportJson());
    const result = b.commitImport(preview);
    assert.equal(result.added, 1);
    assert.ok(result.relationsAdjusted >= 1);
    const all = b.list();
    const primaries = all.filter((r) => r.isPrimary);
    assert.equal(primaries.length, 1);
    assert.deepEqual(primaries[0].palaces, ['大安', '小吉', '速喜']);
    const repeated = all.find((r) => !r.isPrimary);
    assert.equal(repeated.parentReadingId, primaries[0].id);
    assert.equal(repeated.conflictWithPrimary, true);
});

test('validateRecord 對每個欄位嚴格檢查', () => {
    const { store } = makeStore();
    const good = store.addReading(input('Q', [1, 1, 1])).record;
    assert.equal(Store.validateRecord(good).ok, true);
    const cases = [
        ['id', ''],
        ['datetime', 'not a date'],
        ['category', 'love'],
        ['method', 'other'],
        ['numbers', [0, 1, 1]],
        ['palaces', ['大安', '大安']],
        ['steps', []],
        ['isPrimary', 'yes'],
        ['parentReadingId', 5],
        ['conflictWithPrimary', 1],
        ['verification', 'ok'],
        ['notes', null],
        ['interpretation', 1],
        ['questionKey', undefined],
    ];
    for (const [key, value] of cases) {
        const bad = Object.assign({}, good, { [key]: value });
        assert.equal(Store.validateRecord(bad).ok, false, key);
    }
    assert.equal(Store.validateRecord(null).ok, false);
    assert.equal(Store.validateRecord([]).ok, false);
});

/* ------------------------------------------------------------------ */
/* 設定                                                                 */
/* ------------------------------------------------------------------ */

test('設定：預設跟隨系統，可切換並持久化，未知主題丟例外', () => {
    const { store, storage } = makeStore();
    assert.deepEqual(store.getSettings(), { theme: 'system' });
    assert.equal(store.setSettings({ theme: 'dark' }).theme, 'dark');
    assert.equal(JSON.parse(storage.getItem(Store.SETTINGS_KEY)).theme, 'dark');
    assert.equal(store.getSettings().theme, 'dark');
    assert.throws(() => store.setSettings({ theme: 'sepia' }), RangeError);
    storage.setItem(Store.SETTINGS_KEY, '{"theme":"weird"}');
    assert.equal(store.getSettings().theme, 'system');
    storage.setItem(Store.SETTINGS_KEY, 'garbage');
    assert.equal(store.getSettings().theme, 'system');
});
