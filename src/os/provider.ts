// LLM プロバイダ抽象 — 役割ごとに別モデル(別ベンダー)を使えるようにする。
// 技術設計書 第4-5章「AIモデルは役割ごとに変更可能」「初期状態では全役割に同一モデル」。
//
// APIキーは Cloudflare の Secret (env) から読む。チャットにキーを貼らせない。
//   npx wrangler secret put ANTHROPIC_API_KEY   (メンター等を Claude で動かす)
//   npx wrangler secret put OPENAI_API_KEY
//   npx wrangler secret put GEMINI_API_KEY
// キーが無い役割はスタブ応答を返す → キー未設定でもUI・保存フローは全部テストできる。

export type Provider = "anthropic" | "openai" | "gemini";

export interface LlmSecrets {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

export interface RoleModel {
  provider: Provider;
  model: string;
}

export interface ChatMsg {
  role: "system" | "user" | "assistant";
  content: string;
}

// 役割ごとの既定モデル。設定画面(Phase 3)で上書きするまではこれを使う。
export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  gemini: "gemini-1.5-pro",
};

function keyFor(p: Provider, s: LlmSecrets): string | undefined {
  return p === "anthropic" ? s.ANTHROPIC_API_KEY : p === "openai" ? s.OPENAI_API_KEY : s.GEMINI_API_KEY;
}

// 少なくとも1つでもキーが設定されているか (UI に「LLM未接続」を出すため)
export function anyKeyPresent(s: LlmSecrets): boolean {
  return !!(s.ANTHROPIC_API_KEY || s.OPENAI_API_KEY || s.GEMINI_API_KEY);
}

export interface LlmResult {
  text: string;
  stub: boolean; // キー未設定でスタブ応答を返した場合 true
}

// system + 会話履歴を渡すと応答テキストを返す。ベンダー差はここで吸収する。
export async function callLLM(
  system: string,
  history: ChatMsg[],
  rm: RoleModel,
  secrets: LlmSecrets
): Promise<LlmResult> {
  const key = keyFor(rm.provider, secrets);
  if (!key) return { text: stubReply(history), stub: true };
  const model = rm.model || DEFAULT_MODELS[rm.provider];
  try {
    const text =
      rm.provider === "anthropic"
        ? await callAnthropic(system, history, model, key)
        : rm.provider === "openai"
          ? await callOpenAI(system, history, model, key)
          : await callGemini(system, history, model, key);
    return { text: text.trim() || "(空の応答)", stub: false };
  } catch (e) {
    return { text: `⚠ LLM 呼び出しに失敗しました: ${e instanceof Error ? e.message : String(e)}`, stub: false };
  }
}

// キー未設定時の暫定応答。役割は動いているがモデル未接続、と分かる文面にする。
function stubReply(history: ChatMsg[]): string {
  const last = [...history].reverse().find((m) => m.role === "user");
  const q = last ? last.content.slice(0, 60) : "";
  return `(メンター・スタブ応答) まだ LLM の API キーが接続されていません。設定で ANTHROPIC_API_KEY などを登録すると、ここに実際の思考が入ります。\n受け取った論点: ${q || "(なし)"}`;
}

async function callAnthropic(system: string, history: ChatMsg[], model: string, key: string): Promise<string> {
  const messages = history
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 1024, system, messages }),
  });
  if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  return (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
}

async function callOpenAI(system: string, history: ChatMsg[], model: string, key: string): Promise<string> {
  const messages = [{ role: "system", content: system }, ...history.filter((m) => m.role !== "system")];
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 1024, messages }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(system: string, history: ChatMsg[], model: string, key: string): Promise<string> {
  const contents = history
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
    }
  );
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}
