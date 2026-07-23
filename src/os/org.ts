// AI組織 — 各役割の人格(システムプロンプト)とターン実行。
// 憲法 v3.0 / 運用設計書 v2.0 から人格を生成する。Phase 1 はメンター兼司令塔のみ。
// 監視官・記録官・作業AI は Phase 2-3 でここに追加する。

import { callLLM, type ChatMsg, type LlmResult, type LlmSecrets, type RoleModel } from "./provider";

// メンター兼司令塔のシステムプロンプト。憲法第2章(10のRule)・第5章、運用第5章に準拠。
export const MENTOR_SYSTEM = `あなたはユーザー専用の意思決定支援システム「AI意思決定OS」のメンター兼司令塔です。
以下の憲法に厳密に従って振る舞ってください。

# あなたの立場
- ユーザーの部下でも上司でもなく、対等な「共同創業者」として議論する。
- YESマンにならない。無批判な同調は禁止。あなたの役目はユーザーの意思決定の質を上げること。

# 反対権(重要)
- 根拠(データ・論理)がある限り、ユーザーの案にも徹底的に反対してよい。反対理由は必ず説明する。
- ただし次の場合は直ちに前言を撤回する: (a)根拠が崩れたとき (b)ユーザーがより上位の前提を示したとき。
- 反対すること自体を目的にしない。ユーザーの案が論理的で妥当なら、速やかに賛同する。無意味な反論で議論や実行を引き延ばさない。

# 事実と意見の分離
- 事実(確認済み)と、あなたの意見・推測を必ず区別して述べる。

# 会話スタイル
- LINE・DMのように短文中心。1メッセージ1論点。ダラダラ書かない。
- ただし次のときだけ長文可: 設計書・仕様書・最終報告・要件定義・決定事項まとめ・引き継ぎ資料・異議申し立てとその根拠説明。

# 実行優先
- 「考えるだけ」を禁止し、実行を優先する。議論→結論→実行→検証→改善のサイクルで前に進める。
- 無限議論・無限調査・結論の先送りをしない。次の一手を具体的に示す。

# プロジェクトの立ち上げ(運用第3章)
- 新しい相談や目的がまだ曖昧なときは、いきなり細部に入らず、まず ①目的(何を達成したいか) ②現状 ③ゴール(どうなれば成功か) を短いやり取りで確定してから進める。
- ただし尋問はしない。1メッセージ1問まで。目的が既に明確なら確認は最小限にして、すぐ実行に移る。

# 目的の維持
- 目的から逸脱しない。話が逸れたら本題に戻す。同じ議論を繰り返さない。

# 最終決定権
- 最終決定権はユーザーにある。あなたは決めない。
- ユーザーが最終判断を宣言したら、議論をやめて実行(執行)プロセスに移る。

日本語で、共同創業者らしく率直に話してください。`;

export const ROLE_LABELS: Record<string, string> = {
  user: "あなた",
  mentor: "メンター",
  monitor: "特命監視官",
  recorder: "記録官",
  worker: "作業AI",
  system: "システム",
};

export interface StoredMsg {
  role: string;
  name: string;
  content: string;
}

// 保存済みメッセージ列 → LLM に渡す会話履歴 (user/assistant の2値に畳む)。
// メンターの発言=assistant、それ以外(ユーザー・他役割)=user 扱いにし、他役割は名前を前置する。
// 監視官(monitor)は独立監査ラインでデータフローを中継しないため、LLM文脈からは除外する。
function toHistory(msgs: StoredMsg[]): ChatMsg[] {
  return msgs
    .filter((m) => m.role !== "system" && m.role !== "monitor")
    .map((m) => {
      if (m.role === "mentor") return { role: "assistant", content: m.content } as ChatMsg;
      const label = m.role === "user" ? "" : `[${m.name || ROLE_LABELS[m.role] || m.role}] `;
      return { role: "user", content: `${label}${m.content}` } as ChatMsg;
    });
}

// メンターの1ターン。会話履歴を渡すとメンターの応答を返す。
export async function runMentorTurn(msgs: StoredMsg[], rm: RoleModel, secrets: LlmSecrets): Promise<LlmResult> {
  return callLLM(MENTOR_SYSTEM, toHistory(msgs), rm, secrets);
}

// ── 記録官 ──────────────────────────────────────────────
// 運用設計書 第8章: 結論が出た内容のみを保存候補化する。人間向け要約 + AI復元用データを必ず含む。
// 保存はユーザーの明示的承認を経てから(無承認保存禁止)。ここでは「候補」を作るだけ。

export interface Candidate {
  kind: string; // decision / note / memory
  title: string;
  content: string;
  tags: string;
  summary: string; // 人間向けの短い要約(サマリー無し提示は禁止)
  supersedes_id: number | null; // 既存の決定を更新する場合、その決定ID
}

export interface ProposeResult {
  save: boolean;
  candidate: Candidate | null;
  stub: boolean;
}

export interface ActiveDecision {
  id: number;
  title: string;
}

export const RECORDER_SYSTEM = `あなたは「AI意思決定OS」の記録官です。会話から保存すべき結論を最大1件だけ抽出します。
- 保存対象は「結論が出た決定・確定した仕様・確定ルール」のみ。議論の途中経過・雑談・未確定の案は保存しない。
- content は憲法第7章に従い、次の項目を含めて構造化する(該当が無い項目は省略可):【決定】結論の内容 /【理由・採用理由】なぜそれを選んだか /【影響範囲】何に影響するか /【関連】関連する決定や前提。
- 必ず次のJSONだけを出力する(前後に説明文を付けない。改行は \\n でエスケープする):
{"save": true, "kind": "decision", "title": "結論を一文で", "content": "【決定】…\\n【理由・採用理由】…\\n【影響範囲】…", "tags": "カンマ区切りの短いタグ", "summary": "人間向けの短い要約", "supersedes_id": null}
- 保存に値する確定した結論がなければ {"save": false} だけを返す。
- 現在有効な決定(Active)の一覧を渡す。新しい結論が明らかにそのどれかを更新・変更する内容なら、supersedes_id にそのIDを入れる(そうでなければ null)。`;

// メンターによる保存候補の整合性チェック(運用第8章: 記録官→メンター確認→ユーザー承認)。
// ユーザーが承認する前に、現行の決定との矛盾や内容の妥当性を短く確認する。
export const CANDIDATE_REVIEW_SYSTEM = `あなたは「AI意思決定OS」のメンター兼司令塔です。記録官が作った保存候補を、ユーザーが承認する前に整合性チェックします。
- 現在有効な決定(Active)と矛盾しないか、内容が妥当かを確認する。
- 出力は日本語1〜2文のみ(JSONやマークダウンにしない)。問題なければ「✅ 既存の決定と整合。承認して問題ありません。」、懸念があれば「⚠ 決定「〇〇」と矛盾の可能性: …」のように、対象を具体的に、簡潔に。`;

// 候補をメンターがレビューして所見(1〜2文)を返す。
export async function runCandidateReview(
  candidate: { title: string; content: string },
  active: ActiveDecision[],
  rm: RoleModel,
  secrets: LlmSecrets
): Promise<LlmResult> {
  const system = `${CANDIDATE_REVIEW_SYSTEM}\n\n${activeDecisionsText(active)}`;
  const input: ChatMsg[] = [
    { role: "user", content: `保存候補:\nタイトル: ${candidate.title}\n内容: ${candidate.content}\n\nこの候補を整合性チェックしてください。` },
  ];
  const res = await callLLM(system, input, rm, secrets);
  if (res.stub) return { text: "(メンター確認スタブ) 既存の決定との明らかな矛盾は検出されませんでした。", stub: true };
  return res;
}

function activeDecisionsText(active: ActiveDecision[]): string {
  if (!active.length) return "現在有効な決定(Active): なし";
  return "現在有効な決定(Active):\n" + active.map((d) => `- [ID ${d.id}] ${d.title}`).join("\n");
}

function transcript(msgs: StoredMsg[]): string {
  return msgs
    .filter((m) => m.role !== "system" && m.role !== "monitor")
    .map((m) => `${m.role === "user" ? "ユーザー" : ROLE_LABELS[m.role] || m.role}: ${m.content}`)
    .join("\n");
}

// LLM 出力から最初の JSON ブロックを取り出して候補に整形。壊れていたら null。
function parseCandidate(text: string): Candidate | null {
  try {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    if (!o || o.save === false) return null;
    const title = String(o.title ?? "").trim();
    const content = String(o.content ?? "").trim();
    if (!title && !content) return null;
    const kind = typeof o.kind === "string" && ["decision", "note", "memory"].includes(o.kind) ? o.kind : "decision";
    const sup = Number(o.supersedes_id);
    return {
      kind,
      title: title.slice(0, 200),
      content: (content || title).slice(0, 5000),
      tags: String(o.tags ?? "").slice(0, 200),
      summary: String(o.summary ?? title).slice(0, 300),
      supersedes_id: Number.isInteger(sup) && sup > 0 ? sup : null,
    };
  } catch {
    return null;
  }
}

// キー未設定時: 直近のユーザー発言から素朴な候補を作る(承認フローをキー無しでも試せるように)。
function stubCandidate(msgs: StoredMsg[]): Candidate | null {
  const lastUser = [...msgs].reverse().find((m) => m.role === "user");
  if (!lastUser) return null;
  const t = lastUser.content.replace(/\s+/g, " ").trim();
  if (!t) return null;
  return { kind: "decision", title: t.slice(0, 40), content: t.slice(0, 2000), tags: "", summary: "(スタブ生成) " + t.slice(0, 60), supersedes_id: null };
}

// 会話から保存候補を1件生成する(記録官)。保存はまだしない — 承認待ちの候補を返すだけ。
export async function runRecorderTurn(
  msgs: StoredMsg[],
  active: ActiveDecision[],
  rm: RoleModel,
  secrets: LlmSecrets
): Promise<ProposeResult> {
  const system = `${RECORDER_SYSTEM}\n\n${activeDecisionsText(active)}`;
  const input: ChatMsg[] = [{ role: "user", content: `次の会話から保存候補を抽出してください:\n\n${transcript(msgs)}` }];
  const res = await callLLM(system, input, rm, secrets);
  if (res.stub) {
    const c = stubCandidate(msgs);
    return { save: !!c, candidate: c, stub: true };
  }
  const c = parseCandidate(res.text);
  return { save: !!c, candidate: c, stub: false };
}

// ── 特命監視官 ──────────────────────────────────────────
// 憲法第7章/運用第6章: ループ・話題逸脱・矛盾・離脱傾向・非効率、法律・利用規約・品質・
// セキュリティを常時監査し、問題があれば警告する(決定も指示もしない・独立監査・非中継)。
// 頻度は絞らないが「的外れ(無関係)」は禁止。確度の高い・関連する指摘だけを出す。

export type WarningType =
  | "deviation"
  | "loop"
  | "contradiction"
  | "inefficiency"
  | "legal"
  | "tos"
  | "quality"
  | "security";
export interface Warning {
  type: WarningType;
  message: string;
}

export const MONITOR_SYSTEM = `あなたは「AI意思決定OS」の特命監視官です。会話を横から常時監査し、問題があれば警告します。決定も指示もしません(警告のみ・独立監査・非中継)。

最重要ルール(的外れ禁止): 警告は「今この会話で実際に起きている、関連する問題」だけにする。無関係な過去の別トピックや別プロジェクトの話を引っ張り出さない。関係が薄い・確信が持てないものは出さない。頻度は絞らなくてよい(関連する問題が複数あれば複数出してよい)が、的外れは1件でも許されない。的外れを出すくらいなら空にする。

監査タイプ(憲法第7章/運用第6章。該当が明確なものだけ):
- deviation: 今の議題から明らかに逸脱している
- loop: 結論の出ない同じ議論を明確に繰り返している
- contradiction: 今の発言が、現行の決定と【完全に同じ対象】について正反対。対象・テーマが一致しない決定を引き合いに出さない(例:「収益化」の決定に「趣味AIを作る」は対象違い→矛盾にしない)
- inefficiency: 明らかに非効率(堂々巡り・過剰調査・実行の先送り)
- legal: 法的リスクがありそう(著作権・契約・法令違反の可能性)
- tos: 使おうとしているサービスの利用規約に反しそう
- quality: 成果物・決定の品質/完成度に見逃せない欠陥がある
- security: セキュリティ・個人情報・秘密情報の扱いに危険がある

必ず次のJSON配列だけを出力する(前後に説明文を付けない):
[{"type":"security","message":"簡潔で具体的な警告文。何がなぜ問題かを対象に触れて書く"}]
問題がなければ [] を返す。多くても3件。`;

const NEGATION = ["やめ", "中止", "変更", "じゃない", "ではない", "違う", "無し", "なし", "取りやめ", "撤回", "やっぱり"];

function parseWarnings(text: string): Warning[] {
  try {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    const valid: WarningType[] = ["deviation", "loop", "contradiction", "inefficiency", "legal", "tos", "quality", "security"];
    return arr
      .map((o) => {
        const type = (o as { type?: unknown }).type;
        const message = (o as { message?: unknown }).message;
        return { type: type as WarningType, message: String(message ?? "").trim().slice(0, 300) };
      })
      .filter((w) => valid.includes(w.type) && w.message)
      .slice(0, 3);
  } catch {
    return [];
  }
}

// 内容語(カタカナ・漢字・英数)の2文字グラム集合。日本語は単語区切りが無いため、
// 助詞などのひらがなを除いた文字bigramの重なりで「同じ話題か」を粗く判定する。
function contentBigrams(s: string): Set<string> {
  const cleaned = s.replace(/[^゠-ヿ一-鿿ｦ-ﾟa-zA-Z0-9]+/g, " ");
  const grams = new Set<string>();
  for (const w of cleaned.split(/\s+/)) {
    if (w.length >= 2) for (let i = 0; i + 2 <= w.length; i++) grams.add(w.slice(i, i + 2));
  }
  return grams;
}

// キー未設定時の簡易監査(確定的なヒューリスティック)。あくまで動作確認用の割り切り。
function stubWarnings(msgs: StoredMsg[], active: ActiveDecision[]): Warning[] {
  const users = msgs.filter((m) => m.role === "user").map((m) => m.content.replace(/\s+/g, " ").trim());
  if (!users.length) return [];
  const last = users[users.length - 1];
  const out: Warning[] = [];
  // ループ: 直近の発言が過去の発言と同一
  if (users.slice(0, -1).some((u) => u === last)) {
    out.push({ type: "loop", message: "同じ内容の発言が繰り返されています。結論に進めましょう。" });
  }
  // 矛盾: 現行の決定と話題が重なりつつ否定語がある
  if (NEGATION.some((n) => last.includes(n))) {
    const lastGrams = contentBigrams(last);
    for (const d of active) {
      const tg = contentBigrams(d.title);
      let shared = 0;
      for (const g of tg) if (lastGrams.has(g)) shared++;
      if (shared >= 1) {
        out.push({ type: "contradiction", message: `現在有効な決定「${d.title}」と矛盾する可能性があります。変更するなら承認フローで更新してください。` });
        break;
      }
    }
  }
  return out.slice(0, 2);
}

// 監視官の1監査。警告(0〜2件)を返す。問題なければ空配列(沈黙)。
export async function runMonitorTurn(
  msgs: StoredMsg[],
  active: ActiveDecision[],
  rm: RoleModel,
  secrets: LlmSecrets
): Promise<Warning[]> {
  const system = `${MONITOR_SYSTEM}\n\n${activeDecisionsText(active)}`;
  const input: ChatMsg[] = [{ role: "user", content: `次の会話を監査してください:\n\n${transcript(msgs)}` }];
  const res = await callLLM(system, input, rm, secrets);
  if (res.stub) return stubWarnings(msgs, active);
  return parseWarnings(res.text);
}

export const WARNING_LABEL: Record<WarningType, string> = {
  deviation: "話題逸脱",
  loop: "ループ",
  contradiction: "矛盾",
  inefficiency: "非効率",
  legal: "法律",
  tos: "利用規約",
  quality: "品質",
  security: "セキュリティ",
};

// 監視官の節目レポート(運用第6章)。議題・未解決事項・決定事項・警告回数をまとめる。
export const REPORT_SYSTEM = `あなたは「AI意思決定OS」の特命監視官です。会話の節目のレポートを作成します。
次の見出しで簡潔にまとめてください(各1〜3行、事実ベース。決定も指示もしない):
【現在の議題】
【未解決の論点】
【確定した決定事項】
【逸脱・ループの傾向】
過度に長くしない。分からない項目は「特になし」と書く。`;

export interface ReportCounts {
  deviation: number;
  loop: number;
}

export async function runMonitorReport(
  msgs: StoredMsg[],
  active: ActiveDecision[],
  counts: ReportCounts,
  rm: RoleModel,
  secrets: LlmSecrets
): Promise<LlmResult> {
  const system = `${REPORT_SYSTEM}\n\n${activeDecisionsText(active)}\n\nこれまでの警告回数: 話題逸脱 ${counts.deviation}回 / ループ ${counts.loop}回`;
  const input: ChatMsg[] = [{ role: "user", content: `次の会話の節目レポートを作成してください:\n\n${transcript(msgs)}` }];
  const res = await callLLM(system, input, rm, secrets);
  if (res.stub) {
    const lastUser = [...msgs].reverse().find((m) => m.role === "user");
    const text =
      `【現在の議題】${lastUser ? lastUser.content.slice(0, 40) : "特になし"}\n` +
      `【未解決の論点】(スタブ) LLM接続後に自動要約されます\n` +
      `【確定した決定事項】${active.length ? active.map((d) => d.title).slice(0, 3).join(" / ") : "特になし"}\n` +
      `【逸脱・ループの傾向】話題逸脱 ${counts.deviation}回 / ループ ${counts.loop}回`;
    return { text, stub: true };
  }
  return res;
}

// ── 作業AI群 ────────────────────────────────────────────
// 憲法第9章/運用第7章: 実行部隊。作業AI同士で議論し結論に収束。成果物は直接ユーザーに
// 出さず、メンターが検証・整理してから提示する。ループ防止のためターン数は固定で上限する。

export const WORKER_SYSTEM = `あなたは「AI意思決定OS」の作業AIです。実行部隊として、与えられたタスクを具体的に遂行します。
- 技術的判断・調査・分析・実装方針・改善提案を、根拠とともに具体的に示す。
- 成果物はユーザーに直接出さない。メンターが検証・整理する前提で、要点を明確にまとめる。
- 冗長にしない。実行可能な結論に収束させる。
- 相談必須事項(運用第7章): 次は作業AIだけで決めてはならない。該当したら決めずに「⚠ これはメンター/ユーザーの判断が必要です:(理由)」と明記して差し戻す — プロジェクト目的の変更 / 方針の変更 / 優先順位の変更 / 保存済み決定事項の変更 / 重要仕様の変更。`;

export interface WorkerLogItem {
  role: string;
  name: string;
  content: string;
}
export interface WorkerResult {
  log: WorkerLogItem[];
  deliverable: string;
  stub: boolean;
}

// 作業AI 1体分の {モデル, キー}。役割別に別モデル・別APIキーを割り当てられる(実装準備第14章)。
export interface WorkerAgent {
  rm: RoleModel;
  secrets: LlmSecrets;
}

// 作業AIの協働: 作業AI-1が草案 → 作業AI-2がレビュー → 作業AI-3が最終化。
// 固定3ターンで必ず収束させる(無限ループ防止 = 運用第7章/技術第6章)。
// agents[0..2] = 作業AI 1/2/3。個別設定が無ければ同一エージェントに畳まれ、従来どおり動く。
export async function runWorkerTask(task: string, context: string, agents: WorkerAgent[]): Promise<WorkerResult> {
  const base = `${WORKER_SYSTEM}\n\n# 背景(会話の要約)\n${context || "(なし)"}\n\n# タスク\n${task}`;
  const log: WorkerLogItem[] = [];
  let stub = false;
  const a = agents[0];
  const b = agents[1] ?? a;
  const c = agents[2] ?? a;

  const a1 = await callLLM(`${base}\n\nあなたは作業AI-1。まずタスクの草案(方針と具体策)を作成してください。`, [{ role: "user", content: "草案を作成してください。" }], a.rm, a.secrets);
  stub = stub || a1.stub;
  log.push({ role: "worker", name: "作業AI-1", content: a1.text });

  const b1 = await callLLM(`${base}\n\nあなたは作業AI-2。作業AI-1の草案を批判的にレビューし、抜け・リスク・改善点を指摘してください。`, [{ role: "user", content: `作業AI-1の草案:\n${a1.text}\n\nレビューしてください。` }], b.rm, b.secrets);
  stub = stub || b1.stub;
  log.push({ role: "worker", name: "作業AI-2", content: b1.text });

  const a2 = await callLLM(`${base}\n\nあなたは作業AI-3。作業AI-1の草案と作業AI-2のレビューを踏まえて、最終成果物をまとめてください。`, [{ role: "user", content: `作業AI-1の草案:\n${a1.text}\n\n作業AI-2のレビュー:\n${b1.text}\n\n最終成果物をまとめてください。` }], c.rm, c.secrets);
  stub = stub || a2.stub;
  log.push({ role: "worker", name: "作業AI-3(最終)", content: a2.text });

  return { log, deliverable: a2.text, stub };
}

// メンターが作業AIの成果物を検証・整理してユーザー向けに提示する(成果物はメンター経由)。
export async function runMentorConsolidation(task: string, deliverable: string, rm: RoleModel, secrets: LlmSecrets): Promise<LlmResult> {
  const sys = `${MENTOR_SYSTEM}\n\nあなたは作業AIから成果物を受け取りました。共同創業者として成果物を検証し、要点を整理してユーザーに提示してください。不足やリスクがあれば率直に指摘してください。`;
  return callLLM(sys, [{ role: "user", content: `タスク: ${task}\n\n作業AIの成果物:\n${deliverable}\n\nこれを検証・整理して、ユーザーに提示してください。` }], rm, secrets);
}
