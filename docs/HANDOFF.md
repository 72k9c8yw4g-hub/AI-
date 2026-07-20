# 引き継ぎ書（新セッション用）— Dscribe + AI意思決定OS

このファイルは、別セッションの Claude Code がこのプロジェクトを**ゼロから完璧に引き継ぐ**ための台帳。
この1冊 + 併読3冊で、原本の設計書が無くても作業を続けられるように書いてある。

---

## 0. まず読む順番
1. この `docs/HANDOFF.md` … 全体像・アーキテクチャ・デプロイ・検証・ハマりどころ・データモデル
2. `docs/os-design-canon.md` … **設計書4冊の復元版**（役職のルール・章対応表）。原本PDFは新セッションに渡らないのでこれが正典
3. `docs/os-feature-inventory.md` … 実装済み機能と「削る候補」台帳
4. `docs/os-roadmap.md` … Phase 設計
5. （原本があれば）ユーザーがアップロードした設計書4冊（憲法 v3.0 / 運用 v2.0 / 技術 v1.1 / 実装準備 v1.0）。**チャット添付なので新セッションには基本渡らない** → 2の復元版で代替。原本PDFはユーザーの Mac `~/Desktop/AI意思決定OS設計書_完成版/` に保管（Dscribe の memory#7）。**そこの最終版は憲法v3.1・技術v1.3で、実装に使った版より新しい可能性がある** — 原本との差を詰める作業をするときは最新PDFの再共有を依頼すること。
6. **Dscribe（第二の脳）にも引き継ぎが入っている**: MCPコネクタで「AI意思決定OS 引き継ぎ」を検索すると、開発引き継ぎ台帳（memory#19）と方針決定（memory#20）が出る。リポを読めない通常のClaudeチャットは、こちらから文脈を引く。

## 1. これは何か
- **Dscribe**: Claude と連携する「第二の脳」。記憶・タスク・過去チャット横断検索。claude.ai のコネクタ(リモートMCP)として動く。完全独立アカウント・招待制。
- **AI意思決定OS**: 同じ Worker に同居する意思決定支援アプリ。ユーザーが書いた4冊の設計書に基づく「5役職の組織」。
  - **メンター兼司令塔**: 共同創業者・YESマン禁止・反対権・実行優先（送信時のLLM応答）
  - **記録官**: 会話→保存候補→[承認]で決定事項に（無承認保存禁止）
  - **特命監視官**: 逸脱/ループ/矛盾を横から警告（独立監査・非中継）+ 節目レポート
  - **作業AI群**: 3ターン協働→メンター整理→ユーザー（成果物はメンター経由）
  - **ユーザー**: 最終決定権

## 2. アーキテクチャ
- **単一 Cloudflare Worker + D1(SQLite)**。TypeScript。フレームワークなし。
- ルーティング（`src/index.ts`）:
  - `/` ランディング / `/setup` オーナー登録 / `/join/<コード>` 招待登録
  - `/app/<token>` Dscribe ダッシュボード（閲覧専用）
  - `/os/<token>` AI意思決定OS アプリ（PWA・スマホ主対象）
  - `/mcp/<token>` Claude コネクタ(MCP)
  - `/api/<token>/…` REST（Dscribe） / `/api/<token>/os/…`（OS）
  - `/os/sw.js` `/os/icon-*.png` `/os/<token>/manifest.webmanifest` PWA
  - `scheduled()` = 週次 cron（バックアップ + 50日パージ）
- **認証 = URLのトークン**（48桁）。ユーザーごとに `user_id` で完全分離。
- **ファイル構成**:
  - `src/index.ts` エントリ・ルーティング・Env・セキュリティヘッダ・scheduled
  - `src/db.ts` Dscribe のDB層（memories/tasks/projects/conversations、supersedes、search）
  - `src/mcp.ts` MCPサーバ（ツール群 + INSTRUCTIONS）
  - `src/ui.ts` Dscribe ダッシュボードUI + セットアップ/登録ページ
  - `src/importer.ts` claude.ai エクスポート取込
  - `src/schema.ts` Dscribe スキーマ + `ensureOsSchema` 呼び出し
  - `src/os/schema.ts` OS の全テーブル（`CREATE TABLE IF NOT EXISTS` 冪等）
  - `src/os/provider.ts` LLMプロバイダ抽象（anthropic/openai/gemini・キー・フォールバック・タイムアウト）
  - `src/os/org.ts` 役職のシステムプロンプト + ターン実行（mentor/recorder/monitor/worker/report）
  - `src/os/db.ts` OS のDB層（chat/message/candidate/decision/project/saved/report/notification/keys/budget/暗号化）
  - `src/os/api.ts` OS の REST ハンドラ（`handleOsApi`）
  - `src/os/ui.ts` OS アプリUI（1ファイルの巨大HTML文字列。7タブSPA）
  - `src/os/assets.ts` PWA アイコン(base64)/manifest/service worker
  - `src/os/backup.ts` バックアップ/復元/パージ

## 3. 2リポジトリ・2段階デプロイ（重要）
- **開発リポ**: `72k9c8yw4g-hub/AI-`（このセッションのルート）。作業ブランチ **`claude/ai-task-manager-integration-vk6g1r`**。
- **本番リポ**: `72k9c8yw4g-hub/dscribe`（Cloudflare が main を自動デプロイ）。ローカルに `/tmp/dscribe` としてクローン済み（無ければ `git clone` し直す）。
- **フロー**: AI- のブランチにコミット → PR作成 → **squashマージ** → **dscribe の main に同じ変更をコピーしてプッシュ** → Cloudflare 自動デプロイ。
- **注意**: PRが squashマージされると、次にブランチへ push するとき `origin/main` と履歴が分岐する。毎回 **`git fetch origin main && git checkout -B <branch> origin/main` で作り直してから作業** → 変更を stash pop → コミット → **`git push --force-with-lease`**。これは正常な運用（マージ済み履歴の上書き）。
- dscribe の `wrangler.toml` は本物の `database_id`（`1c6d9a8c-…`）を持つので、AI- から丸コピーせず database_id は保持すること。

## 4. 検証のやり方（毎PR）
1. `npm run typecheck`（= `tsc --noEmit`）
2. `rm -rf .wrangler/state && npm run dev`（localhost:8787）→ curl で REST 駆動
   - cron を試すときは `npx wrangler dev --test-scheduled` → `curl "http://127.0.0.1:8787/__scheduled?cron=..."`
3. **Playwright**（`playwright-core` を `npm i -D --no-save`、Chromium は `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`、`--no-sandbox`）でスマホ390px/PC1280pxのUI確認・スクショ
4. コミット末尾に `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>` と `Claude-Session:` 行

## 5. ハマりどころ（実際に踏んだ）
- **`pkill` がシェルごと落とす**（exit 144）。`kill $(pgrep -f "wrangler dev")` を単独行で。
- `wrangler dev` 起動時の undici/`Request.cf` エラーはこの環境では無害（ネット制限）。
- **非ASCIIホモグリフ混入**に注意（過去にキリル文字が識別子に紛れた）。os/ 配下は python で `0x0370-0x04FF` を走査してから出す。
- **UIの再描画レース**: 詳細ビューは `showScreen`（ローダー再実行）ではなく `activatePanel`（表示のみ切替）を使う。過去に吹き出し/詳細が消えるバグ多発。
- **`src/os/ui.ts` はテンプレートリテラル（バッククォート）1個で全SPAを吐く**。中のJS文字列に `'\n'` と書くと**実改行に化けてJS全体が構文エラー**になる（アプリ真っ白）。改行が要るときは `String.fromCharCode(10)` を使う。tsc は通ってしまうので**必ずブラウザで pageerror が無いか確認**。
- **ローカル検証で dev サーバを複数同時に立てない**: 同じ `--persist-to` ディレクトリに 2 つ以上の `wrangler dev` を向けると SQLite が競合して読みが不安定になる（一覧が空・送信が反映されない等）。1検証=1サーバ、ポートも persist も分ける。
- **LLMキー**: ⚙️で登録（D1にAES-GCM暗号化保存）または `wrangler secret put`。未設定は**スタブ応答**で全フロー動く。gemini 既定は `gemini-2.5-flash`、404/429は自動フォールバック。
- **R2バックアップはオプトイン**: `wrangler.toml` の `[[r2_buckets]]` はコメントアウト。バケット `dscribe-backup` を作ってからコメント解除しないとデプロイが落ちる。
- **1日500回のLLM上限**（os_llm_usage）。send=2/propose=1/委任=4/report=1 消費。

## 6. ユーザーについて
- 日本語・カジュアル(タメ口でOK)・スマホ主体・非エンジニア。**正直さを最重視**（できない事・未実装・コストは隠さず言う）。「本番反映して」=dscribeへプッシュ。
- 進め方: 大きい判断は AskUserQuestion で確認、それ以外は動かして見せる。各機能は必ずローカル駆動+スクショで見せてから本番反映。

## 7. 現在地（このセッション終了時点）
- 設計書4冊の要素を**ほぼ全反映済み**（inventory 参照）。5役職・承認フロー・決定の進化追跡・監視・作業AI・プロジェクト構造・保存データ・通知・節目レポート・決定→タスク化・自動バックアップ/復元/パージ・PWA・APIキー暗号化・コスト上限。
- **未実装（意図的見送り）**: ファイル管理(R2要)・PC4タブ同時・共同編集(owner/editor/viewer)・プロジェクト複製・PWAプッシュ通知・決定/記憶の完全復元。理由は inventory に記載。

## 8. 直近の課題・次にやること
- **[修正中→反映予定]** 特命監視官が無関係プロジェクトの決定を持ち出して誤警告する件 → (a)監視官に渡す決定をチャットのプロジェクトに絞る (b)プロンプトを「同じ対象のみ contradiction」に厳格化。`src/os/org.ts` MONITOR_SYSTEM と `src/os/api.ts` send ハンドラを参照。
- **次フェーズ = 剪定**: ユーザーが数週間使い、`docs/os-feature-inventory.md` の「様子見/削りやすい」で使わなかった機能を削除PRにしていく。作業AI(🛠+🗂+worker+パージ)を使わないと決まればまとめて削れる=一番軽くなる。
- 品質チューニング: 実LLM(Gemini無料枠)接続済み。各役職のプロンプトを実運用で調整していく段階。

## 9. 新セッションへの最初の一言（ユーザーが貼るプロンプトの想定）
「Dscribe と AI意思決定OS の続き。`docs/HANDOFF.md` → `docs/os-design-canon.md` → `docs/os-feature-inventory.md` → `docs/os-roadmap.md` を読んでから続けて。作業は AI- リポのブランチ `claude/ai-task-manager-integration-vk6g1r`、本番反映は dscribe リポの main。」

---

## 10. データモデル（OS 追加テーブル / `src/os/schema.ts`）
すべて Dscribe と同じ D1 に同居。`CREATE TABLE IF NOT EXISTS` で冪等（新規DBでも本番DBでも初回リクエストで自動適用）。`user_id` で完全分離。

| テーブル | 役割 | 主なカラム |
|---|---|---|
| `os_chats` | プロジェクト配下の会話スレッド | `project_id`(→projects), `title` |
| `os_messages` | 1メッセージ=1行 | `role`(user/mentor/monitor/recorder/worker/system), `content`, `seq` |
| `os_role_config` | 役割ごとの使用モデル（worker1/2/3 スロット含む） | PK(`user_id`,`role`), `provider`, `model` |
| `os_role_keys` | 役割ごとのAPIキー上書き（空なら共有キーに落ちる） | PK(`user_id`,`role`), `key`(暗号化) |
| `os_candidates` | 記録官の保存候補（無承認保存禁止の実体） | `status`(pending/approved/rejected), `supersedes_id`, `memory_id`, `chat_id`, **`reject_reason`**(却下事項), **`mentor_note`**(メンター確認) |
| `os_worker_runs` | 作業AIの1アサイン | `status`(running/done/failed), `task`, `summary` |
| `os_worker_msgs` | 作業AI同士の議論ログ（閲覧専用） | `run_id`, `role`, `content`, `seq` |
| `os_api_keys` | ⚙️で登録する暗号化APIキー（プロバイダ別・共有） | PK(`user_id`,`provider`), `key`(AES-GCM暗号文) |
| `os_files` | ファイル/写真（R2不使用・D1にbase64） | `chat_id`, `project`, `name`, `mime`, `data`(base64) |
| `os_llm_usage` | 1日のLLM呼び出し回数 | PK(`user_id`,`day`), `calls` |
| `os_reports` | 監視官の節目レポート | `chat_id`, `content` |
| `os_project_status` | プロジェクト完了/アーカイブ + 最終報告 | PK(`user_id`,`project_id`), `status`, `final_report` |

- **後付けカラムは `ensureOsSchema` の `OS_MIGRATIONS`（`ALTER TABLE ADD COLUMN` を try/catch で冪等実行）で足す**。`CREATE TABLE IF NOT EXISTS` では既存テーブルに列を追加できないため。`os_candidates.reject_reason` / `mentor_note` はこの方式で追加済み。新カラムを足すときはここに1行追加する。

- 「決定事項」の実体は Dscribe 側の **`memories`**（kind=decision）。承認された候補がここに入り、`supersedes`/`superseded_by` チェーンで Active/Archived を表現（旧決定は消さずアーカイブ）。
- 決定→タスク化は Dscribe 側の **`tasks`** に橋渡し（📌詳細の▶）。

## 11. LLMプロバイダ設定（`src/os/provider.ts`）
- 対応: `anthropic` / `openai` / `gemini` / **`groq`** / **`cerebras`**。役割ごとに provider+model+キー を選べる（`os_role_config` + `os_role_keys`）。作業AIは worker1/2/3 で個別上書き可。
- **groq/cerebras は OpenAI互換** → `callOpenAICompat`（ベースURLだけ差し替え、`OPENAI_COMPAT_BASE`）で openai と共用。groq=`https://api.groq.com/openai/v1` / cerebras=`https://api.cerebras.ai/v1`。
- 既定モデル: anthropic=`claude-sonnet-4-20250514` / openai=`gpt-4o` / gemini=`gemini-2.5-flash` / **groq=`llama-3.3-70b-versatile`** / **cerebras=`llama-3.3-70b`**。
- **役割別キーの狙い**: 無料枠は各社独立。監視官(毎メッセージ)を別プロバイダ/別キーに逃がすとメンターの枠を食い潰さない。無料キー: Gemini=aistudio.google.com / Groq=console.groq.com / Cerebras=cloud.cerebras.ai（いずれもカード不要）。
- **`resolveModel` の自己修復**: provider と model がちぐはぐ（例: provider=gemini なのに model がclaude名）なら既定modelに落とす。過去の404の主因。
- **gemini 自動フォールバック**: 404/429 時に `["gemini-flash-latest","gemini-2.5-flash","gemini-2.5-flash-lite","gemini-2.0-flash"]` から順に2つまで再試行。`gemini-2.0-flash` は無料枠が無いことがある→既定にしない。
- gemini は `x-goog-api-key` ヘッダ。全fetchに `AbortSignal.timeout`（軽い処理15s / 生成60s）。
- **キー未設定でも全フロー動く**＝スタブ応答（記録官・監視官・メンター・作業AIそれぞれに決定的スタブ）。UIで動作確認 → 実キー接続、の順で進めてきた。
- キーは ⚙️（D1にAES-GCM暗号化）または `wrangler secret put`。**チャットに生キーを貼らせない**運用。

## 12. コスト上限（`consumeLlmBudget` / `DAILY_LLM_LIMIT=500`）
1日500回/ユーザー。消費内訳: **送信(send)=2**（メンター+監視官）/ **propose=2**（記録官+メンター確認）/ **作業AI委任delegate=4** / **節目report=1** / **プロジェクト最終報告=1**。超過は例外で弾く（暴走・トークン漏洩時の焼き尽くし対策）。

## 13. 主要な設計判断（なぜこうなっているか）
- **独立アプリ本建築（Route C）を選択**: Dscribe に相乗りではなく `/os` に独立SPA。理由=意思決定OSは役職・承認・監視という別ドメインで、Dscribe(第二の脳)の閲覧UIとは要求が違うため。データ層(D1)だけ共有し、決定=memories・タスク=tasks を再利用。
- **単一Worker2アプリ**: デプロイ・認証・DBを1つに。`/app`=Dscribe(閲覧) / `/os`=意思決定OS / `/mcp`=Claudeコネクタ。
- **トークンin URL認証**: ログインUIを持たず、48桁トークンを知る人=本人。招待制・完全独立アカウント。APIキーも「トークンを知る人だけが使える」＝他データと同じ信頼レベルに置いた。
- **監視官は非中継**: データフローに割り込ませると会話が壊れる/重くなるため、横から監査して警告だけ残す独立ライン（LLM文脈からmonitor発言を除外）。
- **作業AIは固定3ターン**: 無限議論防止。成果物は必ずメンター経由（品質ゲート）。
- **スマホ主対象**: ユーザーは非エンジニア・スマホ利用。PWA化してホーム画面に置ける。PC左レール/スマホ下タブの7ナビ。

## 14. 機能 → コードの地図
- ルーティング/Env/ヘッダ/cron … `src/index.ts`
- OS REST 全ルート … `src/os/api.ts`（`handleOsApi`。chats/send/propose/delegate/report/approve/reject/decisions/search/saved/projects/notifications/models/roles/keys/status/runs/backup/restore）
- 役職の人格+ターン … `src/os/org.ts`（`*_SYSTEM` と run関数群）
- OS DB層+暗号化+予算 … `src/os/db.ts`
- OS UI（7タブSPA・巨大HTML文字列）… `src/os/ui.ts`（`activatePanel`=表示切替のみ / `showScreen`=ローダー付き。詳細ビューは前者を使うこと）
- PWA資産 … `src/os/assets.ts`
- バックアップ/復元/パージ … `src/os/backup.ts`
- Dscribe側（記憶/タスク/検索/MCP）… `src/db.ts` `src/mcp.ts` `src/ui.ts` `src/importer.ts`

## 15. アプリの触り方（検証時）
- 本番: `/os/<48桁トークン>`（トークンはユーザーが保有。ここには書かない）。
- ローカル: `rm -rf .wrangler/state && npm run dev` → `/setup` でオーナー作成 → 返るトークンで `/os/<token>`。REST は `/api/<token>/os/...` を curl 駆動。
- スクショ検証: Playwright(`playwright-core` を `npm i -D --no-save`)、Chromium=`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`、`--no-sandbox`、スマホ390px / PC1280px。
- cron: `npx wrangler dev --test-scheduled` → `curl "http://127.0.0.1:8787/__scheduled?cron=0%209%20*%20*%201"`。
- Playwright は ESM で `import pkg from '/abs/path/playwright-core/index.js'; const {chromium}=pkg;`（bare指定/名前付きimportは解決失敗する）。ホームパネルが被って要素が「visible待ち」で固まるので、送信系は先に `#osnav button[data-scr="chat"]` を押してチャット表示に切り替える。

## 16. このセッションで追加した機能（設計書の細部を本実装）
「側(ガワ)はできた、細部をちゃんと本実装」フェーズで、以下を実装・本番反映済み（すべて `/os`）:
1. **役割別APIキー + 作業AI 1/2/3 の個別モデル**（技術第4-5章/実装第14章）: `os_role_keys`・worker1/2/3 スロット・`resolveRoleCall`/`resolveWorkerCall`（役割キー→共有キー→env）。空欄なら共有キーに落ちる非破壊。
2. **ファイル/写真の追加**（実装第3章）: `os_files`（D1にbase64・R2不使用）。📎添付+📎ファイルタブ。画像はブラウザ側で1600px/JPEGに縮小。上限≈525KB。
3. **メッセージの編集(自分の発言のみ・非破壊) + コピー(全メッセージ)**: `PATCH /os/messages/:id`（role='user'かつ本人のみ）。
4. **承認パイプラインの本実装**: 却下事項の記録（`reject_reason`・決定画面「却下」タブ）/ メンター確認ステップ（`mentor_note`・propose予算2）/ 記録官の候補内容を構造化（【決定】【理由】【影響範囲】）。
5. **Groq / Cerebras プロバイダ追加**: OpenAI互換。役割ごとに無料枠を分散して制限回避。
6. **作業AIの相談必須事項**（運用第7章）+ **プロジェクト開始フロー**（運用第3章）: org.ts のプロンプト強化。
- **意図的に見送り中**（コスト/ノイズ増で要ユーザー判断）: 節目レポートの自動化 / 監視官の監査拡張（法律・規約・品質・セキュリティ）。やるならオン/オフ設定つきで。
