// Dscribe – エントリポイント
// ルーティング:
//   POST /mcp/<token>   … Claude コネクタ用 MCP エンドポイント (Authorization: Bearer でも可)
//   GET  /app/<token>   … Web ダッシュボード
//   *    /api/<token>/… … ダッシュボード用 REST API
//   GET  /              … ランディング(稼働確認)

import { handleMcpRequest } from "./mcp";
import { renderApp, renderLanding } from "./ui";
import { importConversations, importProjects } from "./importer";
import {
  getOverview,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  listMemories,
  saveMemory,
  deleteMemory,
  listConversations,
  deleteConversation,
  getConversationText,
  getMemory,
  getTask,
  searchAll,
  listProjects,
} from "./db";

export interface Env {
  DB: D1Database;
  AUTH_TOKEN: string;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// タイミング攻撃を避けるためハッシュ同士を比較する
async function tokenOk(env: Env, given: string | null | undefined): Promise<boolean> {
  if (!env.AUTH_TOKEN || !given) return false;
  return (await sha256Hex(env.AUTH_TOKEN)) === (await sha256Hex(given));
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

const notFound = () => json({ error: "not found" }, 404);
const unauthorized = () => json({ error: "unauthorized: トークンが違います" }, 401);

async function handleApi(req: Request, env: Env, rest: string[], url: URL): Promise<Response> {
  const db = env.DB;
  const method = req.method;
  const head = rest[0] ?? "";
  const sub = rest[1] ?? "";

  // GET /overview
  if (head === "overview" && method === "GET") {
    const ov = await getOverview(db);
    return json({ counts: ov.counts, tasks: ov.tasks, memories: ov.memories.slice(0, 8), projects: ov.projects });
  }

  // /tasks
  if (head === "tasks") {
    if (method === "GET" && !sub) {
      const tasks = await listTasks(db, {
        status: url.searchParams.get("status") ?? "active",
        project: url.searchParams.get("project") ?? undefined,
      });
      return json({ tasks });
    }
    if (method === "POST" && !sub) return json({ task: await createTask(db, await req.json()) }, 201);
    const id = Number(sub);
    if (Number.isInteger(id) && id > 0) {
      if (method === "PATCH") return json({ task: await updateTask(db, { ...(await req.json<object>()), id }) });
      if (method === "DELETE") return (await deleteTask(db, id)) ? json({ ok: true }) : notFound();
      if (method === "GET") {
        const t = await getTask(db, id);
        return t ? json({ task: t }) : notFound();
      }
    }
    return notFound();
  }

  // /memories
  if (head === "memories") {
    if (method === "GET" && !sub) {
      const memories = await listMemories(db, {
        kind: url.searchParams.get("kind") ?? undefined,
        project: url.searchParams.get("project") ?? undefined,
        limit: Number(url.searchParams.get("limit")) || 50,
      });
      return json({ memories });
    }
    if (method === "POST" && !sub) {
      const body = (await req.json()) as Record<string, unknown>;
      return json({ memory: await saveMemory(db, { ...body, source: typeof body.source === "string" ? body.source : "manual" }) }, 201);
    }
    const id = Number(sub);
    if (Number.isInteger(id) && id > 0 && method === "DELETE") {
      return (await deleteMemory(db, id)) ? json({ ok: true }) : notFound();
    }
    return notFound();
  }

  // /conversations
  if (head === "conversations") {
    if (method === "GET" && !sub) return json({ conversations: await listConversations(db) });
    const id = Number(sub);
    if (Number.isInteger(id) && id > 0 && method === "DELETE") {
      return (await deleteConversation(db, id)) ? json({ ok: true }) : notFound();
    }
    return notFound();
  }

  // GET /projects
  if (head === "projects" && method === "GET") return json({ projects: await listProjects(db) });

  // GET /search?q=
  if (head === "search" && method === "GET") {
    const { results } = await searchAll(db, {
      query: url.searchParams.get("q") ?? "",
      project: url.searchParams.get("project") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || 10,
    });
    return json({ results });
  }

  // GET /item?type=&id=&offset=
  if (head === "item" && method === "GET") {
    const type = url.searchParams.get("type");
    const id = Number(url.searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return json({ error: "id が不正です" }, 400);
    if (type === "chat") {
      const c = await getConversationText(db, id, Number(url.searchParams.get("offset")) || 0);
      if (!c) return notFound();
      return json({ text: (c.offset === 0 ? c.header + "\n\n" : "") + c.page, nextOffset: c.nextOffset, total: c.total });
    }
    if (type === "memory") {
      const m = await getMemory(db, id);
      if (!m) return notFound();
      return json({ text: `${m.title ? m.title + "\n\n" : ""}${m.content}\n\n(${m.kind}${m.project ? ` / ${m.project}` : ""}${m.tags ? ` / ${m.tags}` : ""} / ${m.created_at})`, nextOffset: null });
    }
    if (type === "task") {
      const t = await getTask(db, id);
      if (!t) return notFound();
      return json({ text: `${t.title}\n状態: ${t.status} / 優先度: ${t.priority}${t.due_date ? ` / 期限: ${t.due_date}` : ""}\n\n${t.description || "(詳細なし)"}`, nextOffset: null });
    }
    return json({ error: "type は memory / task / chat" }, 400);
  }

  // POST /import/conversations, /import/projects
  if (head === "import" && method === "POST") {
    if (sub === "conversations") return json(await importConversations(db, await req.json()));
    if (sub === "projects") return json(await importProjects(db, await req.json()));
    return notFound();
  }

  // GET /export … 全データダンプ
  if (head === "export" && method === "GET") {
    const [tasks, memories, projects, conversations] = await Promise.all([
      listTasks(db, { status: "all", limit: 300 }),
      listMemories(db, { limit: 200 }),
      listProjects(db),
      listConversations(db, 500),
    ]);
    return json({ exported_at: new Date().toISOString(), tasks, memories, projects, conversations });
  }

  return notFound();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const seg = url.pathname.split("/").filter(Boolean);

    if (!env.AUTH_TOKEN) {
      return new Response("セットアップ未完了: `npx wrangler secret put AUTH_TOKEN` でトークンを設定してください(setup.sh 参照)", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    if (seg.length === 0) {
      return new Response(renderLanding(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const [area, token, ...rest] = seg;

    if (area === "mcp") {
      const given = token ?? bearerToken(req);
      if (!(await tokenOk(env, given))) return unauthorized();
      return handleMcpRequest(req, env.DB);
    }

    if (area === "app") {
      if (!(await tokenOk(env, token))) return unauthorized();
      return new Response(renderApp(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    if (area === "api") {
      if (!(await tokenOk(env, token))) return unauthorized();
      try {
        return await handleApi(req, env, rest, url);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
