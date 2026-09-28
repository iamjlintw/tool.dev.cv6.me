/**
 * liuyaoCore.js — 納甲六爻排盤核心
 *
 * 由六爻數值（6/7/8/9，索引 0 為初爻）與起卦時刻產生完整盤面：
 * 卦名、八宮、世應、納甲、五行、六親、六神、伏神、動變，以及月建日辰的生剋沖合空破。
 *
 * 依賴 ganzhiCalendar.js（需先載入）。掛在全域 LiuyaoCore，兩個 liuyao 頁面皆可共用。
 *
 * 爻序契約：輸入 yao[0] 為初爻（最下）；輸出 lines[i].position === i + 1，一律由下而上。
 * 對外欄位（changingLines、position、shiLine、yingLine）全部是 one-based。
 */
(function (global) {
    'use strict';

    const calendar = global.GanzhiCalendar;
    if (!calendar) throw new Error('liuyaoCore.js 需要先載入 ganzhiCalendar.js');

    const BRANCHES = calendar.BRANCHES;

    // ------------------------------------------------------------ 基礎資料表

    /** 六十四卦：鍵為六爻二進位字串，第 1 個字元是初爻（陽 1 陰 0）。 */
    const HEXAGRAM_NAMES = {
        '111111': '乾', '000000': '坤', '100010': '屯', '010001': '蒙', '111010': '需', '010111': '訟',
        '010000': '師', '000010': '比', '111011': '小畜', '110111': '履', '111000': '泰', '000111': '否',
        '101111': '同人', '111101': '大有', '001000': '謙', '000100': '豫', '100110': '隨', '011001': '蠱',
        '110000': '臨', '000011': '觀', '100101': '噬嗑', '101001': '賁', '000001': '剝', '100000': '復',
        '100111': '無妄', '111001': '大畜', '100001': '頤', '011110': '大過', '010010': '坎', '101101': '離',
        '001110': '咸', '011100': '恆', '001111': '遯', '111100': '大壯', '000101': '晉', '101000': '明夷',
        '101011': '家人', '110101': '睽', '001010': '蹇', '010100': '解', '110001': '損', '100011': '益',
        '111110': '夬', '011111': '姤', '000110': '萃', '011000': '升', '010110': '困', '011010': '井',
        '101110': '革', '011101': '鼎', '100100': '震', '001001': '艮', '001011': '漸', '110100': '歸妹',
        '101100': '豐', '001101': '旅', '011011': '巽', '110110': '兌', '010011': '渙', '110010': '節',
        '110011': '中孚', '001100': '小過', '101010': '既濟', '010101': '未濟',
    };

    /** 八卦：鍵為三爻二進位字串，第 1 個字元是最下一爻。 */
    const TRIGRAMS = {
        '111': { name: '乾', element: '金', symbol: '☰' },
        '110': { name: '兌', element: '金', symbol: '☱' },
        '101': { name: '離', element: '火', symbol: '☲' },
        '100': { name: '震', element: '木', symbol: '☳' },
        '011': { name: '巽', element: '木', symbol: '☴' },
        '010': { name: '坎', element: '水', symbol: '☵' },
        '001': { name: '艮', element: '土', symbol: '☶' },
        '000': { name: '坤', element: '土', symbol: '☷' },
    };

    /**
     * 八卦納甲：inner 為內卦（初、二、三爻），outer 為外卦（四、五、六爻）。
     */
    const NAJIA = {
        乾: { inner: ['甲子', '甲寅', '甲辰'], outer: ['壬午', '壬申', '壬戌'] },
        坎: { inner: ['戊寅', '戊辰', '戊午'], outer: ['戊申', '戊戌', '戊子'] },
        艮: { inner: ['丙辰', '丙午', '丙申'], outer: ['丙戌', '丙子', '丙寅'] },
        震: { inner: ['庚子', '庚寅', '庚辰'], outer: ['庚午', '庚申', '庚戌'] },
        巽: { inner: ['辛丑', '辛亥', '辛酉'], outer: ['辛未', '辛巳', '辛卯'] },
        離: { inner: ['己卯', '己丑', '己亥'], outer: ['己酉', '己未', '己巳'] },
        坤: { inner: ['乙未', '乙巳', '乙卯'], outer: ['癸丑', '癸亥', '癸酉'] },
        兌: { inner: ['丁巳', '丁卯', '丁丑'], outer: ['丁亥', '丁酉', '丁未'] },
    };

    /** 地支五行，索引與 GanzhiCalendar.BRANCHES 一致。 */
    const BRANCH_ELEMENTS = ['水', '土', '木', '木', '土', '火', '火', '土', '金', '金', '土', '水'];

    const GENERATES = { 木: '火', 火: '土', 土: '金', 金: '水', 水: '木' };
    const OVERCOMES = { 木: '土', 土: '水', 水: '火', 火: '金', 金: '木' };

    /** 八宮：純卦位元與宮的五行。順序即乾、坎、艮、震、巽、離、坤、兌。 */
    const PALACES = [
        { name: '乾', bits: '111111', element: '金' },
        { name: '坎', bits: '010010', element: '水' },
        { name: '艮', bits: '001001', element: '土' },
        { name: '震', bits: '100100', element: '木' },
        { name: '巽', bits: '011011', element: '木' },
        { name: '離', bits: '101101', element: '火' },
        { name: '坤', bits: '000000', element: '土' },
        { name: '兌', bits: '110110', element: '金' },
    ];

    /** 八宮每一卦的世次名稱與世爻位置（one-based）。 */
    const GENERATION_ORDER = [
        { generation: '本宮卦', shiLine: 6 },
        { generation: '一世卦', shiLine: 1 },
        { generation: '二世卦', shiLine: 2 },
        { generation: '三世卦', shiLine: 3 },
        { generation: '四世卦', shiLine: 4 },
        { generation: '五世卦', shiLine: 5 },
        { generation: '遊魂卦', shiLine: 4 },
        { generation: '歸魂卦', shiLine: 3 },
    ];

    const SIX_SPIRITS = ['青龍', '朱雀', '勾陳', '螣蛇', '白虎', '玄武'];
    /** 日干起六神：甲乙青龍、丙丁朱雀、戊勾陳、己螣蛇、庚辛白虎、壬癸玄武。 */
    const SPIRIT_START_BY_STEM = [0, 0, 1, 1, 2, 3, 4, 4, 5, 5];

    /** 六合：索引為地支序，值為合的對象地支序。 */
    const SIX_HARMONY = [1, 0, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

    /** 三合局。 */
    const TRIADS = [
        { branches: [8, 0, 4], element: '水', name: '申子辰合水局' },
        { branches: [11, 3, 7], element: '木', name: '亥卯未合木局' },
        { branches: [2, 6, 10], element: '火', name: '寅午戌合火局' },
        { branches: [5, 9, 1], element: '金', name: '巳酉丑合金局' },
    ];

    /** 五行的墓庫與絕地（水土同宮）。 */
    const TOMB_BRANCH = { 木: 7, 火: 10, 金: 1, 水: 4, 土: 4 };
    const EXHAUST_BRANCH = { 木: 8, 火: 11, 金: 2, 水: 5, 土: 5 };

    /** 同五行地支的進退序列，相鄰前進為化進、後退為化退。 */
    const PROGRESSION = [[11, 0], [2, 3], [5, 6], [8, 9], [1, 4, 7, 10]];

    /** 六沖卦：八純卦加天雷無妄、雷天大壯。 */
    const SIX_CLASH_HEXAGRAMS = new Set([
        '111111', '000000', '100100', '011011', '010010', '101101', '001001', '110110',
        '100111', '111100',
    ]);

    /** 六合卦。 */
    const SIX_HARMONY_HEXAGRAMS = new Set([
        '100000', '110010', '000100', '010110', '000111', '111000', '001101', '101001',
    ]);

    const RELATIVES = ['父母', '兄弟', '子孫', '妻財', '官鬼'];

    // ------------------------------------------------------------ 五行工具

    const generates = (a, b) => GENERATES[a] === b;
    const overcomes = (a, b) => OVERCOMES[a] === b;

    /** 以宮五行為「我」，推該爻地支五行的六親。 */
    function relativeOf(palaceElement, lineElement) {
        if (palaceElement === lineElement) return '兄弟';
        if (generates(lineElement, palaceElement)) return '父母';
        if (generates(palaceElement, lineElement)) return '子孫';
        if (overcomes(lineElement, palaceElement)) return '官鬼';
        if (overcomes(palaceElement, lineElement)) return '妻財';
        return null;
    }

    /** 月令五行對某五行的旺相休囚死。 */
    function vigorOf(monthElement, element) {
        if (monthElement === element) return '旺';
        if (generates(monthElement, element)) return '相';
        if (generates(element, monthElement)) return '休';
        if (overcomes(monthElement, element)) return '死';
        if (overcomes(element, monthElement)) return '囚';
        return null;
    }

    const isClash = (a, b) => (a + 6) % 12 === b % 12;
    const isHarmony = (a, b) => SIX_HARMONY[a] === b;

    /** 同五行地支的化進 / 化退，非同五行或不相鄰回傳 null。 */
    function progressionOf(fromBranch, toBranch) {
        for (const seq of PROGRESSION) {
            const from = seq.indexOf(fromBranch);
            const to = seq.indexOf(toBranch);
            if (from === -1 || to === -1) continue;
            if (to === from + 1) return '化進神';
            if (to === from - 1) return '化退神';
            return null;
        }
        return null;
    }

    // ------------------------------------------------------------ 八宮卦表

    const flipBits = (bits, positions) => {
        const arr = bits.split('');
        for (const p of positions) arr[p] = arr[p] === '1' ? '0' : '1';
        return arr.join('');
    };

    /**
     * 由八純卦依序翻爻推出六十四卦的宮位與世應，避免手抄 64 筆造成錯誤。
     * 本宮 → 一世翻初爻 → 逐爻累加至五世 → 遊魂（五世再翻第四爻）→ 歸魂（僅第五爻與本宮相異）。
     */
    function buildPalaceTable() {
        const table = {};
        for (const palace of PALACES) {
            const variants = [
                palace.bits,
                flipBits(palace.bits, [0]),
                flipBits(palace.bits, [0, 1]),
                flipBits(palace.bits, [0, 1, 2]),
                flipBits(palace.bits, [0, 1, 2, 3]),
                flipBits(palace.bits, [0, 1, 2, 3, 4]),
                flipBits(palace.bits, [0, 1, 2, 4]),
                flipBits(palace.bits, [4]),
            ];
            variants.forEach((bits, idx) => {
                const shiLine = GENERATION_ORDER[idx].shiLine;
                table[bits] = {
                    palace: palace.name,
                    palaceElement: palace.element,
                    palaceBits: palace.bits,
                    generation: GENERATION_ORDER[idx].generation,
                    shiLine,
                    yingLine: shiLine > 3 ? shiLine - 3 : shiLine + 3,
                };
            });
        }
        return table;
    }

    const PALACE_TABLE = buildPalaceTable();

    /** 六爻二進位字串 → 納甲六爻的天干地支，索引 0 為初爻。 */
    function najiaOf(bits) {
        const lower = TRIGRAMS[bits.slice(0, 3)].name;
        const upper = TRIGRAMS[bits.slice(3, 6)].name;
        return [...NAJIA[lower].inner, ...NAJIA[upper].outer];
    }

    /** 六爻二進位字串 → 卦的基本資訊。 */
    function hexagramInfo(bits) {
        const info = PALACE_TABLE[bits];
        const lower = TRIGRAMS[bits.slice(0, 3)];
        const upper = TRIGRAMS[bits.slice(3, 6)];
        return {
            name: HEXAGRAM_NAMES[bits] || '未知',
            bits,
            upperTrigram: upper.name,
            lowerTrigram: lower.name,
            upperTrigramElement: upper.element,
            lowerTrigramElement: lower.element,
            palace: info.palace,
            palaceElement: info.palaceElement,
            generation: info.generation,
            shiLine: info.shiLine,
            yingLine: info.yingLine,
            sixClash: SIX_CLASH_HEXAGRAMS.has(bits),
            sixHarmony: SIX_HARMONY_HEXAGRAMS.has(bits),
        };
    }

    // ------------------------------------------------------------ 排盤

    const toBit = (value) => (value % 2 === 0 ? '0' : '1');
    const toChangedBit = (value) => (value === 6 ? '1' : value === 9 ? '0' : toBit(value));

    /**
     * 計算某爻與月建、日辰的關係。
     *
     * @param {number} branchIndex 該爻地支序
     * @param {object} ganzhi      GanzhiCalendar.buildGanzhi 的結果
     * @param {boolean} moving     是否為動爻
     */
    function analyseRelations(branchIndex, ganzhi, moving) {
        const element = BRANCH_ELEMENTS[branchIndex];
        const monthBranch = BRANCHES.indexOf(ganzhi.monthBranch);
        const dayBranch = BRANCHES.indexOf(ganzhi.dayBranch);
        const monthElement = BRANCH_ELEMENTS[monthBranch];
        const dayElement = BRANCH_ELEMENTS[dayBranch];

        const month = [];
        if (monthElement === element) month.push('月扶');
        if (generates(monthElement, element)) month.push('月生');
        if (overcomes(monthElement, element)) month.push('月剋');
        if (generates(element, monthElement)) month.push('洩於月');
        if (overcomes(element, monthElement)) month.push('剋月');
        const monthBroken = isClash(monthBranch, branchIndex);
        if (monthBroken) month.push('月破');
        const monthCombine = isHarmony(monthBranch, branchIndex);
        if (monthCombine) month.push('月合');

        const day = [];
        if (dayElement === element) day.push('日扶');
        if (generates(dayElement, element)) day.push('日生');
        if (overcomes(dayElement, element)) day.push('日剋');
        if (generates(element, dayElement)) day.push('洩於日');
        if (overcomes(element, dayElement)) day.push('剋日');
        const dayClash = isClash(dayBranch, branchIndex);
        if (dayClash) day.push('日沖');
        const dayCombine = isHarmony(dayBranch, branchIndex);
        if (dayCombine) day.push('日合');
        const entombedByDay = TOMB_BRANCH[element] === dayBranch && dayBranch !== branchIndex;
        if (entombedByDay) day.push('日墓');

        const isVoid = ganzhi.xunkong.indexOf(BRANCHES[branchIndex]) !== -1;
        const vigor = vigorOf(monthElement, element);

        // 暗動：靜爻逢日沖而本身旺相且不空；否則以日破論。
        const strong = vigor === '旺' || vigor === '相';
        const hiddenAction = !moving && dayClash && strong && !isVoid;
        const dayBroken = !moving && dayClash && !hiddenAction;
        if (hiddenAction) day.push('暗動');
        if (dayBroken) day.push('日破');

        return {
            month,
            day,
            void: isVoid,
            monthBroken,
            monthCombine,
            dayClash,
            dayCombine,
            dayBroken,
            entombedByDay,
            hiddenAction,
            vigor,
        };
    }

    /** 動爻與其變爻之間的化生化剋、進退、空破墓絕。 */
    function analyseTransform(fromBranch, toBranch, ganzhi) {
        const fromElement = BRANCH_ELEMENTS[fromBranch];
        const toElement = BRANCH_ELEMENTS[toBranch];
        const transforms = [];

        if (generates(toElement, fromElement)) transforms.push('回頭生');
        if (overcomes(toElement, fromElement)) transforms.push('回頭剋');
        if (generates(fromElement, toElement)) transforms.push('化洩');
        if (overcomes(fromElement, toElement)) transforms.push('化剋出');
        if (fromElement === toElement && fromBranch === toBranch) transforms.push('化伏吟');

        const progression = progressionOf(fromBranch, toBranch);
        if (progression) transforms.push(progression);

        const monthBranch = BRANCHES.indexOf(ganzhi.monthBranch);
        if (ganzhi.xunkong.indexOf(BRANCHES[toBranch]) !== -1) transforms.push('化空');
        if (isClash(monthBranch, toBranch)) transforms.push('化破');
        if (TOMB_BRANCH[fromElement] === toBranch) transforms.push('化墓');
        if (EXHAUST_BRANCH[fromElement] === toBranch) transforms.push('化絕');
        if (isClash(fromBranch, toBranch)) transforms.push('化沖');

        return transforms;
    }

    /**
     * 伏神：本卦六親不全時，取本宮首卦相同爻位、且六親正是本卦所缺者為伏神，
     * 本卦該爻即為飛神。
     */
    function findHiddenSpirits(mainInfo, lineRelatives) {
        const present = new Set(lineRelatives);
        const missing = RELATIVES.filter((r) => !present.has(r));
        if (!missing.length) return {};

        const pureNajia = najiaOf(mainInfo.palaceBits || PALACE_TABLE[mainInfo.bits].palaceBits);
        const hidden = {};
        pureNajia.forEach((ganzhiText, idx) => {
            const branch = ganzhiText[1];
            const branchIndex = BRANCHES.indexOf(branch);
            const element = BRANCH_ELEMENTS[branchIndex];
            const relative = relativeOf(mainInfo.palaceElement, element);
            if (missing.indexOf(relative) === -1) return;
            hidden[idx] = {
                najiaStem: ganzhiText[0],
                najiaBranch: branch,
                element,
                relative,
                branchIndex,
            };
        });
        return hidden;
    }

    /** 卦中已成的三合局（三支齊全為全合，兩支為半合）。 */
    function detectTriads(branchIndexes) {
        const found = [];
        for (const triad of TRIADS) {
            const hit = triad.branches.filter((b) => branchIndexes.indexOf(b) !== -1);
            if (hit.length === 3) found.push({ name: triad.name, element: triad.element, type: '三合局' });
            else if (hit.length === 2 && hit.indexOf(triad.branches[1]) !== -1) {
                found.push({ name: triad.name, element: triad.element, type: '半合' });
            }
        }
        return found;
    }

    /**
     * 角色定位提示。程式不從問題文字猜性別或角色，只依明確給定的 gender 套固定規則；
     * 其餘一律標記為需要判斷並列出候選。這是解讀提示，不能取代盤面資料。
     */
    function buildRoleMapping(gender) {
        const target =
            gender === 'male'
                ? {
                      label: '她',
                      primarySymbol: '妻財',
                      reason: '問卦者已指定為男性，男問女以妻財為感情用神；仍須結合盤面確認妻財旺衰與世爻生合關係。',
                      status: 'suggested',
                      candidates: ['妻財', '應爻'],
                  }
                : gender === 'female'
                  ? {
                        label: '她',
                        primarySymbol: '官鬼',
                        reason: '問卦者已指定為女性，女問男以官鬼為感情用神；若「她」為第三方女性則須改以妻財或應爻另行取用。',
                        status: 'suggested',
                        candidates: ['官鬼', '妻財', '應爻'],
                    }
                  : {
                        label: '她',
                        primarySymbol: null,
                        reason: '未提供問卦者性別，程式不臆測感情用神，須由解卦者依問題性質與盤面選取。',
                        status: 'requires_judgement',
                        candidates: ['妻財', '官鬼', '應爻'],
                    };

        return {
            querent: {
                label: '我',
                primarySymbol: '世爻',
                reason: '問卦者本人原則上以世爻代表。',
                status: 'suggested',
            },
            target,
            thirdPerson: {
                label: '他',
                primarySymbol: null,
                status: 'requires_judgement',
                candidates: ['應爻', '兄弟爻', '官鬼爻'],
                reason: '第三人不得無條件指定為應爻；須檢查應爻、兄弟爻、官鬼爻與用神之間的生合剋沖後再定位。',
            },
            note: 'roleMapping 只是解讀提示，不是盤面推算結果，不可取代 lines 中的實際資料。',
        };
    }

    /**
     * 建立完整排盤。
     *
     * @param {object}   options
     * @param {number[]} options.yao      六個爻值 6/7/8/9，索引 0 為初爻
     * @param {Date}     options.date     起卦時刻
     * @param {string}   [options.timeZone='Asia/Taipei']
     * @param {string}   [options.question='']
     * @param {string}   [options.gender=''] 'male' | 'female' | ''
     */
    function buildChart(options) {
        const opts = options || {};
        const yao = opts.yao;
        if (!Array.isArray(yao) || yao.length !== 6 || yao.some((v) => [6, 7, 8, 9].indexOf(v) === -1)) {
            throw new Error('yao 必須是六個 6/7/8/9 的數值，索引 0 為初爻');
        }

        const timeZone = opts.timeZone || 'Asia/Taipei';
        const ganzhi = calendar.buildGanzhi(opts.date || new Date(), timeZone);

        const mainBits = yao.map(toBit).join('');
        const changedBits = yao.map(toChangedBit).join('');
        const hasMoving = yao.some((v) => v === 6 || v === 9);

        const mainInfo = hexagramInfo(mainBits);
        const changedInfo = hasMoving ? hexagramInfo(changedBits) : null;

        const mainNajia = najiaOf(mainBits);
        const changedNajia = najiaOf(changedBits);

        const dayStemIndex = calendar.STEMS.indexOf(ganzhi.dayStem);
        const spiritStart = SPIRIT_START_BY_STEM[dayStemIndex];

        const lineRelatives = mainNajia.map((text) => {
            const branchIndex = BRANCHES.indexOf(text[1]);
            return relativeOf(mainInfo.palaceElement, BRANCH_ELEMENTS[branchIndex]);
        });
        const hidden = findHiddenSpirits({ ...mainInfo, palaceBits: PALACE_TABLE[mainBits].palaceBits }, lineRelatives);

        const branchIndexes = mainNajia.map((text) => BRANCHES.indexOf(text[1]));

        const lines = yao.map((value, idx) => {
            const position = idx + 1;
            const moving = value === 6 || value === 9;
            const text = mainNajia[idx];
            const branchIndex = branchIndexes[idx];
            const element = BRANCH_ELEMENTS[branchIndex];

            const shiYing =
                position === mainInfo.shiLine ? '世' : position === mainInfo.yingLine ? '應' : null;

            let changed = null;
            if (moving) {
                const changedText = changedNajia[idx];
                const changedBranchIndex = BRANCHES.indexOf(changedText[1]);
                const changedElement = BRANCH_ELEMENTS[changedBranchIndex];
                changed = {
                    value: value === 9 ? 8 : 7,
                    yinYang: value === 9 ? '陰' : '陽',
                    najiaStem: changedText[0],
                    najiaBranch: changedText[1],
                    element: changedElement,
                    // 變爻六親仍以本卦之宮五行論
                    relative: relativeOf(mainInfo.palaceElement, changedElement),
                    transforms: analyseTransform(branchIndex, changedBranchIndex, ganzhi),
                };
            }

            const hiddenSpirit = hidden[idx]
                ? {
                      najiaStem: hidden[idx].najiaStem,
                      najiaBranch: hidden[idx].najiaBranch,
                      element: hidden[idx].element,
                      relative: hidden[idx].relative,
                      flyingStem: text[0],
                      flyingBranch: text[1],
                      flyingElement: element,
                      flyingRelative: lineRelatives[idx],
                      relation: generates(element, hidden[idx].element)
                          ? '飛來生伏'
                          : overcomes(element, hidden[idx].element)
                            ? '飛來剋伏'
                            : generates(hidden[idx].element, element)
                              ? '伏去生飛'
                              : overcomes(hidden[idx].element, element)
                                ? '伏去剋飛'
                                : '飛伏比和',
                  }
                : null;

            return {
                position,
                value,
                yinYang: value % 2 === 0 ? '陰' : '陽',
                moving,
                movingType: moving ? (value === 9 ? '老陽動' : '老陰動') : null,
                shiYing,
                najiaStem: text[0],
                najiaBranch: text[1],
                element,
                relative: lineRelatives[idx],
                sixSpirit: SIX_SPIRITS[(spiritStart + idx) % 6],
                hiddenSpirit,
                changed,
                relations: analyseRelations(branchIndex, ganzhi, moving),
            };
        });

        const changingLines = lines.filter((l) => l.moving).map((l) => l.position);

        return {
            question: opts.question || '',
            gender: opts.gender || null,
            yao: yao.slice(),
            changingLines,
            mainHexagram: mainInfo,
            changedHexagram: changedInfo,
            time: ganzhi,
            lines,
            hexagramRelations: {
                mainSixClash: mainInfo.sixClash,
                mainSixHarmony: mainInfo.sixHarmony,
                changedSixClash: changedInfo ? changedInfo.sixClash : null,
                changedSixHarmony: changedInfo ? changedInfo.sixHarmony : null,
                triads: detectTriads(branchIndexes),
                missingRelatives: RELATIVES.filter((r) => lineRelatives.indexOf(r) === -1),
            },
            roleMapping: buildRoleMapping(opts.gender || ''),
            conventions: {
                lineOrder: 'lines[0] 為初爻，position 由下而上 1–6',
                changingLines: 'one-based 爻位',
                changedRelativeBasis: '變爻六親以本卦之宮五行論',
                dayBoundary: '日柱以當地 23:00 換日；月柱與年柱依節氣與立春的實際時刻判定',
                solarTermSource: '截斷版 VSOP87D 太陽視黃經求根，適用 1900–2100',
            },
        };
    }

    global.LiuyaoCore = {
        HEXAGRAM_NAMES,
        TRIGRAMS,
        NAJIA,
        BRANCH_ELEMENTS,
        PALACES,
        PALACE_TABLE,
        SIX_SPIRITS,
        TRIADS,
        RELATIVES,
        relativeOf,
        vigorOf,
        progressionOf,
        najiaOf,
        hexagramInfo,
        analyseRelations,
        analyseTransform,
        detectTriads,
        buildRoleMapping,
        buildChart,
    };
})(typeof globalThis !== 'undefined' ? globalThis : this);
