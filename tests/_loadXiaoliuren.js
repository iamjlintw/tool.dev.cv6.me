/**
 * 小六壬測試用載入器：以 vm 在 Node 端執行 xiaoliuren/ 內的瀏覽器版傳統 script，
 * 讓測試與頁面共用同一份程式，不做第二套實作。
 */
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

for (const name of [
    'xiaoliurenPalaces.js',
    'xiaoliurenCore.js',
    'xiaoliurenInterpreter.js',
    'xiaoliurenPrompt.js',
    'xiaoliurenStore.js',
]) {
    const url = new URL(`../xiaoliuren/${name}`, import.meta.url);
    runInThisContext(readFileSync(url, 'utf8'), { filename: name });
}

export const { XiaoLiuRenPalaces, XiaoLiuRenCore, XiaoLiuRenInterpreter, XiaoLiuRenPrompt, XiaoLiuRenStore } =
    globalThis;

/** 以 Map 模擬 localStorage，供 store 測試使用。 */
export function memoryStorage() {
    const map = new Map();
    return {
        getItem: (k) => (map.has(k) ? map.get(k) : null),
        setItem: (k, v) => {
            map.set(k, String(v));
        },
        removeItem: (k) => {
            map.delete(k);
        },
        _map: map,
    };
}

/** 固定時間與遞增 id 的 store，讓測試可預期。 */
export function makeStore(startMs = Date.UTC(2026, 8, 28, 2, 0, 0), idPrefix = 'id') {
    let tick = 0;
    const storage = memoryStorage();
    const store = XiaoLiuRenStore.createStore({
        storage,
        now: () => new Date(startMs + tick++ * 60000),
        uuid: () => `${idPrefix}-${String(tick).padStart(3, '0')}`,
    });
    return { store, storage };
}
