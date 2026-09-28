/**
 * 靜態站台的 FTP 雙向同步工具。
 *
 *   node scripts/ftp-sync.mjs        互動選單，問要 push 還是 pull
 *   node scripts/ftp-sync.mjs push   本機 → 遠端（部署）
 *   node scripts/ftp-sync.mjs pull   遠端 → 本機（把主機上的手改抓回來）
 *
 * 兩個方向都以「檔案內容」判定差異：大小不同就是差異，大小相同時再把遠端檔
 * 抓下來逐位元組比對，避免 FTP 的 mtime 時區／精度問題造成誤判或漏同步。
 * 站台總量只有數百 kB，這樣比對的成本可以忽略。
 *
 * 參數全部放 .env，不寫進程式碼、不進版控（見 .env.example）。
 *
 * 安全性：
 *   - 帳號密碼只從 .env 讀，任何輸出（含選單、錯誤訊息）都只顯示站台位置
 *   - .env 已列入 .gitignore
 *   - 預設走 FTPS（FTP_SECURE=true）
 *   - 預設不刪任何東西；要刪要自己加 --delete
 *   - pull 會覆寫本機檔案，動手前一定先列清單並要求確認（--yes 可跳過）
 */
import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'basic-ftp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = resolve(root, '.env');

// ---------------------------------------------------------------- 同步範圍

/** 只同步站台實際會用到的靜態資源，其餘一律不碰。 */
const INCLUDE_EXT = new Set([
    '.html', '.htm', '.js', '.mjs', '.css', '.json', '.txt', '.xml',
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp', '.ico',
    '.woff', '.woff2', '.ttf', '.eot', '.pdf',
]);

/** 開發用的目錄與檔案，兩個方向都不進同步清單。 */
const EXCLUDE_DIRS = new Set(['.git', '.idea', '.vscode', 'node_modules', 'scripts', 'tests', '.claude']);
const EXCLUDE_FILES = new Set([
    '.DS_Store', '.env', '.env.local', '.env.example', '.gitignore',
    'package.json', 'package-lock.json', 'ftp-sync.sh',
]);

const isSyncable = (relPath) => {
    const parts = relPath.split('/');
    if (parts.some((p) => EXCLUDE_DIRS.has(p))) return false;
    if (EXCLUDE_FILES.has(parts[parts.length - 1])) return false;
    if (relPath.toLowerCase().endsWith('.md')) return false; // AGENTS.md / CLAUDE.md 等文件不上站
    const dot = relPath.lastIndexOf('.');
    return dot > 0 && INCLUDE_EXT.has(relPath.slice(dot).toLowerCase());
};

// ---------------------------------------------------------------- 參數

const KNOWN_FLAGS = ['--dry-run', '--delete', '--yes', '-y'];
const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('-')));
const positional = args.filter((a) => !a.startsWith('-'));

const dryRun = flags.has('--dry-run');
const doDelete = flags.has('--delete');
const assumeYes = flags.has('--yes') || flags.has('-y');

function printUsage(stream = console.log) {
    stream('用法：node scripts/ftp-sync.mjs [push|pull] [--dry-run] [--delete] [--yes]');
    stream('  （不給方向就跳出選單，互動詢問要 push 還是 pull）');
    stream('  push        本機 → 遠端');
    stream('  pull        遠端 → 本機（會覆寫本機檔案）');
    stream('  --dry-run   只比對並列出差異，不寫任何檔');
    stream('  --delete    連同「目標端多出來的檔案」一起刪掉（預設不刪）');
    stream('  --yes       不互動確認，直接執行');
}

if (flags.has('-h') || flags.has('--help')) {
    printUsage();
    process.exit(0);
}

const unknown = [
    ...[...flags].filter((f) => !KNOWN_FLAGS.includes(f)),
    ...positional.filter((p) => p !== 'push' && p !== 'pull'),
];
if (unknown.length || positional.length > 1) {
    console.error(`不認得的參數：${(unknown.length ? unknown : positional).join(', ')}\n`);
    printUsage(console.error);
    process.exit(1);
}

// 沒指定方向時留空，稍後用互動選單問（見 askMode）
let mode = positional[0] ?? null;

if (!existsSync(envPath)) {
    console.error('找不到 .env。請複製 .env.example 成 .env 並填入 FTP 資訊：');
    console.error('  cp .env.example .env');
    process.exit(1);
}
process.loadEnvFile(envPath);

const {
    FTP_HOST, FTP_USER, FTP_PASSWORD,
    FTP_PORT = '21',
    FTP_SECURE = 'true',
    FTP_REMOTE_DIR = '/',
} = process.env;

const missing = Object.entries({ FTP_HOST, FTP_USER, FTP_PASSWORD })
    .filter(([, v]) => !v)
    .map(([k]) => k);
if (missing.length) {
    console.error(`.env 缺少必填項目：${missing.join(', ')}`);
    process.exit(1);
}

const secure = FTP_SECURE.toLowerCase() !== 'false';

// ---------------------------------------------------------------- 選同步方向

/** 顯示用的站台位置；刻意不含帳號密碼。 */
const siteLabel = `${FTP_HOST}:${FTP_PORT}${FTP_REMOTE_DIR}`;
let siteShown = false;

/** 印出這次要連的站台（只印站台與加密方式，帳密一律不顯示）。 */
function printSite() {
    console.log(`站台      ${siteLabel}`);
    console.log(`加密      ${secure ? 'FTPS（explicit TLS）' : '關閉——密碼會以明文傳輸'}`);
    siteShown = true;
}

/** 沒在參數指定方向時，用互動選單問要推上去還是拉回來。 */
async function askMode() {
    if (!process.stdin.isTTY) {
        console.error('非互動環境無法選單，請直接指定方向：node scripts/ftp-sync.mjs <push|pull>');
        process.exit(1);
    }
    printSite();
    console.log('');
    console.log('要同步哪個方向？');
    console.log('  1) push   本機 → 遠端（把本機改好的檔案推上去）');
    console.log('  2) pull   遠端 → 本機（把主機上的手改拉回來，會覆寫本機檔案）');
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    // 輸入被關掉（Ctrl+D 等）一律當成取消
    const answer = (await rl.question('請選 1 或 2（直接 Enter 取消）：').catch(() => '')).trim().toLowerCase();
    rl.close();
    console.log('');
    if (['1', 'push'].includes(answer)) return 'push';
    if (['2', 'pull'].includes(answer)) return 'pull';
    console.log('已取消，沒有動任何檔案。');
    process.exit(0);
}

if (!mode) mode = await askMode();

// ---------------------------------------------------------------- 掃描兩端

/** 遞迴列出本機要同步的檔案：relPath → { size } */
async function collectLocal(dir = root, prefix = '') {
    const out = new Map();
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
            if (EXCLUDE_DIRS.has(entry.name)) continue;
            for (const [k, v] of await collectLocal(join(dir, entry.name), relPath)) out.set(k, v);
        } else if (entry.isFile() && isSyncable(relPath)) {
            out.set(relPath, { size: statSync(join(dir, entry.name)).size });
        }
    }
    return out;
}

/** 遞迴列出遠端要同步的檔案：relPath → { size } */
async function collectRemote(client, dir, prefix = '') {
    const out = new Map();
    for (const item of await client.list(dir)) {
        const relPath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.isDirectory) {
            if (EXCLUDE_DIRS.has(item.name)) continue;
            for (const [k, v] of await collectRemote(client, posix.join(dir, item.name), relPath)) out.set(k, v);
        } else if (item.isFile && isSyncable(relPath)) {
            out.set(relPath, { size: item.size });
        }
    }
    return out;
}

/** 把遠端檔案讀進記憶體（站台檔案都很小，不落地暫存檔）。 */
async function readRemote(client, relPath) {
    const chunks = [];
    const sink = new Writable({
        write(chunk, _enc, cb) {
            chunks.push(chunk);
            cb();
        },
    });
    await client.downloadTo(sink, posix.join(FTP_REMOTE_DIR, relPath));
    return Buffer.concat(chunks);
}

const fmtSize = (bytes) => (bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} kB`);

// ---------------------------------------------------------------- 主流程

const client = new Client(30_000);
client.ftp.verbose = false;

try {
    console.log(`模式      ${mode === 'push' ? 'push（本機 → 遠端）' : 'pull（遠端 → 本機）'}`);
    if (!siteShown) printSite();
    if (dryRun) console.log('           dry-run：只比對，不寫檔');
    if (doDelete) console.log('           --delete：目標端多出來的檔案會被刪除');
    console.log('');

    await client.access({
        host: FTP_HOST,
        port: Number(FTP_PORT),
        user: FTP_USER,
        password: FTP_PASSWORD,
        secure,
        // 主機用自簽憑證時 TLS 驗證會失敗；只在明確要求時才放寬
        secureOptions: process.env.FTP_REJECT_UNAUTHORIZED === 'false'
            ? { rejectUnauthorized: false }
            : undefined,
    });

    await client.ensureDir(FTP_REMOTE_DIR);
    console.log(`遠端目錄  ${await client.pwd()}`);

    const local = await collectLocal();
    const remote = await collectRemote(client, FTP_REMOTE_DIR);
    console.log(`本機 ${local.size} 個檔案、遠端 ${remote.size} 個檔案，開始比對……\n`);

    const source = mode === 'push' ? local : remote;
    const target = mode === 'push' ? remote : local;

    const toWrite = [];   // 要新增或覆寫的檔案
    const toRemove = [];  // 目標端多出來的檔案
    const contents = new Map(); // pull 時順手留下已抓到的內容，不重抓

    for (const [relPath, srcInfo] of source) {
        const tgtInfo = target.get(relPath);
        if (!tgtInfo) {
            toWrite.push({ relPath, reason: '新增', size: srcInfo.size });
            continue;
        }
        if (srcInfo.size !== tgtInfo.size) {
            toWrite.push({ relPath, reason: `大小 ${fmtSize(tgtInfo.size)} → ${fmtSize(srcInfo.size)}`, size: srcInfo.size });
            continue;
        }
        // 大小一樣，逐位元組比對內容才算數
        const remoteBuf = await readRemote(client, relPath);
        const localBuf = readFileSync(join(root, relPath.split('/').join(sep)));
        if (mode === 'pull') contents.set(relPath, remoteBuf);
        if (!remoteBuf.equals(localBuf)) {
            toWrite.push({ relPath, reason: '內容不同（大小相同）', size: srcInfo.size });
        }
    }

    for (const relPath of target.keys()) {
        if (!source.has(relPath)) toRemove.push(relPath);
    }

    if (!toWrite.length && (!doDelete || !toRemove.length)) {
        console.log('兩端內容一致，沒有需要同步的檔案。');
        if (toRemove.length) console.log(`（目標端另有 ${toRemove.length} 個本次來源沒有的檔案，加 --delete 才會刪）`);
    } else {
        if (toWrite.length) {
            console.log(`要${mode === 'push' ? '上傳' : '寫入本機'} ${toWrite.length} 個檔案：`);
            for (const f of toWrite) console.log(`  ${f.relPath}  （${f.reason}，${fmtSize(f.size)}）`);
        }
        if (toRemove.length) {
            const label = doDelete ? '要刪除' : '目標端多出來（未加 --delete，不動）';
            console.log(`\n${label} ${toRemove.length} 個檔案：`);
            for (const relPath of toRemove) console.log(`  ${relPath}`);
        }
        console.log('');
    }

    const willChange = toWrite.length + (doDelete ? toRemove.length : 0);

    if (dryRun) {
        if (willChange) console.log('dry-run 結束，拿掉 --dry-run 才會真的同步。');
    } else if (willChange) {
        // pull 會蓋掉本機檔案，push 會蓋掉線上檔案，動手前先確認
        if (!assumeYes) {
            if (!process.stdin.isTTY) {
                console.error('非互動環境無法確認，請改加 --yes（或先用 --dry-run 檢查）。');
                process.exitCode = 1;
                throw new Error('SKIP');
            }
            if (mode === 'pull') console.log('注意：pull 會覆寫上列本機檔案，建議先 git commit 保留現況。');
            const rl = createInterface({ input: process.stdin, output: process.stdout });
            // 輸入被關掉（Ctrl+D 等）一律當成沒答應，寧可不做
            const answer = await rl.question(`確定要執行 ${mode}？(y/N) `).catch(() => '');
            rl.close();
            if (!['y', 'yes'].includes(answer.trim().toLowerCase())) {
                console.log('已取消，沒有動任何檔案。');
                throw new Error('SKIP');
            }
            console.log('');
        }

        for (const { relPath } of toWrite) {
            const localPath = join(root, relPath.split('/').join(sep));
            const remotePath = posix.join(FTP_REMOTE_DIR, relPath);
            if (mode === 'push') {
                const remoteDir = posix.dirname(remotePath);
                if (remoteDir !== '.' && remoteDir !== FTP_REMOTE_DIR) await client.ensureDir(remoteDir);
                await client.uploadFrom(localPath, remotePath);
            } else {
                const buf = contents.get(relPath) ?? await readRemote(client, relPath);
                await mkdir(dirname(localPath), { recursive: true });
                await writeFile(localPath, buf);
            }
            console.log(`  ✓ ${relPath}`);
        }

        if (doDelete) {
            for (const relPath of toRemove) {
                if (mode === 'push') {
                    await client.remove(posix.join(FTP_REMOTE_DIR, relPath));
                } else {
                    await rm(join(root, relPath.split('/').join(sep)));
                }
                console.log(`  ✗ 刪除 ${relPath}`);
            }
        }

        console.log(`\n同步完成：${toWrite.length} 個檔案已${mode === 'push' ? '上傳' : '更新到本機'}` +
            `${doDelete && toRemove.length ? `，${toRemove.length} 個已刪除` : ''}。`);
    }
} catch (err) {
    if (err instanceof Error && err.message === 'SKIP') {
        // 使用者取消或非互動環境，訊息前面已經印過
    } else {
        // 不要印出可能含密碼的 client 內部狀態，只印訊息
        console.error(`\nFTP 失敗：${err instanceof Error ? err.message : String(err)}`);
        if (secure) console.error('若主機沒開 TLS，在 .env 設 FTP_SECURE=false；自簽憑證則設 FTP_REJECT_UNAUTHORIZED=false');
        process.exitCode = 1;
    }
} finally {
    client.close();
}
