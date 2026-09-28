import test from 'node:test';
import assert from 'node:assert/strict';
import { GanzhiCalendar as G, LiuyaoCore as C, taipei } from './_load.js';

const bitsOf = (yao) => yao.map((v) => (v % 2 === 0 ? '0' : '1')).join('');

test('八宮卦表涵蓋六十四卦且世應自洽', () => {
    const entries = Object.entries(C.PALACE_TABLE);
    assert.equal(entries.length, 64);
    assert.equal(new Set(entries.map(([bits]) => bits)).size, 64);

    const perPalace = {};
    for (const [bits, info] of entries) {
        assert.ok(C.HEXAGRAM_NAMES[bits], `${bits} 沒有卦名`);
        assert.ok(info.shiLine >= 1 && info.shiLine <= 6);
        assert.ok(info.yingLine >= 1 && info.yingLine <= 6);
        assert.equal(Math.abs(info.shiLine - info.yingLine), 3);
        perPalace[info.palace] = (perPalace[info.palace] || 0) + 1;
    }
    assert.equal(Object.keys(perPalace).length, 8);
    for (const palace of Object.keys(perPalace)) assert.equal(perPalace[palace], 8);
});

test('乾宮八卦的卦名與世次', () => {
    const expected = [
        ['111111', '乾', '本宮卦', 6],
        ['011111', '姤', '一世卦', 1],
        ['001111', '遯', '二世卦', 2],
        ['000111', '否', '三世卦', 3],
        ['000011', '觀', '四世卦', 4],
        ['000001', '剝', '五世卦', 5],
        ['000101', '晉', '遊魂卦', 4],
        ['111101', '大有', '歸魂卦', 3],
    ];
    for (const [bits, name, generation, shiLine] of expected) {
        const info = C.hexagramInfo(bits);
        assert.equal(info.name, name);
        assert.equal(info.palace, '乾');
        assert.equal(info.palaceElement, '金');
        assert.equal(info.generation, generation);
        assert.equal(info.shiLine, shiLine);
    }
});

test('納甲裝卦：乾為天與坤為地', () => {
    assert.deepEqual(C.najiaOf('111111'), ['甲子', '甲寅', '甲辰', '壬午', '壬申', '壬戌']);
    assert.deepEqual(C.najiaOf('000000'), ['乙未', '乙巳', '乙卯', '癸丑', '癸亥', '癸酉']);
    // 上下卦不同時，內卦用下卦、外卦用上卦
    assert.deepEqual(C.najiaOf('101010'), ['己卯', '己丑', '己亥', '戊申', '戊戌', '戊子']);
});

test('六親以宮五行為我', () => {
    assert.equal(C.relativeOf('金', '金'), '兄弟');
    assert.equal(C.relativeOf('金', '土'), '父母');
    assert.equal(C.relativeOf('金', '水'), '子孫');
    assert.equal(C.relativeOf('金', '火'), '官鬼');
    assert.equal(C.relativeOf('金', '木'), '妻財');

    const chart = C.buildChart({ yao: [7, 7, 7, 7, 7, 7], date: taipei('2026-09-05 22:12:02') });
    assert.deepEqual(
        chart.lines.map((l) => l.relative),
        ['子孫', '妻財', '父母', '官鬼', '兄弟', '父母'],
    );
});

test('旺相休囚死依月令', () => {
    assert.equal(C.vigorOf('金', '金'), '旺');
    assert.equal(C.vigorOf('金', '水'), '相');
    assert.equal(C.vigorOf('金', '土'), '休');
    assert.equal(C.vigorOf('金', '木'), '死');
    assert.equal(C.vigorOf('金', '火'), '囚');
});

test('六神由日干起，初爻往上排', () => {
    const jiaDay = taipei('2026-09-07 12:00:00'); // 甲申日
    assert.equal(G.buildGanzhi(jiaDay).dayStem, '甲');
    const jia = C.buildChart({ yao: [7, 7, 7, 7, 7, 7], date: jiaDay });
    assert.deepEqual(
        jia.lines.map((l) => l.sixSpirit),
        ['青龍', '朱雀', '勾陳', '螣蛇', '白虎', '玄武'],
    );

    const renDay = taipei('2026-09-05 12:00:00'); // 壬午日
    const ren = C.buildChart({ yao: [7, 7, 7, 7, 7, 7], date: renDay });
    assert.deepEqual(
        ren.lines.map((l) => l.sixSpirit),
        ['玄武', '青龍', '朱雀', '勾陳', '螣蛇', '白虎'],
    );
});

test('化進神與化退神', () => {
    const idx = (name) => G.BRANCHES.indexOf(name);
    assert.equal(C.progressionOf(idx('亥'), idx('子')), '化進神');
    assert.equal(C.progressionOf(idx('子'), idx('亥')), '化退神');
    assert.equal(C.progressionOf(idx('寅'), idx('卯')), '化進神');
    assert.equal(C.progressionOf(idx('卯'), idx('寅')), '化退神');
    assert.equal(C.progressionOf(idx('丑'), idx('辰')), '化進神');
    assert.equal(C.progressionOf(idx('未'), idx('辰')), '化退神');
    assert.equal(C.progressionOf(idx('子'), idx('午')), null);
});

test('六沖卦與六合卦', () => {
    for (const bits of ['111111', '000000', '100100', '011011', '010010', '101101', '001001', '110110', '100111', '111100']) {
        assert.equal(C.hexagramInfo(bits).sixClash, true, `${C.HEXAGRAM_NAMES[bits]} 應為六沖卦`);
    }
    for (const bits of ['100000', '110010', '000100', '010110', '000111', '111000', '001101', '101001']) {
        assert.equal(C.hexagramInfo(bits).sixHarmony, true, `${C.HEXAGRAM_NAMES[bits]} 應為六合卦`);
    }
    assert.equal(C.hexagramInfo('101010').sixClash, false);
});

test('伏神取本宮首卦同爻位所缺的六親', () => {
    const chart = C.buildChart({ yao: [7, 8, 7, 8, 7, 8], date: taipei('2026-09-05 22:12:02') });
    assert.equal(chart.mainHexagram.name, '既濟');
    assert.deepEqual(chart.hexagramRelations.missingRelatives, ['妻財']);

    const withHidden = chart.lines.filter((l) => l.hiddenSpirit);
    assert.equal(withHidden.length, 1);
    const hidden = withHidden[0];
    assert.equal(hidden.position, 3);
    assert.equal(hidden.hiddenSpirit.relative, '妻財');
    assert.equal(hidden.hiddenSpirit.najiaStem + hidden.hiddenSpirit.najiaBranch, '戊午');
    assert.equal(hidden.hiddenSpirit.flyingBranch, '亥');
    assert.equal(hidden.hiddenSpirit.relation, '飛來剋伏');

    // 六親齊全的卦沒有伏神
    const qian = C.buildChart({ yao: [7, 7, 7, 7, 7, 7], date: taipei('2026-09-05 22:12:02') });
    assert.deepEqual(qian.hexagramRelations.missingRelatives, []);
    assert.equal(qian.lines.every((l) => l.hiddenSpirit === null), true);
});

test('爻序由下而上，不會上下顛倒', () => {
    // 地雷復：下震上坤。若爻序顛倒會變成山地剝。
    const fu = C.buildChart({ yao: [7, 8, 8, 8, 8, 8], date: taipei('2026-09-05 22:12:02') });
    assert.equal(fu.mainHexagram.name, '復');
    assert.equal(fu.mainHexagram.lowerTrigram, '震');
    assert.equal(fu.mainHexagram.upperTrigram, '坤');
    assert.equal(fu.lines[0].position, 1);
    assert.equal(fu.lines[0].yinYang, '陽');
    assert.equal(fu.lines[0].najiaStem + fu.lines[0].najiaBranch, '庚子');
    assert.equal(fu.lines[5].position, 6);
    assert.equal(fu.lines[5].yinYang, '陰');
    assert.equal(bitsOf(fu.yao), fu.mainHexagram.bits);

    const bo = C.buildChart({ yao: [8, 8, 8, 8, 8, 7], date: taipei('2026-09-05 22:12:02') });
    assert.equal(bo.mainHexagram.name, '剝');
});

test('動爻位置為 one-based，且與變卦一致', () => {
    const chart = C.buildChart({ yao: [9, 7, 8, 8, 6, 8], date: taipei('2026-09-05 22:12:02') });
    assert.deepEqual(chart.changingLines, [1, 5]);
    assert.deepEqual(
        chart.lines.filter((l) => l.moving).map((l) => l.position),
        [1, 5],
    );
    assert.equal(chart.lines[0].movingType, '老陽動');
    assert.equal(chart.lines[4].movingType, '老陰動');
    // 老陽變陰、老陰變陽，其餘不動：地澤臨 → 坎為水
    assert.equal(chart.mainHexagram.bits, '110000');
    assert.equal(chart.mainHexagram.name, '臨');
    assert.equal(chart.changedHexagram.bits, '010010');
    assert.equal(chart.changedHexagram.name, '坎');
});

test('六爻皆靜時沒有變卦', () => {
    const chart = C.buildChart({ yao: [7, 8, 7, 8, 7, 8], date: taipei('2026-09-05 22:12:02') });
    assert.deepEqual(chart.changingLines, []);
    assert.equal(chart.changedHexagram, null);
    assert.equal(chart.lines.every((l) => l.changed === null), true);
});

test('動爻回頭生剋與化空化墓', () => {
    const analyse = (from, to, ganzhi) =>
        C.analyseTransform(G.BRANCHES.indexOf(from), G.BRANCHES.indexOf(to), ganzhi);
    const ganzhi = G.buildGanzhi(taipei('2026-09-05 22:12:02')); // 申月、旬空申酉

    assert.ok(analyse('亥', '丑', ganzhi).includes('回頭剋'));
    assert.ok(analyse('丑', '午', ganzhi).includes('回頭生'));
    assert.ok(analyse('午', '戌', ganzhi).includes('化墓'));
    assert.ok(analyse('卯', '申', ganzhi).includes('化絕'));
    assert.ok(analyse('子', '申', ganzhi).includes('化空'));
    assert.ok(analyse('子', '寅', ganzhi).includes('化破')); // 申月沖寅
    assert.ok(analyse('子', '午', ganzhi).includes('化沖'));
});

test('月建日辰關係與旬空、暗動', () => {
    const chart = C.buildChart({ yao: [7, 8, 7, 8, 7, 8], date: taipei('2026-09-05 22:12:02') });
    const line = (p) => chart.lines[p - 1];

    // 四爻戊申金：申月扶、午日剋、且申在旬空
    assert.ok(line(4).relations.month.includes('月扶'));
    assert.ok(line(4).relations.day.includes('日剋'));
    assert.equal(line(4).relations.void, true);

    // 上爻戊子水：午日沖，本身得申月相生而旺相，故為暗動
    assert.equal(line(6).relations.dayClash, true);
    assert.equal(line(6).relations.hiddenAction, true);
    assert.equal(line(6).relations.dayBroken, false);

    // 初爻己卯木：申月剋木
    assert.ok(line(1).relations.month.includes('月剋'));
    assert.equal(line(1).relations.vigor, '死');
});

test('三合局偵測', () => {
    const idx = (names) => names.map((n) => G.BRANCHES.indexOf(n));
    assert.deepEqual(C.detectTriads(idx(['申', '子', '辰'])), [
        { name: '申子辰合水局', element: '水', type: '三合局' },
    ]);
    // 缺中神則不成半合
    assert.deepEqual(C.detectTriads(idx(['申', '辰'])), []);
    assert.deepEqual(C.detectTriads(idx(['申', '子'])), [
        { name: '申子辰合水局', element: '水', type: '半合' },
    ]);
});

test('roleMapping 只依明確給定的性別，不從文字臆測', () => {
    const question = '她心中的哪個人 是我還是他';
    const date = taipei('2026-09-05 22:12:02');

    const blank = C.buildChart({ yao: [7, 6, 9, 8, 7, 8], date, question });
    assert.equal(blank.roleMapping.querent.primarySymbol, '世爻');
    assert.equal(blank.roleMapping.target.status, 'requires_judgement');
    assert.equal(blank.roleMapping.target.primarySymbol, null);
    assert.equal(blank.roleMapping.thirdPerson.status, 'requires_judgement');
    assert.deepEqual(blank.roleMapping.thirdPerson.candidates, ['應爻', '兄弟爻', '官鬼爻']);

    const male = C.buildChart({ yao: [7, 6, 9, 8, 7, 8], date, question, gender: 'male' });
    assert.equal(male.roleMapping.target.primarySymbol, '妻財');
    assert.equal(male.roleMapping.target.status, 'suggested');
    // 第三人永遠需要判斷，不會因性別而被指定
    assert.equal(male.roleMapping.thirdPerson.status, 'requires_judgement');
    assert.equal(male.roleMapping.thirdPerson.primarySymbol, null);

    const female = C.buildChart({ yao: [7, 6, 9, 8, 7, 8], date, question, gender: 'female' });
    assert.equal(female.roleMapping.target.primarySymbol, '官鬼');
});

test('輸入驗證', () => {
    const date = taipei('2026-09-05 22:12:02');
    assert.throws(() => C.buildChart({ yao: [7, 7, 7, 7, 7], date }), /六個/);
    assert.throws(() => C.buildChart({ yao: [7, 7, 7, 7, 7, 5], date }), /6\/7\/8\/9/);
    assert.throws(() => C.buildChart({ yao: '777777', date }), /六個/);
});

test('buildChart 無共用狀態，同輸入得同輸出', () => {
    const args = { yao: [7, 6, 9, 8, 7, 8], date: taipei('2026-09-05 22:12:02'), question: 'x' };
    assert.deepEqual(C.buildChart(args), C.buildChart(args));
    // 不會改動傳入的 yao 陣列
    const yao = [7, 6, 9, 8, 7, 8];
    C.buildChart({ ...args, yao });
    assert.deepEqual(yao, [7, 6, 9, 8, 7, 8]);
    // 換時間會改變干支相關欄位
    const later = C.buildChart({ ...args, date: taipei('2026-09-06 22:12:02') });
    assert.notEqual(later.time.dayGanzhi, C.buildChart(args).time.dayGanzhi);
});

test('每卦每時都能排出完整盤面', () => {
    const date = taipei('2026-09-05 22:12:02');
    for (let bits = 0; bits < 64; bits++) {
        const yao = [];
        for (let i = 0; i < 6; i++) yao.push((bits >> i) & 1 ? 7 : 8);
        const chart = C.buildChart({ yao, date });
        assert.ok(chart.mainHexagram.name && chart.mainHexagram.name !== '未知');
        assert.ok(chart.mainHexagram.palace);
        assert.equal(chart.lines.length, 6);
        for (const line of chart.lines) {
            assert.ok(line.najiaStem && line.najiaBranch);
            assert.ok(line.element);
            assert.ok(C.RELATIVES.includes(line.relative));
            assert.ok(C.SIX_SPIRITS.includes(line.sixSpirit));
            assert.ok(line.relations.vigor);
        }
        assert.equal(chart.lines.filter((l) => l.shiYing === '世').length, 1);
        assert.equal(chart.lines.filter((l) => l.shiYing === '應').length, 1);
    }
});
