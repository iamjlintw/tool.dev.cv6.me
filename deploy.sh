#!/usr/bin/env bash
#
# 部署：把本機的靜態檔案推到正式站台（本質上就是 ftp-sync.sh push）。
#
#   ./deploy.sh             部署（會先列出差異並詢問確認）
#   ./deploy.sh --dry-run   只比對並列出會變動的檔案，不寫入遠端
#   ./deploy.sh --yes       略過確認直接部署
#   ./deploy.sh --delete    連同遠端多出來的檔案一併刪除（預設不刪）
#
# 其餘參數會原封不動轉給 ftp-sync.sh；FTP 帳密放在 .env（見 .env.example）。

set -euo pipefail
cd "$(dirname "$0")"

exec ./ftp-sync.sh push "$@"
