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
- 必ず次のJSONだけを出力する(前後に説明文を付けない):
{"save": true, "kind": "decision", "title": "結論を一文で", "content": "決定の内容・理由・影響範囲", "tags": "カンマ区切りの短いタグ", "summary": "人間向けの短い要約", "supersedes_id": null}
- 保存に値する確定した結論がなければ {"save": false} だけを返す。
- 現在有効な決定(Active)の一覧を渡す。新しい結論が明らかにそのどれかを更新・変更する内容なら、supersedes_id にそのIDを入れる(そうでなければ null)。`;

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
// 運用第6章: 話題逸脱・無限ループ・矛盾・離脱傾向を監査し、問題があるときだけ警告する。
// 決定も指示もしない(警告のみ)。過剰警告は禁止。通常は沈黙(空配列)。

export type WarningType = "deviation" | "loop" | "contradiction" | "drift";
export interface Warning {
  type: WarningType;
  message: string;
}

export const MONITOR_SYSTEM = `あなたは「AI意思決定OS」の特命監視官です。会話を横から監査し、問題があるときだけ警告します。決定も指示もしません(警告のみ)。
警告タイプ:
- deviation: 議題・目的から話が明らかに逸れている
- loop: 同じ議論を繰り返している / 結論が出ず堂々巡りしている
- contradiction: 現在有効な決定(Active)と矛盾する発言・結論がある
- drift: プロジェクトの当初目的から徐々に離れる傾向がある
必ず次のJSON配列だけを出力する(前後に説明文を付けない):
[{"type":"contradiction","message":"簡潔な警告文。矛盾なら該当する決定に触れる"}]
問題がなければ [] を返す。確度が高いものだけを、多くても2件まで。過剰に警告しない。`;

const NEGATION = ["やめ", "中止", "変更", "じゃない", "ではない", "違う", "無し", "なし", "取りやめ", "撤回", "やっぱり"];

function parseWarnings(text: string): Warning[] {
  try {
    const m = text.match(/\[[\s\S]*\]/);
    if (!m) return [];
    const arr = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(arr)) return [];
    const valid: WarningType[] = ["deviation", "loop", "contradiction", "drift"];
    return arr
      .map((o) => {
        const type = (o as { type?: unknown }).type;
        const message = (o as { message?: unknown }).message;
        return { type: type as WarningType, message: String(message ?? "").trim().slice(0, 300) };
      })
      .filter((w) => valid.includes(w.type) && w.message)
      .slice(0, 2);
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
  drift: "目的離脱",
};
