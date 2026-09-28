/**
 * 小六壬核心：數字解析（parser）＋三數連續起課（calculator）＋問題正規化
 *
 * 傳統 script，掛在 globalThis.XiaoLiuRenCore。
 * 全部為純函式：不讀 DOM、不呼叫 AI、deterministic。
 *
 * 唯一排盤演算法（不得修改，其他流派須以新的 method 加入）：
 *   PALACES = ['大安','留連','速喜','赤口','小吉','空亡']
 *   nextIndex = (currentIndex + number - 1) % 6
 *   第一數自大安（index 0）起，第二、三數自前一宮起。
 */
(function (root) {
    'use strict';

    const Palaces = root.XiaoLiuRenPalaces;
    if (!Palaces) {
        throw new Error('XiaoLiuRenCore 需要先載入 xiaoliurenPalaces.js');
    }

    const METHOD = 'three-number-sequential';
    const METHOD_LABEL = '三數連續起課法';
    const PALACES = Palaces.NAMES;

    /** 問題分類（順序即 UI 顯示順序）；分類只影響解讀，不進入起課。 */
    const CATEGORIES = Object.freeze([
        { id: 'work', label: '工作' },
        { id: 'relationship', label: '感情' },
        { id: 'money', label: '財運' },
        { id: 'sideproject', label: '副業' },
        { id: 'social', label: '人際' },
        { id: 'study', label: '學習' },
        { id: 'competition', label: '比賽' },
        { id: 'general', label: '一般事件' },
    ]);

    const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

    function isCategory(id) {
        return CATEGORY_IDS.indexOf(id) !== -1;
    }

    function categoryLabel(id) {
        const found = CATEGORIES.find((c) => c.id === id);
        return found ? found.label : '一般事件';
    }

    /* ------------------------------------------------------------------ */
    /* 解析                                                                */
    /* ------------------------------------------------------------------ */

    const ERRORS = Object.freeze({
        EMPTY: 'EMPTY',
        NOT_NUMERIC: 'NOT_NUMERIC',
        COUNT: 'COUNT',
        NOT_POSITIVE: 'NOT_POSITIVE',
        TOO_LARGE: 'TOO_LARGE',
    });

    const ERROR_MESSAGES = Object.freeze({
        EMPTY: '請輸入三個數字，或剛好六位數字。',
        NOT_NUMERIC: '只能輸入數字與分隔符號（空白、逗號、斜線）。',
        COUNT: '請輸入三個數字，或剛好六位數字。',
        NOT_POSITIVE: '每個數字都必須大於等於 1，不可為 0 或負數。',
        TOO_LARGE: '數字太大，超出可計算範圍。',
    });

    /** 全形數字、分隔符正規化為半形。 */
    function toHalfWidth(text) {
        return String(text)
            .replace(/[\uFF10-\uFF19]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xff10 + 0x30))
            .replace(/[\u3000]/g, ' ')
            .replace(/[\uFF0C\u3001]/g, ',')
            .replace(/[\uFF0F]/g, '/')
            .replace(/[\uFF0D\u2014\u2013]/g, '-')
            .replace(/[\uFF1B]/g, ';');
    }

    function fail(code) {
        return { ok: false, numbers: null, format: null, error: code, message: ERROR_MESSAGES[code] };
    }

    /**
     * 將字串解析為三個正整數。
     * 格式 A：三個以空白、逗號、頓號、斜線、連字號、分號分隔的數字。
     * 格式 B：無分隔符、剛好六位數字，每兩位切一段。
     * 回傳 { ok, numbers, format: 'triple' | 'six-digit', error, message }，不丟例外。
     */
    function parseInput(raw) {
        const text = toHalfWidth(raw == null ? '' : raw).trim();
        if (!text) return fail(ERRORS.EMPTY);

        if (/[^0-9\s,\/;-]/.test(text)) return fail(ERRORS.NOT_NUMERIC);

        const hasSeparator = /[\s,\/;-]/.test(text);
        let tokens;
        let format;

        if (!hasSeparator) {
            if (text.length !== 6) return fail(ERRORS.COUNT);
            tokens = [text.slice(0, 2), text.slice(2, 4), text.slice(4, 6)];
            format = 'six-digit';
        } else {
            tokens = text.split(/[\s,\/;-]+/).filter((t) => t.length > 0);
            if (tokens.length !== 3) return fail(ERRORS.COUNT);
            format = 'triple';
        }

        const numbers = [];
        for (const token of tokens) {
            if (!/^\d+$/.test(token)) return fail(ERRORS.NOT_NUMERIC);
            // 去掉前導零再檢查長度，避免 "00000000000000000009" 之類誤判為過大
            const trimmed = token.replace(/^0+(?=\d)/, '');
            if (trimmed.length > 16) return fail(ERRORS.TOO_LARGE);
            const value = Number(trimmed);
            if (!Number.isSafeInteger(value)) return fail(ERRORS.TOO_LARGE);
            if (value < 1) return fail(ERRORS.NOT_POSITIVE);
            numbers.push(value);
        }

        return { ok: true, numbers, format, error: null, message: null };
    }

    /* ------------------------------------------------------------------ */
    /* 起課                                                                */
    /* ------------------------------------------------------------------ */

    function assertNumbers(numbers) {
        if (!Array.isArray(numbers) || numbers.length !== 3) {
            throw new TypeError('calculateXiaoLiuRen 需要恰好三個數字');
        }
        numbers.forEach((n) => {
            if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1) {
                throw new RangeError('每個數字都必須是 >= 1 的安全整數');
            }
        });
    }

    /**
     * 三數連續起課。
     * @param {number[]} numbers 三個 >= 1 的整數
     * @returns {{ method: string, numbers: number[], steps: Array<{number:number,start:string,result:string}>, palaces: string[] }}
     */
    function calculateXiaoLiuRen(numbers) {
        assertNumbers(numbers);
        const steps = [];
        let currentIndex = 0;
        for (const number of numbers) {
            const start = PALACES[currentIndex];
            currentIndex = (currentIndex + number - 1) % 6;
            steps.push({ number, start, result: PALACES[currentIndex] });
        }
        return {
            method: METHOD,
            numbers: numbers.slice(),
            steps,
            palaces: steps.map((s) => s.result),
        };
    }

    /* ------------------------------------------------------------------ */
    /* 問題正規化                                                          */
    /* ------------------------------------------------------------------ */

    const TRAILING_PUNCT = /[\s\.\u3002!\uFF01?\uFF1F,\uFF0C\u3001;\uFF1B:\uFF1A~\uFF5E\u2026\u2014\-]+$/u;

    /**
     * 產生 questionKey：trim → NFKC 正規化 → 移除所有空白 → 移除句尾標點 → 英文轉小寫。
     * 分類不參與；不做任何語意比對。
     */
    function normalizeQuestionKey(question) {
        let text = String(question == null ? '' : question);
        if (typeof text.normalize === 'function') text = text.normalize('NFKC');
        text = text.trim().replace(/\s+/gu, '');
        text = text.replace(TRAILING_PUNCT, '');
        return text.toLowerCase();
    }

    /**
     * 兩課第三宮 polarity 是否為 +1 vs −1（機械式初步矛盾偵測）。
     * 留連、赤口 polarity 為 0，不與任何宮構成矛盾。
     */
    function isConflicting(palacesA, palacesB) {
        if (!Array.isArray(palacesA) || !Array.isArray(palacesB)) return false;
        const a = Palaces.polarityOf(palacesA[2]);
        const b = Palaces.polarityOf(palacesB[2]);
        if (a === null || b === null) return false;
        return a * b === -1;
    }

    root.XiaoLiuRenCore = Object.freeze({
        METHOD,
        METHOD_LABEL,
        PALACES,
        CATEGORIES,
        ERRORS,
        ERROR_MESSAGES,
        isCategory,
        categoryLabel,
        parseInput,
        calculateXiaoLiuRen,
        normalizeQuestionKey,
        isConflicting,
    });
})(typeof globalThis !== 'undefined' ? globalThis : this);
