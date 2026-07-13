#!/usr/bin/env bash
# Dscribe ワンコマンドセットアップ (Cloudflare 無料プランでOK)
# 再実行するとオーナーURLと招待リンクは再発行されます(メンバーのURLはそのまま)
set -euo pipefail

echo "=============================================="
echo " 🧠 Dscribe セットアップ (Cloudflare Workers)"
echo "=============================================="

command -v node >/dev/null 2>&1 || { echo "❌ Node.js が必要です → https://nodejs.org (v18以上)"; exit 1; }

echo "→ 1/6 依存パッケージをインストール中..."
npm install --no-fund --no-audit

echo "→ 2/6 Cloudflare へのログインを確認中..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  echo "   ブラウザが開くので Cloudflare にログインしてください(無料アカウントでOK)"
  npx wrangler login
fi

if grep -q "REPLACE_WITH_DATABASE_ID" wrangler.toml; then
  echo "→ 3/6 データベース (D1) を作成中..."
  npx wrangler d1 create dscribe-db >/dev/null 2>&1 || true
  DB_ID=$(npx wrangler d1 list --json | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{const a=JSON.parse(d);const x=a.find(v=>v.name==='dscribe-db');if(!x){console.error('dscribe-db が見つかりません');process.exit(1)}console.log(x.uuid)})")
  node -e "const fs=require('fs');fs.writeFileSync('wrangler.toml',fs.readFileSync('wrangler.toml','utf8').replace('REPLACE_WITH_DATABASE_ID','$DB_ID'))"
  echo "   データベースID: $DB_ID (wrangler.toml に書き込みました)"
else
  echo "→ 3/6 データベースは設定済み (スキップ)"
fi

echo "→ 4/6 テーブルを作成中..."
npx wrangler d1 migrations apply dscribe-db --remote

echo "→ 5/6 デプロイ中..."
DEPLOY_OUT=$(npx wrangler deploy 2>&1) || { echo "$DEPLOY_OUT"; exit 1; }
echo "$DEPLOY_OUT"
WORKER_URL=$(echo "$DEPLOY_OUT" | grep -oE 'https://[^ ]+\.workers\.dev' | head -1 || true)
WORKER_URL=${WORKER_URL:-"https://dscribe.<あなたのサブドメイン>.workers.dev"}

echo "→ 6/6 オーナーアカウントと招待コードを設定中..."
OWNER_TOKEN=$(node -e "console.log(require('crypto').randomBytes(24).toString('hex'))")
INVITE=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")
# オーナーアカウントを作成(既にあればトークンを再発行)
npx wrangler d1 execute dscribe-db --remote --command "INSERT INTO users (email, token, is_owner) VALUES ('owner@local', '$OWNER_TOKEN', 1) ON CONFLICT(email) DO UPDATE SET token = excluded.token" >/dev/null
# 招待コード(このコードを含むリンクを知っている人だけが新規登録できる)
echo "$INVITE" | npx wrangler secret put INVITE_CODE

echo ""
echo "=============================================="
echo " ✅ セットアップ完了!"
echo "=============================================="
echo ""
echo "① あなた(オーナー)のダッシュボード ※ブックマーク必須"
echo ""
echo "   $WORKER_URL/app/$OWNER_TOKEN"
echo ""
echo "② あなたの Claude コネクタ用 URL"
echo "   (claude.ai → 設定 → コネクタ → カスタムコネクタを追加 に貼り付け)"
echo ""
echo "   $WORKER_URL/mcp/$OWNER_TOKEN"
echo ""
echo "③ 招待リンク(新規登録ページ。招待したい人にだけ渡す)"
echo ""
echo "   $WORKER_URL/join/$INVITE"
echo ""
echo "⚠ ①②はあなたのログイン情報そのものです。他人に教えないでください。"
echo "  メンバーの管理(URL再発行・削除)はダッシュボードの ⚙️設定 タブでできます。"
