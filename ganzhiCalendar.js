/**
 * ganzhiCalendar.js — 六爻排盤用的干支曆法核心
 *
 * 提供年、月、日、時四柱干支與旬空，供 liuyaoCore.js 使用。
 * 掛在全域 GanzhiCalendar，與 analytics.js / passwordGenerator.js 同樣是傳統 script，
 * 頁面可用 file:// 直接開啟，Node 端測試以 vm.runInThisContext 載入同一份檔案。
 *
 * 曆法規則（六爻慣例）：
 *   - 年柱以「立春」換年，不是元旦。
 *   - 月柱以「節」換月（立春→寅月、驚蟄→卯月…），不用中氣。
 *   - 日柱以當地 23:00（子時）換日；晚子時算次日日柱，月柱與年柱仍依實際時刻判定。
 *   - 時柱地支由當地時辰決定，時干用五鼠遁。
 *
 * 節氣時刻以截斷版 VSOP87D 地球黃經序列求太陽視黃經，再以牛頓法求根，
 * 並用 Espenak/Meeus 的 ΔT 多項式在 UT 與 TT 之間換算。
 * 適用範圍 1900–2100，誤差約在數秒以內。
 */
(function (global) {
    'use strict';

    const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
    const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

    /** 十二「節」的太陽視黃經與名稱，順序即寅月起算的月序。 */
    const MONTH_TERMS = [
        { lambda: 315, name: '立春' },
        { lambda: 345, name: '驚蟄' },
        { lambda: 15, name: '清明' },
        { lambda: 45, name: '立夏' },
        { lambda: 75, name: '芒種' },
        { lambda: 105, name: '小暑' },
        { lambda: 135, name: '立秋' },
        { lambda: 165, name: '白露' },
        { lambda: 195, name: '寒露' },
        { lambda: 225, name: '立冬' },
        { lambda: 255, name: '大雪' },
        { lambda: 285, name: '小寒' },
    ];

    // ------------------------------------------------------------ 時區與曆日

    /** 以 Intl 取得指定時區的年月日時分秒，不自行寫死時差。 */
    function getZonedParts(date, timeZone) {
        const dtf = new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hourCycle: 'h23',
        });
        const parts = {};
        for (const part of dtf.formatToParts(date)) {
            if (part.type !== 'literal') parts[part.type] = Number(part.value);
        }
        return {
            year: parts.year,
            month: parts.month,
            day: parts.day,
            hour: parts.hour,
            minute: parts.minute,
            second: parts.second,
        };
    }

    const pad = (n, width = 2) => String(n).padStart(width, '0');

    /** 把 getZonedParts 的結果格式化為 YYYY-MM-DD HH:mm:ss。 */
    function formatParts(p) {
        return `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
    }

    /** 西曆年月日 → 儒略日數（該日正午的整數 JD）。 */
    function gregorianToJdn(year, month, day) {
        const a = Math.floor((14 - month) / 12);
        const y = year + 4800 - a;
        const m = month + 12 * a - 3;
        return (
            day +
            Math.floor((153 * m + 2) / 5) +
            365 * y +
            Math.floor(y / 4) -
            Math.floor(y / 100) +
            Math.floor(y / 400) -
            32045
        );
    }

    /** 儒略日數 → 西曆年月日。 */
    function jdnToGregorian(jdn) {
        let a = jdn + 32044;
        const b = Math.floor((4 * a + 3) / 146097);
        const c = a - Math.floor((146097 * b) / 4);
        const d = Math.floor((4 * c + 3) / 1461);
        const e = c - Math.floor((1461 * d) / 4);
        const m = Math.floor((5 * e + 2) / 153);
        return {
            year: 100 * b + d - 4800 + Math.floor(m / 10),
            month: m + 3 - 12 * Math.floor(m / 10),
            day: e - Math.floor((153 * m + 2) / 5) + 1,
        };
    }

    /** UTC 時刻（毫秒）→ 儒略日（含小數）。 */
    function msToJulianDay(ms) {
        return ms / 86400000 + 2440587.5;
    }

    /** 儒略日（含小數）→ UTC 時刻（毫秒）。 */
    function julianDayToMs(jd) {
        return (jd - 2440587.5) * 86400000;
    }

    // ------------------------------------------------------------ 六十甲子

    /**
     * 六十甲子序號 → 干支。序號 0 為甲子。
     */
    function sexagenary(index) {
        const n = ((index % 60) + 60) % 60;
        const stem = STEMS[n % 10];
        const branch = BRANCHES[n % 12];
        return { index: n, stem, branch, name: stem + branch, stemIndex: n % 10, branchIndex: n % 12 };
    }

    /** 日干支序號：以 1949-10-01 為甲子日校驗得出的偏移量。 */
    function dayIndexFromJdn(jdn) {
        return (((jdn + 49) % 60) + 60) % 60;
    }

    /**
     * 旬空（空亡）：取該日所在旬的旬首，旬中未配到的兩個地支即為空亡。
     */
    function xunkongOf(dayIndex) {
        const headBranch = (dayIndex - (dayIndex % 10)) % 12;
        return [BRANCHES[(headBranch + 10) % 12], BRANCHES[(headBranch + 11) % 12]];
    }

    /** 旬首干支名，例如「甲戌」。 */
    function xunHeadOf(dayIndex) {
        return sexagenary(dayIndex - (dayIndex % 10)).name;
    }

    // ------------------------------------------------------------ 太陽視黃經

    const RAD = Math.PI / 180;

    /**
     * 截斷版 VSOP87D 地球日心黃經序列（Meeus, Astronomical Algorithms, Table 32.A）。
     * 每筆為 [A, B, C]，單位 1e-8 弧度；L = Σ A·cos(B + C·τ)。
     */
    const EARTH_L0 = [
        [175347046, 0, 0], [3341656, 4.6692568, 6283.07585], [34894, 4.6261, 12566.1517],
        [3497, 2.7441, 5753.3849], [3418, 2.8289, 3.5231], [3136, 3.6277, 77713.7715],
        [2676, 4.4181, 7860.4194], [2343, 6.1352, 3930.2097], [1324, 0.7425, 11506.7698],
        [1273, 2.0371, 529.691], [1199, 1.1096, 1577.3435], [990, 5.233, 5884.927],
        [902, 2.045, 26.298], [857, 3.508, 398.149], [780, 1.179, 5223.694],
        [753, 2.533, 5507.553], [505, 4.583, 18849.228], [492, 4.205, 775.523],
        [357, 2.92, 0.067], [317, 5.849, 11790.629], [284, 1.899, 796.298],
        [271, 0.315, 10977.079], [243, 0.345, 5486.778], [206, 4.806, 2544.314],
        [205, 1.869, 5573.143], [202, 2.458, 6069.777], [156, 0.833, 213.299],
        [132, 3.411, 2942.463], [126, 1.083, 20.775], [115, 0.645, 0.98],
        [103, 0.636, 4694.003], [102, 0.976, 15720.839], [102, 4.267, 7.114],
        [99, 6.21, 2146.17], [98, 0.68, 155.42], [86, 5.98, 161000.69],
        [85, 1.3, 6275.96], [85, 3.67, 71430.7], [80, 1.81, 17260.15],
        [79, 3.04, 12036.46], [75, 1.76, 5088.63], [74, 3.5, 3154.69],
        [74, 4.68, 801.82], [70, 0.83, 9437.76], [62, 3.98, 8827.39],
        [61, 1.82, 7084.9], [57, 2.78, 6286.6], [56, 4.39, 14143.5],
        [56, 3.47, 6279.55], [52, 0.19, 12139.55], [52, 1.33, 1748.02],
        [51, 0.28, 5856.48], [49, 0.49, 1194.45], [41, 5.37, 8429.24],
        [41, 2.4, 19651.05], [39, 6.17, 10447.39], [37, 6.04, 10213.29],
        [37, 2.57, 1059.38], [36, 1.71, 2352.87], [36, 1.78, 6812.77],
        [33, 0.59, 17789.85], [30, 0.44, 83996.85], [30, 2.74, 1349.87],
        [25, 3.16, 4690.48],
    ];

    const EARTH_L1 = [
        [628331966747, 0, 0], [206059, 2.678235, 6283.07585], [4303, 2.6351, 12566.1517],
        [425, 1.59, 3.523], [119, 5.796, 26.298], [109, 2.966, 1577.344],
        [93, 2.59, 18849.23], [72, 1.14, 529.69], [68, 1.87, 398.15],
        [67, 4.41, 5507.55], [59, 2.89, 5223.69], [56, 2.17, 155.42],
        [45, 0.4, 796.3], [36, 0.47, 775.52], [29, 2.65, 7.11],
        [21, 5.34, 0.98], [19, 1.85, 5486.78], [19, 4.97, 213.3],
        [17, 2.99, 6275.96], [16, 0.03, 2544.31], [16, 1.43, 2146.17],
        [15, 1.21, 10977.08], [12, 2.83, 1748.02], [12, 3.26, 5088.63],
        [12, 5.27, 1194.45], [12, 2.08, 4694], [11, 0.77, 553.57],
        [10, 1.3, 6286.6], [10, 4.24, 1349.87], [9, 2.7, 242.73],
        [9, 5.64, 951.72], [8, 5.3, 2352.87], [6, 2.65, 9437.76],
        [6, 4.67, 4690.48],
    ];

    const EARTH_L2 = [
        [52919, 0, 0], [8720, 1.0721, 6283.0758], [309, 0.867, 12566.152],
        [27, 0.05, 3.52], [16, 5.19, 26.3], [16, 3.68, 155.42],
        [10, 0.76, 18849.23], [9, 2.06, 77713.77], [7, 0.83, 775.52],
        [5, 4.66, 1577.34], [4, 1.03, 7.11], [4, 3.44, 5573.14],
        [3, 5.14, 796.3], [3, 6.05, 5507.55], [3, 1.19, 242.73],
        [3, 6.12, 529.69], [3, 0.31, 398.15], [3, 2.28, 553.57],
        [2, 4.38, 5223.69], [2, 3.75, 0.98],
    ];

    const EARTH_L3 = [
        [289, 5.844, 6283.076], [35, 0, 0], [17, 5.49, 12566.15],
        [3, 5.2, 155.42], [1, 4.72, 3.52], [1, 5.3, 18849.23],
        [1, 5.97, 242.73],
    ];

    const EARTH_L4 = [[114, 3.142, 0], [8, 4.13, 6283.08], [1, 3.84, 12566.15]];
    const EARTH_L5 = [[1, 3.14, 0]];

    const EARTH_L = [EARTH_L0, EARTH_L1, EARTH_L2, EARTH_L3, EARTH_L4, EARTH_L5];

    function seriesSum(terms, tau) {
        let sum = 0;
        for (let i = 0; i < terms.length; i++) {
            sum += terms[i][0] * Math.cos(terms[i][1] + terms[i][2] * tau);
        }
        return sum;
    }

    /** 太陽視黃經（度，0–360）。輸入為力學時 TT 的儒略日。 */
    function solarApparentLongitude(jde) {
        const tau = (jde - 2451545) / 365250; // 儒略千年
        let heliocentric = 0;
        for (let i = EARTH_L.length - 1; i >= 0; i--) {
            heliocentric = heliocentric * tau + seriesSum(EARTH_L[i], tau);
        }
        heliocentric /= 1e8; // 弧度

        // 地心視黃經 = 日心黃經 + 180°
        let lambda = (heliocentric / RAD + 180) % 360;

        const t = (jde - 2451545) / 36525;
        // VSOP87 動力學黃道 → FK5
        lambda -= 0.09033 / 3600;
        // 章動（主項）與周年光行差
        const omega = 125.04452 - 1934.136261 * t;
        lambda += -0.00478 * Math.sin(omega * RAD) - 0.005691611;

        return ((lambda % 360) + 360) % 360;
    }

    /**
     * ΔT（TT − UT，秒）。Espenak & Meeus 多項式，涵蓋 1900–2150。
     */
    function deltaTSeconds(year) {
        let t;
        if (year < 1920) {
            t = year - 1900;
            return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
        }
        if (year < 1941) {
            t = year - 1920;
            return 21.2 + 0.84493 * t - 0.0761 * t * t + 0.0020936 * t ** 3;
        }
        if (year < 1961) {
            t = year - 1950;
            return 29.07 + 0.407 * t - (t * t) / 233 + t ** 3 / 2547;
        }
        if (year < 1986) {
            t = year - 1975;
            return 45.45 + 1.067 * t - (t * t) / 260 - t ** 3 / 718;
        }
        if (year < 2005) {
            t = year - 2000;
            return (
                63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * t ** 3 +
                0.000651814 * t ** 4 + 0.00002373599 * t ** 5
            );
        }
        if (year < 2050) {
            t = year - 2000;
            return 62.92 + 0.32217 * t + 0.005589 * t * t;
        }
        if (year < 2150) {
            const u = (year - 1820) / 100;
            return -20 + 32 * u * u - 0.5628 * (2150 - year);
        }
        const u = (year - 1820) / 100;
        return -20 + 32 * u * u;
    }

    /**
     * 求指定西曆年內太陽視黃經抵達 targetLambda 的世界時時刻（毫秒）。
     * 以該年 1 月 1 日為起點、太陽每日約行 0.9856° 估初值，再牛頓迭代收斂。
     */
    function solarTermMs(year, targetLambda) {
        const jan1 = gregorianToJdn(year, 1, 1) - 0.5; // 該年 1/1 00:00 UT
        const startLambda = solarApparentLongitude(jan1 + deltaTSeconds(year) / 86400);
        const gap = (((targetLambda - startLambda) % 360) + 360) % 360;

        let jdUt = jan1 + gap / 0.9856473;
        for (let i = 0; i < 12; i++) {
            const jde = jdUt + deltaTSeconds(year) / 86400;
            const lambda = solarApparentLongitude(jde);
            let diff = (targetLambda - lambda) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            const step = diff / 0.9856473;
            jdUt += step;
            if (Math.abs(step) < 1e-8) break;
        }
        return julianDayToMs(jdUt);
    }

    const termCache = new Map();

    /** 指定西曆年的十二個「節」，依時間排序。 */
    function monthTermsOfYear(year) {
        if (termCache.has(year)) return termCache.get(year);
        const list = MONTH_TERMS.map((term, order) => ({
            name: term.name,
            lambda: term.lambda,
            ms: solarTermMs(year, term.lambda),
            // 立春為寅月（地支序 2），其後每節進一位
            branchIndex: (order + 2) % 12,
            monthOrder: order,
        })).sort((a, b) => a.ms - b.ms);
        termCache.set(year, list);
        return list;
    }

    /** 找出時刻 ms 當令的「節」，跨年時自動往前一年找。 */
    function activeMonthTerm(ms, localYear) {
        const candidates = [
            ...monthTermsOfYear(localYear - 1),
            ...monthTermsOfYear(localYear),
            ...monthTermsOfYear(localYear + 1),
        ].sort((a, b) => a.ms - b.ms);

        let active = candidates[0];
        for (const term of candidates) {
            if (term.ms <= ms) active = term;
            else break;
        }
        return active;
    }

    /** 指定西曆年立春的世界時時刻（毫秒）。 */
    function lichunMs(year) {
        return monthTermsOfYear(year).find((t) => t.name === '立春').ms;
    }

    // ------------------------------------------------------------ 四柱

    /**
     * 由起卦時刻建立完整干支資料。
     *
     * @param {Date}   date     起卦時刻（絕對時間）
     * @param {string} timeZone IANA 時區，預設 Asia/Taipei
     */
    function buildGanzhi(date, timeZone = 'Asia/Taipei') {
        const when = date instanceof Date ? date : new Date(date);
        const ms = when.getTime();
        const local = getZonedParts(when, timeZone);

        // 日柱：以當地 23:00 換日，晚子時歸次日
        let jdn = gregorianToJdn(local.year, local.month, local.day);
        const rolledToNextDay = local.hour >= 23;
        if (rolledToNextDay) jdn += 1;
        const dayIndex = dayIndexFromJdn(jdn);
        const day = sexagenary(dayIndex);
        const dayCivil = jdnToGregorian(jdn);

        // 年柱：立春換年，依實際時刻判定
        const solarYear = ms >= lichunMs(local.year) ? local.year : local.year - 1;
        const year = sexagenary(((solarYear - 4) % 60 + 60) % 60);

        // 月柱：節換月，月干用五虎遁
        const term = activeMonthTerm(ms, local.year);
        const monthBranchIndex = term.branchIndex;
        const monthStemIndex = ((year.stemIndex % 5) * 2 + 2 + term.monthOrder) % 10;
        const month = {
            stem: STEMS[monthStemIndex],
            branch: BRANCHES[monthBranchIndex],
            name: STEMS[monthStemIndex] + BRANCHES[monthBranchIndex],
            stemIndex: monthStemIndex,
            branchIndex: monthBranchIndex,
        };

        // 時柱：時支依當地時辰，時干用五鼠遁
        const hourBranchIndex = Math.floor(((local.hour + 1) % 24) / 2);
        const hourStemIndex = ((day.stemIndex % 5) * 2 + hourBranchIndex) % 10;
        const hour = {
            stem: STEMS[hourStemIndex],
            branch: BRANCHES[hourBranchIndex],
            name: STEMS[hourStemIndex] + BRANCHES[hourBranchIndex],
            stemIndex: hourStemIndex,
            branchIndex: hourBranchIndex,
        };

        return {
            timezone: timeZone,
            startedAtUtc: when.toISOString(),
            startedAtLocal: formatParts(local),
            dayBoundary: '23:00',
            dayUsedForPillar: `${pad(dayCivil.year, 4)}-${pad(dayCivil.month)}-${pad(dayCivil.day)}`,
            lateZiHour: rolledToNextDay,
            yearGanzhi: year.name,
            monthGanzhi: month.name,
            dayGanzhi: day.name,
            hourGanzhi: hour.name,
            yearStem: year.stem,
            yearBranch: year.branch,
            monthStem: month.stem,
            monthBranch: month.branch,
            dayStem: day.stem,
            dayBranch: day.branch,
            hourStem: hour.stem,
            hourBranch: hour.branch,
            monthTerm: term.name,
            monthTermStartLocal: formatParts(getZonedParts(new Date(term.ms), timeZone)),
            xun: xunHeadOf(dayIndex),
            xunkong: xunkongOf(dayIndex),
            dayIndex,
        };
    }

    global.GanzhiCalendar = {
        STEMS,
        BRANCHES,
        MONTH_TERMS,
        getZonedParts,
        formatParts,
        gregorianToJdn,
        jdnToGregorian,
        msToJulianDay,
        julianDayToMs,
        sexagenary,
        dayIndexFromJdn,
        xunkongOf,
        xunHeadOf,
        solarApparentLongitude,
        deltaTSeconds,
        solarTermMs,
        monthTermsOfYear,
        activeMonthTerm,
        lichunMs,
        buildGanzhi,
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
