#!/usr/bin/env bash
# Dscribe セットアップ (PCがある場合用。スマホだけの場合は README の「Deploy to Cloudflare」参照)
#
# 使い方:
#   bash setup.sh              … デプロイ(仕上げの登録はブラウザで1分)
#   bash setup.sh reset-owner  … オーナーのアクセスURLを再発行(URLを無くしたとき)
set -euo pipefail

command -v node >/dev/null 2>&1 || { echo "❌ Node.js が必要です → https://nodejs.org (v18以上)"; exit 1; }

# ---- オーナーURLの再発行モード ----
if [ "${1:-}" = "reset-owner" ]; then
  echo "→ オーナーのアクセスURLを再発行します(古いURLは無効になります)"
  TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
  npx wrangler d1 execute dscribe-db --remote --command "UPDATE users SET token = '$TOKEN' WHERE is_owner = 1"
  echo ""
  echo "✅ 新しいオーナーURL(あなたのWorkerのURLに付けてアクセス):"
  echo "   ダッシュボード: https://<あなたのWorkerのURL>/app/$TOKEN"
  echo "   コネクタ用   : https://<あなたのWorkerのURL>/mcp/$TOKEN"
  exit 0
fi

echo "=============================================="
echo " 🧠 Dscribe セットアップ (Cloudflare Workers)"
echo "=============================================="

echo "→ 1/4 依存パッケージをインストール中..."
npm install --no-fund --no-audit

echo "→ 2/4 Cloudflare へのログインを確認中..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "   ブラウザが開くので Cloudflare にログインしてください(無料アカウントでOK)"
  npx wrangler login
fi

if grep -q "REPLACE_WITH_DATABASE_ID" wrangler.toml; then
  echo "→ 3/4 データベース (D1) を作成中..."
  npx wrangler d1 create dscribe-db >/dev/null 2>&1 || true
  DB_ID=$(npx wrangler d1 list --json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const a=JSON.parse(d);const x=a.find(v=>v.name==='dscribe-db');if(!x){console.error('dscribe-db が見つかりません');process.exit(1)}console.log(x.uuid)})")
  node -e "const fs=require('fs');fs.writeFileSync('wrangler.toml',fs.readFileSync('wrangler.toml','utf8').replace('REPLACE_WITH_DATABASE_ID','$DB_ID'))"
  echo "   データベースID: $DB_ID (wrangler.toml に書き込みました)"
else
  echo "→ 3/4 データベースは設定済み (スキップ)"
fi

echo "→ 4/4 デプロイ中..."
DEPLOY_OUT=$(npx wrangler deploy 2>&1) || { echo "$DEPLOY_OUT"; exit 1; }
echo "$DEPLOY_OUT"
WORKER_URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[^ ]+\.workers\.dev' | head -1 || true)
WORKER_URL=${WORKER_URL:-"https://dscribe.<あなたのサブドメイン>.workers.dev"}

echo ""
echo "=============================================="
echo " ✅ デプロイ完了!あと1分で使えます"
echo "=============================================="
echo ""
echo "ブラウザ(スマホでもOK)で以下を開いて、メールアドレスを登録してください:"
echo ""
echo "   $WORKER_URL"
echo ""
echo "→ あなた専用の「ダッシュボードURL」「Claudeコネクタ用URL」「招待リンク」が発行されます。"
echo "  (この初期設定ページは最初の1回だけ表示されます)"
echo ""
echo "⚠ URLを無くしたときは: bash setup.sh reset-owner"
