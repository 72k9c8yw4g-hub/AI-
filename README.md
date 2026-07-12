# 🧠 Dscribe – Second Brain for Claude

Claude と完全連携する「第二の脳」型タスク管理アプリ。
Mem / Tana / Fabric のような AI セカンドブレインを、**自分専用・無料** で持てます。

**解決すること:** チャットが変わるたびに毎回同じ説明をするのが面倒 / コンテキスト切れ対策。
一度話したことは Dscribe に貯まり、**どのチャットからでも** Claude が必要なときに取り出せます。

## 仕組み

```
┌─ claude.ai(どのチャットでも)──────────┐
│  Claude ──(コネクタ = リモートMCP)──▶  🧠 Dscribe (Cloudflare Workers + D1)
│    ・会話の最初に recall_context        │   ├ 記憶 (決定事項・好み・進捗)
│    ・「前に話した件」→ search           │   ├ タスク (期限・優先度・プロジェクト)
│    ・重要な話 → save_memory 自動保存    │   └ 過去チャット全文 (エクスポート取込)
└────────────────────────────────────────┘        ▲
   過去の全チャット履歴は claude.ai の「データをエクスポート」を
   Web ダッシュボードから取り込み ──────────────────┘
```

- **コネクタ連携**: claude.ai の「設定 → コネクタ → カスタムコネクタを追加」に URL を貼るだけ
- **全チャット共有**: 
  - 過去の分 … claude.ai 公式エクスポート (conversations.json / projects.json) を取り込み → 全文検索可能
  - これからの分 … 会話中に Claude が自動で保存・想起(下記のパーソナル設定を貼ると確実)
- **Web ダッシュボード**: タスク・記憶・チャット履歴をブラウザから閲覧/編集/検索

> ⚠️ **正直な注意点**: claude.ai の仕様上、コネクタが裏側で勝手に全チャットを同期し続けることはできません(コネクタは会話中にツールとして呼ばれたときだけ動きます)。そのため「過去分はエクスポート取込」「今後の分は会話中の自動保存」という2段構えです。ときどきエクスポートを再取込すると、チャット履歴側も最新になります(同じチャットは上書き更新)。

## セットアップ(約5分・無料)

必要なもの: [Node.js](https://nodejs.org) v18以上 / [Cloudflare 無料アカウント](https://dash.cloudflare.com/sign-up)

```bash
git clone <このリポジトリ>
cd <リポジトリ名>
bash setup.sh
```

`setup.sh` が全部やります(ログイン → DB作成 → デプロイ → 秘密トークン発行)。
最後に表示される **2つのURL** を控えてください:

1. **コネクタ用URL** `https://…workers.dev/mcp/<トークン>`
2. **ダッシュボード** `https://…workers.dev/app/<トークン>`

### ① Claude にコネクタとして追加

1. claude.ai → 設定 → **コネクタ** → **カスタムコネクタを追加**
2. 「リモートMCPサーバーURL」に **コネクタ用URL** を貼り付けて追加
3. チャット画面の 🔍(検索とツール)から **dscribe を有効化**

### ② Claude が自動で使うようにする(推奨)

claude.ai → 設定 → プロフィール → 「Claudeへの共通指示」に
[docs/claude-custom-instructions.md](docs/claude-custom-instructions.md) の内容を貼り付け。
これで毎回指示しなくても、会話の最初に記憶を読み込み、重要な話を自動保存するようになります。

### ③ 過去の全チャットを取り込む

1. claude.ai → 設定 → **プライバシー** → **データをエクスポート**
2. メールで届く zip を解凍
3. ダッシュボードの「📥 取り込み」タブで `conversations.json`(と `projects.json`)を選択

以降、どのチャットでも「前に○○の話したよね」→ Claude が `search` で全履歴から見つけます。

## Claude に生えるツール(8個)

| ツール | 役割 |
|---|---|
| `recall_context` | 会話の最初に呼ぶ。未完了タスク+最近の記憶+状況サマリー |
| `search` | 記憶・タスク・過去チャット全文の横断検索(AND検索) |
| `save_memory` | 決定事項・好み・進捗を長期記憶に保存 |
| `create_task` / `update_task` / `list_tasks` | タスク管理(期限・優先度・プロジェクト) |
| `get_item` | 検索結果IDの全文取得(長いチャットはページ送り) |
| `list_projects` | プロジェクト一覧と件数 |

## Claude Code から使う場合

```bash
claude mcp add --transport http dscribe https://<あなたのURL>/mcp/<トークン>
```

## ローカル開発

```bash
cp .dev.vars.example .dev.vars   # AUTH_TOKEN=dev-token
npm install
npm run migrate:local
npm run dev                       # http://localhost:8787/app/dev-token
```

## セキュリティと料金

- URL 内のトークン(48桁ランダム)を知らない限りアクセス不可。**URLは共有しないこと**
- データはあなたの Cloudflare アカウントの D1 (SQLite) にのみ保存。外部送信なし
- Cloudflare 無料枠(1日10万リクエスト / D1 5GB)で個人利用は余裕。**月額0円**
- トークン再発行: `npx wrangler secret put AUTH_TOKEN`(新しいランダム文字列を入力)

## よくある質問

- **Q. チャットで話したのに保存されてない**
  A. パーソナル設定(上記②)を貼っているか確認。または「これ覚えといて」と言えば確実に保存されます。
- **Q. 取り込みをやり直したい**
  A. もう一度同じファイルを取り込めばOK(同じチャットは上書き)。
- **Q. スマホからも使える?**
  A. コネクタは claude.ai アカウントに紐づくので、スマホアプリの会話でも同じ記憶が使えます。ダッシュボードもスマホ対応。
