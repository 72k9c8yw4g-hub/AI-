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

// 役割ごとの既定モデル。設定画面で上書きするまではこれを使う。
export const DEFAULT_MODELS: Record<Provider, string> = {
  anthropic: "claude-sonnet-4-20250514",
  openai: "gpt-4o",
  gemini: "gemini-2.5-flash",
};

// Gemini はモデルごとに無料枠の割当が変わる(古いモデルは枠ゼロで即429)。
// 404/429 のときはこの順で自動フォールバックする。-latest エイリアスは常に現行版を指す。
const GEMINI_FALLBACKS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

// モデル名の自己修復。プロバイダを切り替えたのに旧プロバイダのモデル名が残っている、
// プロジェクトIDを貼ってしまった等の設定ミスは、そのプロバイダの既定モデルに戻す。
export function resolveModel(provider: Provider, model: string): string {
  const m = (model || "").trim().replace(/^models\//, "");
  const family =
    provider === "anthropic" ? /^claude/i : provider === "openai" ? /^(gpt|o\d|chatgpt)/i : /^(gemini|gemma|learnlm)/i;
  return m && family.test(m) ? m : DEFAULT_MODELS[provider];
}

export function keyFor(p: Provider, s: LlmSecrets): string | undefined {
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
  const invoke = (m: string) =>
    rm.provider === "anthropic"
      ? callAnthropic(system, history, m, key)
      : rm.provider === "openai"
        ? callOpenAI(system, history, m, key)
        : callGemini(system, history, m, key);
  try {
    const text = await invoke(model);
    return { text: text.trim() || "(空の応答)", stub: false };
  } catch (e) {
    let msg = e instanceof Error ? e.message : String(e);
    // Gemini の 404(モデル消滅)/429(そのモデルの無料枠ゼロ・枯渇)は別モデルで自動再試行
    if (rm.provider === "gemini" && /gemini (404|429)/.test(msg)) {
      for (const fb of GEMINI_FALLBACKS.filter((m) => m !== model).slice(0, 2)) {
        try {
          const text = await invoke(fb);
          return { text: text.trim() || "(空の応答)", stub: false };
        } catch (e2) {
          msg = e2 instanceof Error ? e2.message : String(e2);
        }
      }
    }
    return { text: `⚠ LLM 呼び出しに失敗しました: ${msg.slice(0, 400)}${errorHint(msg)}`, stub: false };
  }
}

// エラーコード別の日本語ヒント(利用者が次に何をすればいいか)
function errorHint(msg: string): string {
  if (/\b429\b/.test(msg))
    return "\n\n💡 無料枠の上限に達したか、このモデルに無料枠がありません。⚙️設定でモデル候補から別のモデル(例: gemini-2.5-flash-lite)を選ぶか、時間をおいて再試行してください。";
  if (/\b404\b/.test(msg)) return "\n\n💡 このモデル名は現行APIに存在しません。⚙️設定のモデル欄で候補から選んでください。";
  if (/\b(401|403)\b|API key not valid|invalid x-api-key/i.test(msg))
    return "\n\n💡 APIキーが無効です。⚙️設定でキーを貼り直してください。";
  return "";
}

// キー未設定時の暫定応答。役割は動いているがモデル未接続、と分かる文面にする。
function stubReply(history: ChatMsg[]): string {
  const last = [...history].reverse().find((m) => m.role === "user");
  const q = last ? last.content.slice(0, 60) : "";
  return `(スタブ応答) まだ LLM の API キーが接続されていません。設定で ANTHROPIC_API_KEY などを登録すると、ここに実際の思考が入ります。\n受け取った論点: ${q || "(なし)"}`;
}

// そのキーで実際に使えるモデル名一覧をプロバイダAPIから取得する(⚙️の候補表示用)。
// もうモデル名を人間が推測しなくていいようにするための機能。
export async function listProviderModels(p: Provider, key: string): Promise<string[]> {
  if (p === "gemini") {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=200`, {
      headers: { "x-goog-api-key": key },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = (await res.json()) as {
      models?: Array<{ name?: string; supportedGenerationMethods?: string[] }>;
    };
    return (data.models ?? [])
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter((n) => n && !/embedding|aqa|imagen|veo|tts|image/i.test(n))
      .sort()
      .reverse();
  }
  if (p === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}`);
    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    return (data.data ?? []).map((m) => m.id ?? "").filter(Boolean).sort().reverse();
  }
  const res = await fetch("https://api.openai.com/v1/models", {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`openai ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  return (data.data ?? [])
    .map((m) => m.id ?? "")
    .filter((n) => /^(gpt|o\d|chatgpt)/.test(n) && !/embedding|audio|tts|whisper|image|dall/i.test(n))
    .sort()
    .reverse();
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
    signal: AbortSignal.timeout(60_000),
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
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

async function callGemini(system: string, history: ChatMsg[], model: string, key: string): Promise<string> {
  const contents = history
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  // キーはURLクエリではなくヘッダで送る(URLはログに残りやすいため)
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  return (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("");
}
