// LLM プロバイダ抽象 — 役割ごとに別モデル(別ベンダー)を使えるようにする。
// 技術設計書 第4-5章「AIモデルは役割ごとに変更可能」「初期状態では全役割に同一モデル」。
//
// APIキーは Cloudflare の Secret (env) から読む。チャットにキーを貼らせない。
//   npx wrangler secret put ANTHROPIC_API_KEY   (メンター等を Claude で動かす)
//   npx wrangler secret put OPENAI_API_KEY
//   npx wrangler secret put GEMINI_API_KEY
// キーが無い役割はスタブ応答を返す → キー未設定でもUI・保存フローは全部テストできる。

// groq / cerebras は OpenAI 互換API。無料枠が各社独立なので、役割ごとに散らすと合計枠が増える。
export type Provider = "anthropic" | "openai" | "gemini" | "groq" | "cerebras";

export interface LlmSecrets {
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  GROQ_API_KEY?: string;
  CEREBRAS_API_KEY?: string;
}

// OpenAI 互換プロバイダのベースURL(この3つは同じ呼び出しコードを共用する)。
const OPENAI_COMPAT_BASE: Partial<Record<Provider, string>> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  cerebras: "https://api.cerebras.ai/v1",
};

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
  groq: "llama-3.3-70b-versatile",
  cerebras: "llama-3.3-70b",
};

// モデル名の妥当性チェック用の族(プロバイダ切替時の残骸を弾く)。
const MODEL_FAMILY: Record<Provider, RegExp> = {
  anthropic: /^claude/i,
  openai: /^(gpt|o\d|chatgpt)/i,
  gemini: /^(gemini|gemma|learnlm)/i,
  groq: /^(llama|qwen|gemma|mixtral|deepseek|gpt-oss|kimi|moonshot|allam)/i,
  cerebras: /^(llama|qwen|deepseek|gpt-oss)/i,
};

// キーの格納フィールド(provider → LlmSecrets のキー)。
const KEY_FIELD: Record<Provider, keyof LlmSecrets> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
};

// Gemini はモデルごとに無料枠の割当が変わる(古いモデルは枠ゼロで即429)。
// 404/429 のときはこの順で自動フォールバックする。-latest エイリアスは常に現行版を指す。
const GEMINI_FALLBACKS = ["gemini-flash-latest", "gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"];

// モデル名の自己修復。プロバイダを切り替えたのに旧プロバイダのモデル名が残っている、
// プロジェクトIDを貼ってしまった等の設定ミスは、そのプロバイダの既定モデルに戻す。
export function resolveModel(provider: Provider, model: string): string {
  const m = (model || "").trim().replace(/^models\//, "");
  const family = MODEL_FAMILY[provider] || /.*/;
  return m && family.test(m) ? m : DEFAULT_MODELS[provider];
}

export function keyFor(p: Provider, s: LlmSecrets): string | undefined {
  return s[KEY_FIELD[p]];
}

// 少なくとも1つでもキーが設定されているか (UI に「LLM未接続」を出すため)
export function anyKeyPresent(s: LlmSecrets): boolean {
  return Object.values(KEY_FIELD).some((f) => s[f]);
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
      : rm.provider === "gemini"
        ? callGemini(system, history, m, key)
        : callOpenAICompat(system, history, m, key, rm.provider); // openai / groq / cerebras は共通
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
  // openai / groq / cerebras … OpenAI互換の GET /models
  const base = OPENAI_COMPAT_BASE[p] || OPENAI_COMPAT_BASE.openai!;
  const res = await fetch(`${base}/models`, {
    headers: { authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`${p} ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ id?: string }> };
  const ids = (data.data ?? []).map((m) => m.id ?? "").filter(Boolean);
  // openai だけ gpt系に絞る。groq/cerebras は候補が少ないので全部返す(埋め込み等だけ除外)
  const filtered = p === "openai" ? ids.filter((n) => /^(gpt|o\d|chatgpt)/.test(n)) : ids;
  return filtered.filter((n) => !/embedding|audio|tts|whisper|image|dall|guard|prompt-guard/i.test(n)).sort().reverse();
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

// OpenAI 互換API (openai / groq / cerebras 共通)。ベースURLとエラー表示名だけプロバイダで変える。
async function callOpenAICompat(system: string, history: ChatMsg[], model: string, key: string, provider: Provider): Promise<string> {
  const base = OPENAI_COMPAT_BASE[provider] || OPENAI_COMPAT_BASE.openai!;
  const messages = [{ role: "system", content: system }, ...history.filter((m) => m.role !== "system")];
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, max_tokens: 1024, messages }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}: ${(await res.text()).slice(0, 200)}`);
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
