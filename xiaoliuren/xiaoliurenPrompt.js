/**
 * 小六壬 AI 解盤 Prompt 產生器
 *
 * 傳統 script，掛在 globalThis.XiaoLiuRenPrompt。純函式，不呼叫任何 AI。
 * v1 唯一 AI 功能就是產生這段文字並由 UI 複製到剪貼簿。
 *
 * AiAdapter 介面（僅保留形狀，本版不實作任何供應商，也不存任何金鑰）：
 *   { name: string, interpret(prompt: string): Promise<string> }
 */
(function (root) {
    'use strict';

    const Core = root.XiaoLiuRenCore;
    const Palaces = root.XiaoLiuRenPalaces;
    if (!Core || !Palaces) {
        throw new Error('XiaoLiuRenPrompt 需要先載入 xiaoliurenPalaces.js 與 xiaoliurenCore.js');
    }

    const TIME_ZONE = 'Asia/Taipei';

    function formatDateTime(iso) {
        if (!iso) return '';
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) return String(iso);
        try {
            // 用 formatToParts 自行組字串，避免各瀏覽器在日期與時間之間插入不同的空白字元
            const dtf = new Intl.DateTimeFormat('en-US', {
                timeZone: TIME_ZONE,
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hourCycle: 'h23',
            });
            const p = {};
            dtf.formatToParts(date).forEach((part) => {
                p[part.type] = part.value;
            });
            return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}（台北時間）`;
        } catch (_err) {
            return date.toISOString();
        }
    }

    function palaceLine(name) {
        const p = Palaces.get(name);
        return p ? `${p.name}（${p.keyword}）` : String(name);
    }

    /**
     * @param {object} reading 歷史紀錄（至少含 question、category、numbers、palaces、datetime）
     * @param {object} [options]
     * @param {object} [options.primary] 若本課為 Repeated Reading，傳入對應的 Primary Reading
     */
    function buildPrompt(reading, options) {
        if (!reading || !Array.isArray(reading.palaces) || reading.palaces.length !== 3) {
            throw new TypeError('buildPrompt 需要含三宮結果的紀錄');
        }
        const opts = options || {};
        const numbers = Array.isArray(reading.numbers) ? reading.numbers.join(', ') : '';
        const palaces = reading.palaces.join(' → ');

        const lines = [
            '問題：',
            String(reading.question || '').trim() || '（未填寫）',
            '',
            '問題分類：',
            Core.categoryLabel(reading.category),
            '',
            '起課方式：',
            Core.METHOD_LABEL,
            '',
            '起課時間：',
            formatDateTime(reading.datetime),
            '',
            '輸入：',
            numbers,
            '',
            '排盤結果：',
            palaces,
            '',
            '三宮對應：',
            `第一宮（背景／前段）：${palaceLine(reading.palaces[0])}`,
            `第二宮（核心／中段）：${palaceLine(reading.palaces[1])}`,
            `第三宮（後續／結果傾向）：${palaceLine(reading.palaces[2])}`,
            '',
            '規則：',
            '六宮順序為大安、留連、速喜、赤口、小吉、空亡。',
            '第一宮為背景，第二宮為核心發展，第三宮為後續趨勢。',
            '請依本盤解讀，不得重新計算起課結果，不得更改宮位，不得為了符合問題預設結論。',
            '若問題涉及多個可能結果，必須承認資訊不足，不得強行指定。',
            '空亡不得一律解成結束，赤口不得一律解成壞事，速喜不代表長期穩定，大安不代表巨大成功。',
        ];

        if (reading.isPrimary === false && opts.primary && Array.isArray(opts.primary.palaces)) {
            lines.push(
                '',
                '注意：本課為同一問題的重複起課（Repeated Reading）。',
                `第一課（Primary Reading）結果：${opts.primary.palaces.join(' → ')}`,
                reading.conflictWithPrimary
                    ? '兩課第三宮相反，結果存在矛盾，可信度下降。請如實指出矛盾，不得把兩個相反結果調和成一致。'
                    : '請分別說明兩課，若有出入請如實指出，不得為了一致而改寫其中一課。',
            );
        }

        return lines.join('\n');
    }

    /** AiAdapter 介面描述；v1 不註冊任何實作。 */
    const AiAdapter = Object.freeze({
        shape: Object.freeze({ name: 'string', interpret: '(prompt: string) => Promise<string>' }),
        adapters: Object.freeze([]),
    });

    root.XiaoLiuRenPrompt = Object.freeze({
        TIME_ZONE,
        buildPrompt,
        formatDateTime,
        AiAdapter,
    });
})(typeof globalThis !== 'undefined' ? globalThis : this);
