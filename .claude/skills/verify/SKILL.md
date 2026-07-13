---
name: verify
description: Dscribe (Cloudflare Workers + D1) をローカルで起動して MCP / REST / ダッシュボードを実際に駆動して検証する手順
---

# Dscribe の検証手順

## 起動

```bash
cp .dev.vars.example .dev.vars                      # INVITE_CODE=dev-invite
npm install
npx wrangler d1 migrations apply dscribe-db --local
npm run seed:local                                  # オーナー owner@local / dev-token を作成
npx wrangler dev --port 8787                        # バックグラウンド推奨
```

- wrangler.toml の database_id がプレースホルダのままでもローカルは動く(リモートのみ必要)
- 起動確認: `curl -s http://localhost:8787/` が HTML を返せばOK
- マルチアカウント: `POST /join/dev-invite` に `{"email":"a@example.com"}` で新規ユーザー作成。
  返ってきたトークンで2ユーザー目として操作し、**ユーザー間でデータが見えないこと**を必ず確認する
  (Aで save_memory → Bの search/recall_context に出ない、Bのidを get_item しても見つからない)

## MCP エンドポイントの駆動 (Claude コネクタ相当)

```bash
# ハンドシェイク
curl -s -X POST http://localhost:8787/mcp/dev-token -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}'
# ツール一覧 (8個: recall_context, search, save_memory, create_task, update_task, list_tasks, get_item, list_projects)
curl -s -X POST http://localhost:8787/mcp/dev-token -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
# ツール実行
curl -s -X POST http://localhost:8787/mcp/dev-token -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"recall_context","arguments":{}}}'
```

異常系の期待値: 不正トークン→401 / GET→405 / 壊れたJSON→-32700 /
未知ツール→-32602 / 未知メソッド→-32601 / notification(idなし)→HTTP 202

## 取り込みの駆動

claude.ai エクスポート形式のサンプル配列を `/api/dev-token/import/conversations` に POST。
`chat_messages[].text` と `content:[{type:"text",text}]` の両形式をテストすること。
同じ uuid の再取込は updated にカウントされ、メッセージが重複しないこと。

## ダッシュボード (GUI)

Playwright (playwright-core + executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome) で
`http://localhost:8787/app/dev-token` を開いてタブを巡回・スクリーンショット。

**注意**: 「追加」ボタンは `getByRole("button", { name: "追加", exact: true })` で押す。
`text=追加` だと見出し「タスクを追加」にマッチして空振りする。

## 検証できないもの

- `setup.sh` の Cloudflare 実デプロイ部分(アカウントが必要)→ `bash -n setup.sh` の構文チェックのみ
- claude.ai 本番コネクタとの疎通(デプロイ後にユーザーが確認)
