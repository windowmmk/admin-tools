#!/bin/bash
# 工作小工具一鍵發佈：構建 → 本地驗收 → 部署 → 生產驗收
#
# 用法：
#   ./publish_works.sh          完整發佈（構建＋驗收＋部署＋生產驗收）
#   ./publish_works.sh --check  只跑構建＋本地驗收，不部署
#
# 任何一步失敗即停：未通過本地驗收的版本不會被部署，
# 部署後生產驗收不過會大聲報錯。
#
set -euo pipefail
cd "$(dirname "$0")"

if [ "${1:-}" = "--check" ]; then
  CHECK_ONLY=1
else
  CHECK_ONLY=0
fi

echo "=== 1/5 構建 ==="
python3 build_combo.py

echo "=== 2/5 本地驗收（57 組） ==="
node verify_combo.js

echo "=== 3/5 日期邊界 sweep（12 組） ==="
node sweep_v191.js

if [ "$CHECK_ONLY" = "1" ]; then
  echo "✅ 構建＋本地驗收全過（--check 模式，未部署）"
  exit 0
fi

echo "=== 4/5 部署到 Cloudflare works ==="
python3 skills/cloudflare/bin/cf_deploy.py works dist/work-tools

echo "=== 5/5 生產驗收 ==="
echo "等 10 秒待 edge 生效…"
sleep 10
curl -s https://works.workertool.workers.dev/ -o /tmp/prod.html
curl -s https://works.workertool.workers.dev/sw.js -o /tmp/prod_sw.js
curl -s https://works.workertool.workers.dev/manifest.webmanifest -o /tmp/prod_manifest.json
curl -s https://works.workertool.workers.dev/version.txt -o /tmp/prod_version.txt
node verify_prod.js

echo "🎉 發佈完成，生產驗收全過"
