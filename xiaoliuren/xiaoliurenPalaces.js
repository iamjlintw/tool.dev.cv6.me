/**
 * 小六壬六宮基礎資料
 *
 * 傳統 script，掛在 globalThis.XiaoLiuRenPalaces；不讀 DOM、無副作用。
 * 順序固定：大安 → 留連 → 速喜 → 赤口 → 小吉 → 空亡（index 0–5），
 * 這個順序是起課演算法的一部分，不得更動。
 *
 * polarity 只供「機械式初步矛盾偵測」使用（大安／速喜／小吉 +1，留連／赤口 0，空亡 −1），
 * 不代表吉凶二分，UI 不得直接以此顯示吉／凶。
 */
(function (root) {
    'use strict';

    const NAMES = ['大安', '留連', '速喜', '赤口', '小吉', '空亡'];

    const PALACES = [
        {
            index: 0,
            name: '大安',
            tone: 'steady',
            polarity: 1,
            keyword: '穩定、維持、定局',
            speed: '慢而穩',
            stability: '高',
            generalMeaning: '事情處於穩定或逐漸定型的狀態，變動不大，可以維持目前的模式。不是爆發型的好消息，而是「穩下來」。',
            positiveMeaning: '基礎穩固、可以長期經營、不容易出意外。',
            negativeMeaning: '容易停在原地，缺少推力；若期待的是突破，會覺得平淡或停滯。',
            relationshipMeaning: '關係有一定基礎，互動模式固定，不太會有劇烈變化。',
            workMeaning: '基本盤穩，職位或專案維持現狀，短期難有大變動。',
            moneyMeaning: '收支平穩，屬於守成而非進帳暴增。',
            actionMeaning: '適合維持、守成、按既定節奏走，不急著推動大動作。',
        },
        {
            index: 1,
            name: '留連',
            tone: 'delay',
            polarity: 0,
            keyword: '拖延、牽掛、反覆',
            speed: '慢',
            stability: '中',
            generalMeaning: '事情拖著、放不下、反覆處理，一時之間難以斷乾淨。不必直接解成壞事，重點是「還在纏」。',
            positiveMeaning: '事情沒有斷，仍有牽連、仍有機會慢慢處理。',
            negativeMeaning: '延遲、耗時、情緒牽掛，等待期比預期長。',
            relationshipMeaning: '雙方仍有牽掛或糾纏，關係處於拖延、曖昧或反覆的階段。',
            workMeaning: '進度延宕、流程反覆、決策懸而未決。',
            moneyMeaning: '款項延遲、周轉拖延，該進的還沒進。',
            actionMeaning: '需要耐心，適合釐清、跟進、慢慢收線，不適合期待立刻有結果。',
        },
        {
            index: 2,
            name: '速喜',
            tone: 'fast',
            polarity: 1,
            keyword: '快速、消息、升溫',
            speed: '快',
            stability: '低',
            generalMeaning: '事情會快速出現進展或消息，突然轉好、節奏加快。重點是「快」，不代表一定能長期維持。',
            positiveMeaning: '短期有進展、有回音、有轉機。',
            negativeMeaning: '來得快也可能走得快；熱度高但根基未必穩。',
            relationshipMeaning: '互動快速升溫、有回應、有消息，但屬於短期熱度。',
            workMeaning: '事情突然加速、有回覆或轉機，需要跟上節奏。',
            moneyMeaning: '短期有進帳或好消息，屬於快錢而非穩定收入。',
            actionMeaning: '適合把握時機、及時回應，並提早想好熱度過後怎麼接。',
        },
        {
            index: 3,
            name: '赤口',
            tone: 'friction',
            polarity: 0,
            keyword: '爭執、談判、說清楚',
            speed: '中',
            stability: '低',
            generalMeaning: '事情涉及口舌、摩擦、競爭或談判。不一定是壞事，常常代表「需要攤開來說」。',
            positiveMeaning: '把問題說開、談出條件、界線變清楚。',
            negativeMeaning: '爭執、誤會、口角、競爭壓力。',
            relationshipMeaning: '需要溝通、攤牌或界定關係，容易有爭執但也可能因此說清楚。',
            workMeaning: '涉及協調、責任歸屬、談判或競爭，要準備好把話講清楚。',
            moneyMeaning: '金錢上容易有爭議、討價還價或需要談條件。',
            actionMeaning: '適合正面溝通、準備論點與底線，避免情緒化衝撞。',
        },
        {
            index: 4,
            name: '小吉',
            tone: 'gain',
            polarity: 1,
            keyword: '小利、協調、逐步改善',
            speed: '中',
            stability: '中高',
            generalMeaning: '有幫助、有進展、有小成果，人緣與合作順暢。不是暴利或巨大成功，而是逐步改善。',
            positiveMeaning: '有助力、有人幫、局面慢慢往好的方向走。',
            negativeMeaning: '成果有限，若期待太高會覺得不夠。',
            relationshipMeaning: '互動舒服、有人緣、彼此願意配合，關係逐步改善。',
            workMeaning: '合作順利、有人協助，事情有小幅但實質的進展。',
            moneyMeaning: '有小利可得、有進帳但幅度不大。',
            actionMeaning: '適合合作、借力、順勢推進，務實累積。',
        },
        {
            index: 5,
            name: '空亡',
            tone: 'void',
            polarity: -1,
            keyword: '落空、空轉、未落地',
            speed: '不定',
            stability: '低',
            generalMeaning: '事情落空、空轉、疏離，或期待與現實有落差。不一定是結束，也可能代表尚未形成、原本的模式消失、實質內容變弱。',
            positiveMeaning: '舊的模式鬆動，留下重新洗牌的空間。',
            negativeMeaning: '期待落空、使不上力、對方或事情沒有實質回應。',
            relationshipMeaning: '互動變淡、疏離或沒有實質回應，關係處於懸空狀態。',
            workMeaning: '事情空轉、原本的安排消失，實質內容變少。',
            moneyMeaning: '預期的收入沒落地、花費沒有回收。',
            actionMeaning: '不宜硬推，適合觀望、重新盤點，等待事情重新成形。',
        },
    ];

    const byName = {};
    PALACES.forEach((p) => {
        byName[p.name] = p;
    });

    /** 依名稱取宮位資料；找不到回傳 null。 */
    function get(name) {
        return byName[name] || null;
    }

    /** 依 index（0–5）取宮位資料。 */
    function at(index) {
        return PALACES[index] || null;
    }

    /** 名稱是否為合法宮位。 */
    function isPalace(name) {
        return Object.prototype.hasOwnProperty.call(byName, name);
    }

    /** 取宮位 polarity（+1 / 0 / −1）；非法名稱回傳 null。 */
    function polarityOf(name) {
        const p = get(name);
        return p ? p.polarity : null;
    }

    root.XiaoLiuRenPalaces = Object.freeze({
        NAMES: Object.freeze(NAMES.slice()),
        PALACES: Object.freeze(PALACES.map((p) => Object.freeze(Object.assign({}, p)))),
        get,
        at,
        isPalace,
        polarityOf,
    });
})(typeof globalThis !== 'undefined' ? globalThis : this);
