/**
 * 測試用載入器：以 vm 在 Node 端執行瀏覽器版的傳統 script，
 * 讓測試與頁面共用同一份程式，不做第二套實作。
 */
import { readFileSync } from 'node:fs';
import { runInThisContext } from 'node:vm';

for (const name of ['ganzhiCalendar.js', 'liuyaoCore.js', 'liuyaoPrompt.js']) {
    const url = new URL(`../${name}`, import.meta.url);
    runInThisContext(readFileSync(url, 'utf8'), { filename: name });
}

export const { GanzhiCalendar, LiuyaoCore, LiuyaoPrompt } = globalThis;

/** 由台北當地時間組出對應的絕對時刻（台灣全年 UTC+8，無日光節約）。 */
export const taipei = (text) => new Date(`${text.replace(' ', 'T')}+08:00`);
