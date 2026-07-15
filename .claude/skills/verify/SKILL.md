---
name: verify
description: Dscribe (Cloudflare Workers + D1) をローカルで起動して MCP / REST / ダッシュボードを実際に駆動して検証する手順
---

# Dscribe の検証手順

## 起動

```bash
npm install
rm -rf .wrangler                 # まっさらな状態から検証する場合
npx wrangler dev --port 8787     # バックグラウンド推奨。テーブルは初回リクエストで自動作成される
```

- wrangler.toml の database_id がプレースホルダのままでもローカルは動く(リモートのみ必要)
- 初期設定: `curl -s -X POST http://localhost:8787/setup -H 'Content-Type: application/json' -d '{"email":"owner@example.com"}'`
  → app_url / mcp_url / join_url が返る。トークンはこのレスポンスから取る(2回目以降は403)
- ユーザー0人のとき `GET /` は初期設定ページ、1人以上いれば通常ランディングになること
- マルチアカウント: join_url に `{"email":"a@example.com"}` を POST して2人目を作成。
  **ユーザー間でデータが見えないこと**を必ず確認する
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

## 決定の変更履歴 (supersedes) の駆動

```bash
# 決定を保存 → 置き換え(変更理由つき)
... tools/call save_memory {"content":"商品はタコ型に決定","kind":"decision"}          # → memory#1
... tools/call save_memory {"content":"イカ型に変更","kind":"decision","supersedes":1,"reason":"金型コスト"}
```
期待値: 応答に「memory#1 を旧版としてアーカイブ / 変更理由: …」/
get_item(memory,1) に「⚠ これは旧版です」+「## 変更履歴」/ recall_context から旧版が消える /
search で旧版に「旧版→#2」マーク / supersedes に存在しないID→「見つかりません」/
置き換え済みIDを再指定→「最新版 memory#N を指定してください」/
他ユーザーの記憶IDを supersedes→「見つかりません」(ユーザー分離) /
現行版を DELETE /api/<token>/memories/<id> すると旧版が現行に復帰(⚠が消える)

## スキーママイグレーションの検証 (既存DB互換)

スキーマ変更を入れたら、**旧コードで作ったDBが新コードで壊れないこと**を確認する:
1. `git stash` で新実装を退避 → `rm -rf .wrangler` → dev 起動 → /setup → 記憶を保存
2. dev 停止 → `git stash pop` → **dev 再起動**(schemaReady はアイソレート単位のフラグのため必須)
3. `npx wrangler d1 execute dscribe-db --local --command "PRAGMA table_info(memories)"` で新カラム確認
4. 旧データが recall_context / get_item で無傷で読めること(新カラムは NULL = 現行扱い)

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
