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
function toHistory(msgs: StoredMsg[]): ChatMsg[] {
  return msgs
    .filter((m) => m.role !== "system")
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
