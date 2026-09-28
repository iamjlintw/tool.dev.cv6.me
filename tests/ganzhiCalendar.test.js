import test from 'node:test';
import assert from 'node:assert/strict';
import { GanzhiCalendar as G, taipei } from './_load.js';

test('六十甲子序號與干支互換', () => {
    assert.equal(G.sexagenary(0).name, '甲子');
    assert.equal(G.sexagenary(59).name, '癸亥');
    assert.equal(G.sexagenary(18).name, '壬午');
    assert.equal(G.sexagenary(-1).name, '癸亥');
});

test('日干支錨點', () => {
    const dayOf = (y, m, d) => G.sexagenary(G.dayIndexFromJdn(G.gregorianToJdn(y, m, d))).name;
    assert.equal(dayOf(1949, 10, 1), '甲子');
    assert.equal(dayOf(2000, 1, 1), '戊午');
    assert.equal(dayOf(2026, 9, 5), '壬午');
});

test('日干支逐日遞進且六十日一循環', () => {
    const base = G.gregorianToJdn(2026, 9, 5);
    const start = G.dayIndexFromJdn(base);
    for (let i = 1; i <= 60; i++) {
        assert.equal(G.dayIndexFromJdn(base + i), (start + i) % 60);
    }
    assert.equal(G.dayIndexFromJdn(base + 60), start);
});

test('儒略日與西曆互轉', () => {
    assert.equal(G.gregorianToJdn(2000, 1, 1), 2451545);
    for (const [y, m, d] of [[1900, 1, 1], [2026, 2, 28], [2024, 12, 31], [2100, 6, 15]]) {
        assert.deepEqual(G.jdnToGregorian(G.gregorianToJdn(y, m, d)), { year: y, month: m, day: d });
    }
});

test('旬空由旬首推出', () => {
    const xunkongOfName = (name) => {
        for (let i = 0; i < 60; i++) if (G.sexagenary(i).name === name) return G.xunkongOf(i);
        throw new Error(`找不到 ${name}`);
    };
    assert.deepEqual(xunkongOfName('甲子'), ['戌', '亥']);
    assert.deepEqual(xunkongOfName('癸酉'), ['戌', '亥']);
    assert.deepEqual(xunkongOfName('甲戌'), ['申', '酉']);
    assert.deepEqual(xunkongOfName('壬午'), ['申', '酉']);
    assert.deepEqual(xunkongOfName('甲午'), ['辰', '巳']);
});

test('節氣求根收斂到目標黃經', () => {
    for (const year of [1900, 1975, 2000, 2026, 2100]) {
        for (const term of G.MONTH_TERMS) {
            const ms = G.solarTermMs(year, term.lambda);
            const jde = G.msToJulianDay(ms) + G.deltaTSeconds(year) / 86400;
            let diff = Math.abs(G.solarApparentLongitude(jde) - term.lambda) % 360;
            if (diff > 180) diff = 360 - diff;
            assert.ok(diff < 1e-6, `${year} ${term.name} 誤差 ${diff}`);
        }
    }
});

test('節氣時刻對照公開曆表（容許 ±2 分鐘）', () => {
    const localOf = (year, name) => {
        const term = G.monthTermsOfYear(year).find((t) => t.name === name);
        return new Date(term.ms);
    };
    const expect = [
        [2000, '立春', '2000-02-04 20:40'],
        [2024, '立春', '2024-02-04 16:27'],
        [2024, '大雪', '2024-12-06 23:17'],
        [2026, '立春', '2026-02-04 04:02'],
        [2026, '白露', '2026-09-07 22:41'],
    ];
    for (const [year, name, text] of expect) {
        const delta = Math.abs(localOf(year, name).getTime() - taipei(`${text}:00`).getTime());
        assert.ok(delta <= 120000, `${year} ${name} 相差 ${Math.round(delta / 1000)} 秒`);
    }
});

test('每年十二節依序遞增且間隔約一個月', () => {
    for (const year of [1950, 2026, 2099]) {
        const terms = G.monthTermsOfYear(year);
        assert.equal(terms.length, 12);
        for (let i = 1; i < terms.length; i++) {
            const days = (terms[i].ms - terms[i - 1].ms) / 86400000;
            assert.ok(days > 28 && days < 33, `${year} ${terms[i].name} 間隔 ${days} 日`);
        }
    }
});

test('驗收案例的四柱與旬空', () => {
    const t = G.buildGanzhi(new Date('2026-09-05T14:12:02.711Z'));
    assert.equal(t.timezone, 'Asia/Taipei');
    assert.equal(t.startedAtUtc, '2026-09-05T14:12:02.711Z');
    assert.equal(t.startedAtLocal, '2026-09-05 22:12:02');
    assert.equal(t.yearGanzhi, '丙午');
    assert.equal(t.monthGanzhi, '丙申');
    assert.equal(t.dayGanzhi, '壬午');
    assert.equal(t.hourGanzhi, '辛亥');
    assert.equal(t.monthBranch, '申');
    assert.equal(t.dayBranch, '午');
    assert.equal(t.dayStem, '壬');
    assert.deepEqual(t.xunkong, ['申', '酉']);
    assert.equal(t.monthTerm, '立秋');
});

test('日柱以當地 23:00 換日，晚子時歸次日', () => {
    assert.equal(G.buildGanzhi(taipei('2026-09-05 22:59:59')).dayGanzhi, '壬午');
    const late = G.buildGanzhi(taipei('2026-09-05 23:00:00'));
    assert.equal(late.dayGanzhi, '癸未');
    assert.equal(late.lateZiHour, true);
    assert.equal(late.dayUsedForPillar, '2026-09-06');
    assert.equal(late.startedAtLocal, '2026-09-05 23:00:00');
    // 隔日 00:30 仍是子時，日柱與晚子時相同
    assert.equal(G.buildGanzhi(taipei('2026-09-06 00:30:00')).dayGanzhi, '癸未');
});

test('時柱隨時辰切換，時干用五鼠遁', () => {
    assert.equal(G.buildGanzhi(taipei('2026-09-05 20:59:59')).hourGanzhi, '庚戌');
    assert.equal(G.buildGanzhi(taipei('2026-09-05 21:00:00')).hourGanzhi, '辛亥');
    // 甲日子時起甲子，癸日子時起壬子
    const jiaDay = taipei('2026-09-07 00:30:00');
    assert.equal(G.buildGanzhi(jiaDay).dayStem, '甲');
    assert.equal(G.buildGanzhi(jiaDay).hourGanzhi, '甲子');
    assert.equal(G.buildGanzhi(taipei('2026-09-06 00:30:00')).hourGanzhi, '壬子');
});

test('年柱以立春換年，不是元旦', () => {
    assert.equal(G.buildGanzhi(taipei('2026-01-20 12:00:00')).yearGanzhi, '乙巳');
    assert.equal(G.buildGanzhi(taipei('2026-02-04 04:00:00')).yearGanzhi, '乙巳');
    assert.equal(G.buildGanzhi(taipei('2026-02-04 04:10:00')).yearGanzhi, '丙午');
    assert.equal(G.buildGanzhi(taipei('2026-12-31 23:30:00')).yearGanzhi, '丙午');
});

test('月柱以節換月', () => {
    // 2026 白露 22:41:28
    assert.equal(G.buildGanzhi(taipei('2026-09-07 22:40:00')).monthGanzhi, '丙申');
    assert.equal(G.buildGanzhi(taipei('2026-09-07 22:45:00')).monthGanzhi, '丁酉');
    // 小寒之後仍屬前一年的丑月
    assert.equal(G.buildGanzhi(taipei('2026-01-06 12:00:00')).monthBranch, '丑');
});
