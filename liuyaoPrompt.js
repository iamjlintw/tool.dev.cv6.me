/**
 * liuyaoPrompt.js — 解卦 Prompt 組裝
 *
 * 把納甲六爻的解讀規則與 liuyaoCore.buildChart() 產生的完整盤面串成一段可直接貼給 LLM 的文字。
 * 規則文字與盤面資料分離，日後調整措辭不必動排盤核心。掛在全域 LiuyaoPrompt。
 */
(function (global) {
    'use strict';

    /** 通用解讀規則：禁止模型自行重排盤，並規定判斷順序與必列項目。 */
    const BASE_RULES = [
        '你是一位使用納甲六爻法的解卦者。盤面已由程式完成，禁止自行重新起卦、改卦、重新計算干支、納甲、六親、世應、六神或旬空。',
        '',
        '請先依問題選取用神，再進行判斷。',
        '',
        '解盤前必須依序列出：',
        '1. 世爻代表誰，落在哪一爻，旺衰如何。',
        '2. 應爻代表誰，落在哪一爻，旺衰如何。',
        '3. 本題用神是什麼，為何選它，落在哪一爻。',
        '4. 問題中每一個角色如何定位。',
        '5. 若同一角色可能有兩種取法，必須列出兩種取法的盤面後果，不可默認其中一種。',
        '6. 本次主要使用哪些爻判斷。',
        '',
        '判斷優先順序：',
        '月建與日辰 → 世應 → 用神 → 動爻與變爻 → 生剋沖合 → 空破墓絕 → 伏神飛神 → 卦名及爻辭。',
        '',
        '不得只用卦名、卦辭或爻辭直接回答。',
        '每一項結論必須標示具體盤面依據。',
        '若盤面不足以唯一區分角色，必須明說「角色定位不足」，不可假裝已能確定。',
        '最後必須區分：',
        '- 心中在意或情感傾向',
        '- 現實選擇',
        '- 是否採取行動',
        '這三者不可混為一談。',
    ].join('\n');

    /** 三角關係（我、她、他）的角色定位規則。 */
    const ROLE_RULES = [
        '角色定位規則（問題若涉及第三人，必須逐項處理，不可簡化成「世＝我、應＝她」後忽略第三人）：',
        '',
        '- 「我」：原則上先以世爻代表問卦者。',
        '- 「她」：依問卦者性別與問題性質選取感情用神；男性問女性通常先考慮妻財，但仍須結合盤面說明。',
        '- 「他」：不得無條件直接指定為應爻。應檢查應爻、兄弟爻、官鬼爻，以及各爻與用神之間的生、合、剋、沖關係，再說明哪一個較符合競爭者。',
        '',
        'JSON 中的 roleMapping 只是解讀提示，不是盤面推算結果，不可取代 lines 內的實際資料。',
        'roleMapping 內任何 status 為 requires_judgement 的角色，都表示程式無法唯一確定，必須由你依盤面判斷並說明理由；若盤面仍不足以區分，就明說「角色定位不足」。',
    ].join('\n');

    /** 盤面欄位的閱讀說明，避免模型誤解爻序與六親基準。 */
    const DATA_NOTES = [
        '盤面資料說明：',
        '- lines 由下而上排列，position 1 為初爻、6 為上爻；changingLines 為 one-based 爻位。',
        '- time 內的干支、月建、日辰、旬空皆以 timezone 所示的當地起卦時間計算完畢，請直接採用，不要從 UTC 反推或重算。',
        '- 變爻六親（changed.relative）以本卦之宮五行論。',
        '- hiddenSpirit 為伏神，flyingBranch 為其飛神；null 表示該爻無伏神。',
        '- relations.month / relations.day 為該爻與月建、日辰的關係；void 為旬空，monthBroken 為月破。',
        '- changed.transforms 內的化進神、化退神、回頭生、回頭剋、化空、化破、化墓、化絕皆已由程式判定。',
    ].join('\n');

    /**
     * 組出完整解卦 Prompt。
     *
     * @param {object} chart  liuyaoCore.buildChart() 的結果
     * @returns {string}
     */
    function buildPrompt(chart) {
        const question = chart && chart.question ? chart.question : '（未填）';
        return [
            BASE_RULES,
            '',
            ROLE_RULES,
            '',
            DATA_NOTES,
            '',
            `本次問題：${question}`,
            '',
            '完整盤面 JSON：',
            JSON.stringify(chart, null, 2),
        ].join('\n');
    }

    global.LiuyaoPrompt = { BASE_RULES, ROLE_RULES, DATA_NOTES, buildPrompt };
})(typeof globalThis !== 'undefined' ? globalThis : this);
