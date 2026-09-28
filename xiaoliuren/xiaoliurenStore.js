/**
 * 小六壬歷史紀錄／驗證／設定儲存層（localStorage）
 *
 * 傳統 script，掛在 globalThis.XiaoLiuRenStore。
 * createStore() 接受任何具 getItem / setItem / removeItem 的 storage，方便測試以 Map 代替。
 *
 * Key：
 *   xiaoliuren.readings.v1  紀錄陣列
 *   xiaoliuren.settings.v1  設定（theme: system | light | dark）
 *
 * 關係規則（設計文件第 7、15 節）：
 *   - 同 questionKey 只有一筆 isPrimary = true；其餘為 Repeated，parentReadingId 指向 Primary。
 *   - 追問是不同 questionKey，isPrimary = true，parentReadingId 指向來源課。
 *   - 刪除 Primary 時最早的 Repeated 升為 Primary，其餘與追問改指向它；不留 orphan。
 */
(function (root) {
    'use strict';

    const Core = root.XiaoLiuRenCore;
    const Palaces = root.XiaoLiuRenPalaces;
    if (!Core || !Palaces) {
        throw new Error('XiaoLiuRenStore 需要先載入 xiaoliurenPalaces.js 與 xiaoliurenCore.js');
    }

    const READINGS_KEY = 'xiaoliuren.readings.v1';
    const SETTINGS_KEY = 'xiaoliuren.settings.v1';
    const EXPORT_SCHEMA = 'xiaoliuren.readings';
    const EXPORT_VERSION = 1;

    const VERIFICATIONS = Object.freeze(['pending', 'hit', 'partial', 'miss', 'contradiction']);
    const VERIFICATION_LABELS = Object.freeze({
        pending: '待驗證',
        hit: '命中',
        partial: '部分命中',
        miss: '錯誤',
        contradiction: '矛盾',
    });
    const SCORES = Object.freeze({ hit: 1, partial: 0.5, miss: 0, contradiction: 0 });
    const THEMES = Object.freeze(['system', 'light', 'dark']);
    const DEFAULT_SETTINGS = Object.freeze({ theme: 'system' });

    function defaultUuid() {
        const c = root.crypto;
        if (c && typeof c.randomUUID === 'function') return c.randomUUID();
        const bytes = new Array(16);
        if (c && typeof c.getRandomValues === 'function') {
            const arr = new Uint8Array(16);
            c.getRandomValues(arr);
            for (let i = 0; i < 16; i++) bytes[i] = arr[i];
        } else {
            for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
        }
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }

    function isIsoDate(value) {
        return typeof value === 'string' && value.length > 0 && !Number.isNaN(new Date(value).getTime());
    }

    function isPositiveSafeInt(n) {
        return typeof n === 'number' && Number.isSafeInteger(n) && n >= 1;
    }

    /**
     * 逐欄驗證單筆紀錄。回傳 { ok, errors, record }；record 為只含已知欄位的乾淨複本，不做任何修正。
     */
    function validateRecord(raw) {
        const errors = [];
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
            return { ok: false, errors: ['record 必須是物件'], record: null };
        }
        if (typeof raw.id !== 'string' || !raw.id.trim()) errors.push('id 必須是非空字串');
        if (!isIsoDate(raw.datetime)) errors.push('datetime 必須是可解析的日期字串');
        if (typeof raw.question !== 'string') errors.push('question 必須是字串');
        if (typeof raw.questionKey !== 'string') errors.push('questionKey 必須是字串');
        if (!Core.isCategory(raw.category)) errors.push('category 不在允許清單');
        if (typeof raw.rawInput !== 'string') errors.push('rawInput 必須是字串');
        if (raw.method !== Core.METHOD) errors.push(`method 必須是 ${Core.METHOD}`);
        if (!Array.isArray(raw.numbers) || raw.numbers.length !== 3 || !raw.numbers.every(isPositiveSafeInt)) {
            errors.push('numbers 必須是三個 >= 1 的整數');
        }
        if (!Array.isArray(raw.palaces) || raw.palaces.length !== 3 || !raw.palaces.every(Palaces.isPalace)) {
            errors.push('palaces 必須是三個合法宮位');
        }
        if (
            !Array.isArray(raw.steps) ||
            raw.steps.length !== 3 ||
            !raw.steps.every(
                (s) =>
                    s &&
                    typeof s === 'object' &&
                    isPositiveSafeInt(s.number) &&
                    Palaces.isPalace(s.start) &&
                    Palaces.isPalace(s.result),
            )
        ) {
            errors.push('steps 必須是三步 { number, start, result }');
        }
        if (typeof raw.interpretation !== 'string') errors.push('interpretation 必須是字串');
        if (typeof raw.isPrimary !== 'boolean') errors.push('isPrimary 必須是布林值');
        if (!(raw.parentReadingId === null || typeof raw.parentReadingId === 'string')) {
            errors.push('parentReadingId 必須是字串或 null');
        }
        if (typeof raw.conflictWithPrimary !== 'boolean') errors.push('conflictWithPrimary 必須是布林值');
        if (VERIFICATIONS.indexOf(raw.verification) === -1) errors.push('verification 不在允許清單');
        if (typeof raw.notes !== 'string') errors.push('notes 必須是字串');

        // 數字與宮位必須一致：排盤結果由程式決定，不接受被改過的資料
        if (errors.length === 0) {
            const recalculated = Core.calculateXiaoLiuRen(raw.numbers).palaces;
            if (recalculated.join('|') !== raw.palaces.join('|')) {
                errors.push('palaces 與 numbers 不一致，排盤結果不可被修改');
            }
        }

        if (errors.length) return { ok: false, errors, record: null };
        return {
            ok: true,
            errors: [],
            record: {
                id: raw.id,
                datetime: raw.datetime,
                question: raw.question,
                questionKey: raw.questionKey,
                category: raw.category,
                rawInput: raw.rawInput,
                method: raw.method,
                numbers: raw.numbers.slice(),
                steps: raw.steps.map((s) => ({ number: s.number, start: s.start, result: s.result })),
                palaces: raw.palaces.slice(),
                interpretation: raw.interpretation,
                isPrimary: raw.isPrimary,
                parentReadingId: raw.parentReadingId,
                conflictWithPrimary: raw.conflictWithPrimary,
                verification: raw.verification,
                notes: raw.notes,
            },
        };
    }

    function byDatetimeAsc(a, b) {
        return new Date(a.datetime) - new Date(b.datetime) || a.id.localeCompare(b.id);
    }

    /**
     * @param {object} [options]
     * @param {Storage} [options.storage] 預設 globalThis.localStorage
     * @param {() => Date} [options.now]
     * @param {() => string} [options.uuid]
     */
    function createStore(options) {
        const opts = options || {};
        const storage = opts.storage || root.localStorage;
        const now = opts.now || (() => new Date());
        const uuid = opts.uuid || defaultUuid;
        if (!storage) throw new Error('createStore 需要 storage');

        /* ---------------- 讀寫 ---------------- */

        function load() {
            let text = null;
            try {
                text = storage.getItem(READINGS_KEY);
            } catch (_err) {
                return [];
            }
            if (!text) return [];
            try {
                const parsed = JSON.parse(text);
                return Array.isArray(parsed) ? parsed : [];
            } catch (_err) {
                return [];
            }
        }

        function save(list) {
            storage.setItem(READINGS_KEY, JSON.stringify(list));
        }

        /* ---------------- 關係整理 ---------------- */

        /**
         * 確保每個 questionKey 只有一筆 Primary（最早者），其餘為 Repeated 並指向它；
         * 指向不存在紀錄的 parentReadingId 設為 null。回傳被調整的筆數。
         */
        function normalizeRelations(list) {
            let adjusted = 0;
            const ids = new Set(list.map((r) => r.id));
            const groups = new Map();
            list.forEach((r) => {
                if (!groups.has(r.questionKey)) groups.set(r.questionKey, []);
                groups.get(r.questionKey).push(r);
            });
            groups.forEach((group) => {
                group.sort(byDatetimeAsc);
                const primary = group[0];
                if (!primary.isPrimary) {
                    primary.isPrimary = true;
                    primary.conflictWithPrimary = false;
                    adjusted++;
                }
                // Primary 的 parentReadingId 只可能是「追問來源」，保留（若還存在）
                if (primary.parentReadingId && !ids.has(primary.parentReadingId)) {
                    primary.parentReadingId = null;
                    adjusted++;
                }
                group.slice(1).forEach((r) => {
                    const conflict = Core.isConflicting(primary.palaces, r.palaces);
                    if (r.isPrimary || r.parentReadingId !== primary.id || r.conflictWithPrimary !== conflict) {
                        r.isPrimary = false;
                        r.parentReadingId = primary.id;
                        r.conflictWithPrimary = conflict;
                        adjusted++;
                    }
                });
            });
            return adjusted;
        }

        /* ---------------- 查詢 ---------------- */

        function list() {
            return load().sort((a, b) => byDatetimeAsc(b, a));
        }

        function get(id) {
            return load().find((r) => r.id === id) || null;
        }

        function findPrimary(questionKey) {
            return load().find((r) => r.questionKey === questionKey && r.isPrimary) || null;
        }

        function findPrimaryForQuestion(question) {
            return findPrimary(Core.normalizeQuestionKey(question));
        }

        function repeatedOf(primaryId) {
            return load()
                .filter((r) => !r.isPrimary && r.parentReadingId === primaryId)
                .sort(byDatetimeAsc);
        }

        function search(text) {
            const q = String(text || '').trim().toLowerCase();
            const all = list();
            if (!q) return all;
            return all.filter(
                (r) =>
                    String(r.question).toLowerCase().indexOf(q) !== -1 ||
                    String(r.notes).toLowerCase().indexOf(q) !== -1 ||
                    r.palaces.join('').indexOf(q) !== -1,
            );
        }

        /* ---------------- 新增 ---------------- */

        /**
         * @param {object} input { question, category, rawInput, numbers, palaces, steps, interpretation, parentReadingId? }
         * @param {object} [flags] { force: boolean } 已有 Primary 時是否仍要起課（標記為 Repeated）
         * @returns {{ ok: true, record: object } | { ok: false, reason: 'HAS_PRIMARY', primary: object }}
         */
        function addReading(input, flags) {
            const force = !!(flags && flags.force);
            const question = String(input.question || '').trim();
            const questionKey = Core.normalizeQuestionKey(question);
            const calc = Core.calculateXiaoLiuRen(input.numbers);
            if (Array.isArray(input.palaces) && input.palaces.join('|') !== calc.palaces.join('|')) {
                throw new Error('傳入的 palaces 與 numbers 不一致');
            }
            const all = load();
            const primary = all.find((r) => r.questionKey === questionKey && r.isPrimary) || null;
            if (primary && !force) {
                return { ok: false, reason: 'HAS_PRIMARY', primary };
            }
            const record = {
                id: uuid(),
                datetime: now().toISOString(),
                question,
                questionKey,
                category: Core.isCategory(input.category) ? input.category : 'general',
                rawInput: String(input.rawInput == null ? '' : input.rawInput),
                method: Core.METHOD,
                numbers: calc.numbers,
                steps: calc.steps,
                palaces: calc.palaces,
                interpretation: String(input.interpretation || ''),
                isPrimary: !primary,
                parentReadingId: primary ? primary.id : input.parentReadingId || null,
                conflictWithPrimary: primary ? Core.isConflicting(primary.palaces, calc.palaces) : false,
                verification: 'pending',
                notes: '',
            };
            all.push(record);
            save(all);
            return { ok: true, record };
        }

        /* ---------------- 更新 ---------------- */

        function update(id, patch) {
            const all = load();
            const target = all.find((r) => r.id === id);
            if (!target) return null;
            Object.assign(target, patch);
            save(all);
            return target;
        }

        function setVerification(id, status) {
            if (VERIFICATIONS.indexOf(status) === -1) throw new RangeError('未知的驗證狀態');
            return update(id, { verification: status });
        }

        function setNotes(id, notes) {
            return update(id, { notes: String(notes == null ? '' : notes) });
        }

        /* ---------------- 刪除 ---------------- */

        /**
         * 刪除一筆並修復關係：
         *   - 刪 Primary：最早的 Repeated 升為 Primary，其餘與追問改指向它。
         *   - 刪 Repeated：指向它的追問改指向其 Primary。
         *   - 無可承接者時 parentReadingId 設為 null。
         */
        function deleteReading(id) {
            const all = load();
            const target = all.find((r) => r.id === id);
            if (!target) return { ok: false, promoted: null };
            const rest = all.filter((r) => r.id !== id);
            let replacementId = null;
            let promoted = null;

            if (target.isPrimary) {
                const siblings = rest
                    .filter((r) => r.questionKey === target.questionKey && !r.isPrimary)
                    .sort(byDatetimeAsc);
                if (siblings.length) {
                    promoted = siblings[0];
                    promoted.isPrimary = true;
                    promoted.parentReadingId = null;
                    promoted.conflictWithPrimary = false;
                    siblings.slice(1).forEach((r) => {
                        r.parentReadingId = promoted.id;
                        r.conflictWithPrimary = Core.isConflicting(promoted.palaces, r.palaces);
                    });
                    replacementId = promoted.id;
                }
            } else {
                replacementId = rest.some((r) => r.id === target.parentReadingId) ? target.parentReadingId : null;
            }

            rest.forEach((r) => {
                if (r.parentReadingId === id) r.parentReadingId = replacementId;
            });
            save(rest);
            return { ok: true, promoted };
        }

        function clearAll() {
            storage.removeItem(READINGS_KEY);
        }

        /* ---------------- 統計 ---------------- */

        function stats() {
            const all = load();
            const counts = { pending: 0, hit: 0, partial: 0, miss: 0, contradiction: 0 };
            all.forEach((r) => {
                if (Object.prototype.hasOwnProperty.call(counts, r.verification)) counts[r.verification]++;
            });
            const verified = counts.hit + counts.partial + counts.miss + counts.contradiction;
            const rate = (n) => (verified ? n / verified : null);
            return {
                total: all.length,
                pending: counts.pending,
                verified,
                hit: counts.hit,
                partial: counts.partial,
                miss: counts.miss,
                contradiction: counts.contradiction,
                weightedHitRate: rate(counts.hit * SCORES.hit + counts.partial * SCORES.partial),
                hitRate: rate(counts.hit),
                contradictionRate: rate(counts.contradiction),
            };
        }

        /* ---------------- 匯出／匯入 ---------------- */

        function exportJson() {
            return JSON.stringify(
                {
                    schema: EXPORT_SCHEMA,
                    version: EXPORT_VERSION,
                    exportedAt: now().toISOString(),
                    readings: list(),
                },
                null,
                2,
            );
        }

        /**
         * 解析並驗證匯入內容，不寫入。
         * 回傳 { ok:false, error } 或
         *      { ok:true, total, importable, duplicates, invalid:[{index, id, errors}], records }
         */
        function previewImport(text) {
            let parsed;
            try {
                parsed = JSON.parse(String(text));
            } catch (_err) {
                return { ok: false, error: '無法解析 JSON，整份拒絕匯入。' };
            }
            let rows;
            if (Array.isArray(parsed)) {
                rows = parsed;
            } else if (parsed && typeof parsed === 'object' && Array.isArray(parsed.readings)) {
                if (parsed.schema !== undefined && parsed.schema !== EXPORT_SCHEMA) {
                    return { ok: false, error: '不是小六壬的匯出檔（schema 不符），整份拒絕匯入。' };
                }
                rows = parsed.readings;
            } else {
                return { ok: false, error: 'JSON 結構不正確：需要紀錄陣列或匯出檔格式，整份拒絕匯入。' };
            }

            const existingIds = new Set(load().map((r) => r.id));
            const seen = new Set();
            const records = [];
            const invalid = [];
            let duplicates = 0;

            rows.forEach((raw, index) => {
                const result = validateRecord(raw);
                if (!result.ok) {
                    invalid.push({ index, id: raw && typeof raw.id === 'string' ? raw.id : null, errors: result.errors });
                    return;
                }
                if (existingIds.has(result.record.id) || seen.has(result.record.id)) {
                    duplicates++;
                    return;
                }
                seen.add(result.record.id);
                records.push(result.record);
            });

            return {
                ok: true,
                total: rows.length,
                importable: records.length,
                duplicates,
                invalid,
                records,
            };
        }

        /**
         * 寫入 previewImport 的合法新紀錄（相同 id 再次檢查、跳過），並整理關係。
         * 回傳 { added, relationsAdjusted }
         */
        function commitImport(preview) {
            if (!preview || !preview.ok || !Array.isArray(preview.records)) {
                throw new TypeError('commitImport 需要 previewImport 的成功結果');
            }
            const all = load();
            const ids = new Set(all.map((r) => r.id));
            let added = 0;
            preview.records.forEach((r) => {
                if (ids.has(r.id)) return;
                ids.add(r.id);
                all.push(r);
                added++;
            });
            const relationsAdjusted = normalizeRelations(all);
            save(all);
            return { added, relationsAdjusted };
        }

        /* ---------------- 設定 ---------------- */

        function getSettings() {
            let text = null;
            try {
                text = storage.getItem(SETTINGS_KEY);
            } catch (_err) {
                return Object.assign({}, DEFAULT_SETTINGS);
            }
            if (!text) return Object.assign({}, DEFAULT_SETTINGS);
            try {
                const parsed = JSON.parse(text);
                const settings = Object.assign({}, DEFAULT_SETTINGS, parsed && typeof parsed === 'object' ? parsed : {});
                if (THEMES.indexOf(settings.theme) === -1) settings.theme = DEFAULT_SETTINGS.theme;
                return settings;
            } catch (_err) {
                return Object.assign({}, DEFAULT_SETTINGS);
            }
        }

        function setSettings(patch) {
            const next = Object.assign(getSettings(), patch || {});
            if (THEMES.indexOf(next.theme) === -1) throw new RangeError('未知的主題');
            storage.setItem(SETTINGS_KEY, JSON.stringify(next));
            return next;
        }

        return Object.freeze({
            list,
            get,
            findPrimary,
            findPrimaryForQuestion,
            repeatedOf,
            search,
            addReading,
            setVerification,
            setNotes,
            deleteReading,
            clearAll,
            stats,
            exportJson,
            previewImport,
            commitImport,
            getSettings,
            setSettings,
        });
    }

    root.XiaoLiuRenStore = Object.freeze({
        READINGS_KEY,
        SETTINGS_KEY,
        EXPORT_SCHEMA,
        EXPORT_VERSION,
        VERIFICATIONS,
        VERIFICATION_LABELS,
        SCORES,
        THEMES,
        DEFAULT_SETTINGS,
        validateRecord,
        createStore,
    });
})(typeof globalThis !== 'undefined' ? globalThis : this);
