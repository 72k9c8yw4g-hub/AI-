# 他の AI を Dscribe（共有脳）につなぐ

Dscribe は Claude 専用ではありません。**あなた専用の AI ならなんでも**、同じ「第二の脳」を読み書きできます。
どの AI が書いた記憶かは `by:名前` として記録・表示されるので、複数の AI が共同で使っても混乱しません。

```
   Claude ──┐
   FRIDAY ──┼──▶ 🧠 Dscribe（共有脳）
   ChatGPT ─┤      ├ 記憶（誰が書いたか記録される）
   自作AI ──┘      ├ タスク / プロジェクト概要
                   └ 過去チャット全文
```

## ルート A: MCP 対応の AI（いちばん簡単）

ChatGPT（デスクトップ）、Cursor、Cline など **MCP クライアント対応のツール**は、コネクタ URL を貼るだけ：

```
https://<あなたのWorker>/mcp/<トークン>
```

接続すると 10 個のツール（recall_context / search / save_memory …）と使い方の指示が自動で渡ります。
その AI に伝えることは1つだけ — 「**save_memory するときは agent に自分の名前（例: chatgpt）を渡して**」。

## ルート B: 自作 AI・スクリプト（REST API）

FRIDAY のような自作 AI からは、HTTP で直接叩けます。認証は URL のトークンだけ（ヘッダー不要）。

| やること | リクエスト |
|---|---|
| 状況の把握（会話の最初） | `GET /api/<token>/overview` （`?project=名前` `?focus=キーワード` 可）|
| 横断検索 | `GET /api/<token>/search?q=キーワード` |
| 記憶を保存 | `POST /api/<token>/memories` `{"content":"...","kind":"memory|decision|note","project":"...","source":"friday"}` |
| 決定を変更（履歴を残す） | 同上 + `"supersedes":旧ID,"reason":"変更理由"` |
| 記憶を削除 | `DELETE /api/<token>/memories/<id>` |
| タスク作成 / 更新 | `POST /api/<token>/tasks` / `PATCH /api/<token>/tasks/<id>` |
| プロジェクト概要の更新 | `PATCH /api/<token>/projects/<id>` `{"description":"..."}` |
| 全文取得 | `GET /api/<token>/item?type=memory|task|chat&id=N` |

**重要:** `source` に自分の AI 名（英数字・小文字、例 `friday`）を入れること。ダッシュボードに 🤝 friday バッジが付き、他の AI からも `by:friday` として見えます。

### 自作 AI に渡すシステムプロンプト雛形

```
あなたはユーザー専用のAI「<名前>」。ユーザーの共有脳 Dscribe を使うこと。
- 起動時・会話の最初に GET /overview で現在の状況(タスク・記憶・決定)を読み込む。
- 重要な決定・進捗・ユーザーの好みが出たら POST /memories で保存する(source="<名前>")。
- 過去の決定を変える場合は削除せず、supersedes=旧ID と reason を付けて保存する(履歴が残る)。
- 過去の文脈が必要なら GET /search?q= で検索する。by:claude など他のAIの記憶も同格に信頼してよい。
```

## 混乱しない仕組み（設計済み）

- **帰属**: すべての記憶に「誰が書いたか」が記録される（Claude=🤖 / 他AI=🤝名前）
- **決定の一貫性**: 決定の変更は supersedes による線形チェーン。すでに置き換え済みの決定を別の AI が同時に置き換えようとするとエラーで最新版へ誘導されるので、決定が枝分かれしない
- **共通の現在地**: どの AI も recall_context / overview で同じ「現行版のみ」のビューを見る（旧版は自動で除外）

## 注意

- トークンは全 AI 共通（= あなたのアカウント）。トークンを再発行すると**全部の AI の接続 URL を貼り替え**る必要があります
- 招待リンクで作った別ユーザーのデータには、どの AI からもアクセスできません（完全分離）
