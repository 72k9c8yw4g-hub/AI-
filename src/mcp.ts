// MCP (Model Context Protocol) サーバー実装
// Streamable HTTP のステートレス版: JSON-RPC 2.0 を POST で受けて application/json で返す。
// claude.ai の「コネクタ」/ Claude Code の remote MCP から接続できる。

import {
  saveMemory,
  searchAll,
  createTask,
  updateTask,
  listTasks,
  listProjects,
  getMemory,
  getTask,
  getConversationText,
  getOverview,
} from "./db";

const SUPPORTED_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const LATEST_VERSION = "2025-06-18";

const SERVER_INFO = {
  name: "dscribe",
  title: "Dscribe – Second Brain",
  version: "1.0.0",
};

const INSTRUCTIONS = `Dscribe はユーザーの「第二の脳」。全チャット共通の長期記憶・タスク・過去チャット履歴を保管している。
使い方の原則:
1. 新しい会話では、本題に入る前に recall_context を1回呼び、進行中のタスクと直近の記憶を把握する。
2. ユーザーが「前に話した」「この前の」「あの件」など過去の文脈に触れたら、推測せず search で検索する。
3. 会話中に重要な情報(決定事項・ユーザーの好み・進捗・新しい約束)が出たら、その場で save_memory / create_task に保存する。保存の許可を毎回求める必要はない。
4. タスクの完了や変更が話題に出たら update_task で反映する。
検索結果の [memory#12] [chat#3] などのIDは get_item で全文を取得できる。`;

// ---------- ツール定義 ----------

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (db: D1Database, userId: number, args: Record<string, unknown>) => Promise<string>;
}

const str = (desc: string) => ({ type: "string", description: desc });
const num = (desc: string) => ({ type: "number", description: desc });

function fmtTask(t: { id: number; title: string; status: string; priority: string; due_date: string | null; project: string | null; description?: string }): string {
  const mark = t.status === "done" ? "✅" : t.status === "doing" ? "🔄" : "⬜";
  const bits = [
    t.priority === "high" ? "優先度:高" : t.priority === "low" ? "優先度:低" : "",
    t.due_date ? `期限:${t.due_date}` : "",
    t.project ? `PJ:${t.project}` : "",
  ].filter(Boolean);
  return `${mark} [task#${t.id}] ${t.title}${bits.length ? `（${bits.join(", ")}）` : ""}`;
}

function fmtDate(d: string | null | undefined): string {
  return (d ?? "").slice(0, 16) || "日時不明";
}

const TOOLS: ToolDef[] = [
  {
    name: "recall_context",
    description:
      "【会話の最初に必ず1回呼ぶ】ユーザーの現在の状況(未完了タスク・最近保存された記憶・プロジェクト一覧・最近のチャット)をまとめて取得する。新しい会話で過去の文脈を引き継ぐための入口。project を指定するとそのプロジェクトに絞る。",
    inputSchema: {
      type: "object",
      properties: { project: str("プロジェクト名で絞り込み(省略可)") },
    },
    handler: async (db, userId, args) => {
      const ov = await getOverview(db, userId, typeof args.project === "string" && args.project.trim() ? args.project.trim() : undefined);
      const lines: string[] = [];
      lines.push(`# 🧠 Dscribe – 現在の状況${ov.projectFilter ? `(プロジェクト: ${ov.projectFilter})` : ""}`);
      lines.push(
        `保存済み: 記憶${ov.counts.memories}件 / タスク${ov.counts.all_tasks}件(未完了${ov.counts.open_tasks}) / 取込チャット${ov.counts.conversations}件`
      );
      lines.push("");
      lines.push(`## 未完了タスク (${ov.tasks.length})`);
      lines.push(ov.tasks.length ? ov.tasks.map(fmtTask).join("\n") : "(なし)");
      lines.push("");
      lines.push("## 最近の記憶(新しい順)");
      lines.push(
        ov.memories.length
          ? ov.memories
              .map(
                (m) =>
                  `- [memory#${m.id}] (${m.kind}${m.project ? `/${m.project}` : ""}) ${fmtDate(m.created_at)}: ${
                    (m.title ? `${m.title} — ` : "") + m.content.replace(/\s+/g, " ").slice(0, 120)
                  }`
              )
              .join("\n")
          : "(まだ記憶がありません。重要な情報が出たら save_memory で保存してください)"
      );
      if (ov.projects.length) {
        lines.push("");
        lines.push("## プロジェクト");
        lines.push(
          ov.projects
            .map((p) => `- ${p.name}(記憶${p.memory_count} / 未完了タスク${p.open_tasks} / チャット${p.conversation_count}）`)
            .join("\n")
        );
      }
      if (ov.recentConvs.length) {
        lines.push("");
        lines.push("## 最近のチャット履歴(取込済み)");
        lines.push(
          ov.recentConvs
            .map((c) => `- [chat#${c.id}] ${c.name || "(無題)"}（${c.message_count}msg, ${fmtDate(c.updated_at)}）`)
            .join("\n")
        );
      }
      lines.push("");
      lines.push("※過去の話題に触れられたら search で検索。IDの全文は get_item で取得。");
      return lines.join("\n");
    },
  },
  {
    name: "search",
    description:
      "第二の脳を横断検索する(保存された記憶・タスク・過去のClaudeチャット履歴の全文)。ユーザーが「前に話した」「この前決めた」「あのプロジェクトの件」など過去の文脈に言及したら、記憶にない場合は必ずこれで検索してから答えること。スペース区切りで複数キーワードのAND検索。",
    inputSchema: {
      type: "object",
      properties: {
        query: str("検索キーワード(スペース区切りでAND検索)"),
        types: {
          type: "array",
          items: { type: "string", enum: ["memories", "tasks", "chats"] },
          description: "検索対象の絞り込み(省略時は全て)",
        },
        project: str("プロジェクト名で絞り込み(省略可)"),
        limit: num("各カテゴリの最大件数(既定8)"),
      },
      required: ["query"],
    },
    handler: async (db, userId, args) => {
      const { results } = await searchAll(db, userId, args);
      const total = results.memories.length + results.tasks.length + results.chats.length;
      if (!total) return "該当なし。キーワードを変えるか、短い単語で再検索してください。";
      const lines: string[] = [`検索結果: ${total}件(全文は get_item で取得可能)`];
      if (results.memories.length) {
        lines.push("", "## 記憶");
        for (const h of results.memories)
          lines.push(`- [memory#${h.id}] ${h.title}(${h.extra} / ${fmtDate(h.date)})\n  ${h.snippet}`);
      }
      if (results.tasks.length) {
        lines.push("", "## タスク");
        for (const h of results.tasks) lines.push(`- [task#${h.id}] ${h.title}(${h.extra})\n  ${h.snippet}`);
      }
      if (results.chats.length) {
        lines.push("", "## 過去のチャット");
        for (const h of results.chats)
          lines.push(`- [chat#${h.id}] ${h.title}(${h.extra} / ${fmtDate(h.date)})\n  ${h.snippet}`);
      }
      return lines.join("\n");
    },
  },
  {
    name: "save_memory",
    description:
      "重要な情報を全チャット共通の長期記憶として保存する。会話中に出た決定事項・ユーザーの好みや状況・進捗・後で参照すべき情報は、ユーザーに許可を求めずその場で保存すること。kind: memory=一般的な記憶, decision=決定事項, note=まとまった知識/文書。",
    inputSchema: {
      type: "object",
      properties: {
        content: str("保存する内容(具体的に。後から検索で見つけられる書き方で)"),
        title: str("短いタイトル(省略可)"),
        kind: { type: "string", enum: ["memory", "decision", "note"], description: "記憶の種類(既定: memory)" },
        tags: { type: "array", items: { type: "string" }, description: "検索用タグ(省略可)" },
        project: str("関連プロジェクト名(省略可。なければ自動作成される)"),
      },
      required: ["content"],
    },
    handler: async (db, userId, args) => {
      const m = await saveMemory(db, userId, args);
      return `保存しました → [memory#${m.id}] (${m.kind}${m.project ? `/${m.project}` : ""}) ${m.title || m.content.slice(0, 60)}`;
    },
  },
  {
    name: "create_task",
    description:
      "新しいタスク(やること)を作成する。会話の中で「〜しないと」「今度〜する」「宿題」のような TODO が出てきたら提案・保存する。",
    inputSchema: {
      type: "object",
      properties: {
        title: str("タスク名"),
        description: str("詳細(省略可)"),
        due_date: str("期限 YYYY-MM-DD(省略可)"),
        priority: { type: "string", enum: ["high", "normal", "low"], description: "優先度(既定: normal)" },
        project: str("プロジェクト名(省略可)"),
      },
      required: ["title"],
    },
    handler: async (db, userId, args) => {
      const t = await createTask(db, userId, args);
      return `タスクを作成しました → ${fmtTask(t)}`;
    },
  },
  {
    name: "update_task",
    description:
      "既存タスクを更新する(完了にする・状態変更・タイトル/期限/優先度の変更)。「終わった」「もうやった」と言われたら status=done にする。id は list_tasks / search で確認できる。",
    inputSchema: {
      type: "object",
      properties: {
        id: num("タスクID"),
        status: { type: "string", enum: ["open", "doing", "done"], description: "状態" },
        title: str("新しいタスク名(省略可)"),
        description: str("新しい詳細(省略可)"),
        due_date: str("新しい期限 YYYY-MM-DD。空文字で期限削除(省略可)"),
        priority: { type: "string", enum: ["high", "normal", "low"], description: "優先度(省略可)" },
        project: str("プロジェクト名(省略可)"),
      },
      required: ["id"],
    },
    handler: async (db, userId, args) => {
      const t = await updateTask(db, userId, args);
      return `更新しました → ${fmtTask(t)}`;
    },
  },
  {
    name: "list_tasks",
    description: "タスク一覧を取得する。status: active(未完了のみ・既定) / open / doing / done / all。",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "open", "doing", "done", "all"], description: "絞り込み(既定: active)" },
        project: str("プロジェクト名で絞り込み(省略可)"),
      },
    },
    handler: async (db, userId, args) => {
      const tasks = await listTasks(db, userId, {
        status: typeof args.status === "string" ? args.status : undefined,
        project: typeof args.project === "string" && args.project.trim() ? args.project.trim() : undefined,
      });
      if (!tasks.length) return "タスクはありません。";
      return `タスク ${tasks.length}件:\n` + tasks.map(fmtTask).join("\n");
    },
  },
  {
    name: "get_item",
    description:
      "search / recall_context が返したIDの全文を取得する。type=chat は長い場合ページ分割される(続きは offset を指定)。",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["memory", "task", "chat"], description: "種類" },
        id: num("ID([memory#12] なら type=memory, id=12)"),
        offset: num("chat の続きを読む場合の開始位置(前回の nextOffset)"),
      },
      required: ["type", "id"],
    },
    handler: async (db, userId, args) => {
      const id = Number(args.id);
      if (!Number.isInteger(id) || id <= 0) throw new Error("id が不正です");
      if (args.type === "memory") {
        const m = await getMemory(db, userId, id);
        if (!m) return `memory#${id} は見つかりません`;
        return `[memory#${m.id}] ${m.kind}${m.project ? ` / ${m.project}` : ""}${m.tags ? ` / tags: ${m.tags}` : ""} / ${fmtDate(m.created_at)}\n${m.title ? `# ${m.title}\n` : ""}${m.content}`;
      }
      if (args.type === "task") {
        const t = await getTask(db, userId, id);
        if (!t) return `task#${id} は見つかりません`;
        return `${fmtTask(t)}\n作成: ${fmtDate(t.created_at)} / 更新: ${fmtDate(t.updated_at)}${t.completed_at ? ` / 完了: ${fmtDate(t.completed_at)}` : ""}\n${t.description || "(詳細なし)"}`;
      }
      if (args.type === "chat") {
        const c = await getConversationText(db, userId, id, Number(args.offset) || 0);
        if (!c) return `chat#${id} は見つかりません`;
        const tail =
          c.nextOffset !== null
            ? `\n\n…(全${c.total}文字中 ${c.offset}〜${c.offset + c.page.length} を表示。続きは offset=${c.nextOffset} で get_item を再実行)`
            : "";
        return `${c.header}\n\n${c.page}${tail}`;
      }
      throw new Error("type は memory / task / chat のいずれかです");
    },
  },
  {
    name: "list_projects",
    description: "プロジェクト一覧(それぞれの記憶数・未完了タスク数・チャット数)を取得する。",
    inputSchema: { type: "object", properties: {} },
    handler: async (db, userId) => {
      const projects = await listProjects(db, userId);
      if (!projects.length) return "プロジェクトはまだありません。save_memory や create_task で project を指定すると自動作成されます。";
      return (
        "プロジェクト一覧:\n" +
        projects
          .map((p) => `- ${p.name}: 記憶${p.memory_count} / 未完了タスク${p.open_tasks} / チャット${p.conversation_count}${p.description ? `\n  ${p.description.slice(0, 100)}` : ""}`)
          .join("\n")
      );
    },
  },
];

// ---------- JSON-RPC 2.0 ----------

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function handleRpc(msg: RpcRequest, db: D1Database, userId: number): Promise<Record<string, unknown>> {
  const id = msg.id as string | number | null;
  const params = msg.params ?? {};
  switch (msg.method) {
    case "initialize": {
      const requested = typeof params.protocolVersion === "string" ? params.protocolVersion : "";
      return rpcResult(id, {
        protocolVersion: SUPPORTED_VERSIONS.includes(requested) ? requested : LATEST_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: INSTRUCTIONS,
      });
    }
    case "ping":
      return rpcResult(id, {});
    case "tools/list":
      return rpcResult(id, {
        tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
      });
    case "tools/call": {
      const name = typeof params.name === "string" ? params.name : "";
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) return rpcError(id, -32602, `Unknown tool: ${name}`);
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      try {
        const text = await tool.handler(db, userId, args);
        return rpcResult(id, { content: [{ type: "text", text }], isError: false });
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return rpcResult(id, { content: [{ type: "text", text: `エラー: ${message}` }], isError: true });
      }
    }
    // クライアントによっては capabilities に関わらず呼んでくるため、空で応える
    case "resources/list":
      return rpcResult(id, { resources: [] });
    case "resources/templates/list":
      return rpcResult(id, { resourceTemplates: [] });
    case "prompts/list":
      return rpcResult(id, { prompts: [] });
    default:
      return rpcError(id, -32601, `Method not found: ${msg.method}`);
  }
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Session-Id, MCP-Protocol-Version",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

export async function handleMcpRequest(req: Request, db: D1Database, userId: number): Promise<Response> {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== "POST") {
    // ステートレス実装のため SSE ストリーム(GET)は提供しない
    return new Response(null, { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS_HEADERS } });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json(rpcError(null, -32700, "Parse error"), { status: 400, headers: CORS_HEADERS });
  }

  const messages: RpcRequest[] = Array.isArray(body) ? body : [body as RpcRequest];
  const responses: Record<string, unknown>[] = [];

  for (const m of messages) {
    if (!m || typeof m !== "object" || m.jsonrpc !== "2.0" || typeof m.method !== "string") {
      if (m && m.id !== undefined) responses.push(rpcError(m.id ?? null, -32600, "Invalid Request"));
      continue;
    }
    if (m.id === undefined) continue; // notification (例: notifications/initialized) は応答不要
    responses.push(await handleRpc(m, db, userId));
  }

  if (!responses.length) return new Response(null, { status: 202, headers: CORS_HEADERS });
  const payload = Array.isArray(body) ? responses : responses[0];
  return Response.json(payload, { headers: CORS_HEADERS });
}
