#!/usr/bin/env bash
#
# 靜態站台的 FTP 雙向同步。
#
#   ./ftp-sync.sh                   互動選單，問要推上去還是拉回來
#   ./ftp-sync.sh push              本機 → 遠端（部署）
#   ./ftp-sync.sh pull              遠端 → 本機（把主機上的手改抓回來）
#   ./ftp-sync.sh push --dry-run    只比對並列出差異，不寫檔
#   ./ftp-sync.sh pull --delete     連同本機多出來的檔案一起刪
#
# FTP 帳密等參數放在 .env（見 .env.example），不寫在這個檔案裡。

set -euo pipefail
cd "$(dirname "$0")"

if [ ! -f .env ]; then
    echo "找不到 .env，請先複製範本並填入 FTP 資訊："
    echo "  cp .env.example .env"
    exit 1
fi

if [ ! -d node_modules ]; then
    echo "▸ 安裝相依套件（basic-ftp）"
    npm install
fi

node scripts/ftp-sync.mjs "$@"
