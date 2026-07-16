// Dscribe – エントリポイント (マルチアカウント)
// ルーティング:
//   GET/POST /join/<招待コード> … 新規登録(リンクを知っている人のみ)
//   POST /mcp/<個人トークン>    … Claude コネクタ用 MCP エンドポイント (Authorization: Bearer でも可)
//   GET  /app/<個人トークン>    … Web ダッシュボード
//   *    /api/<個人トークン>/…  … ダッシュボード用 REST API
//   GET  /                      … ランディング(稼働確認)
// 各ユーザーのデータは user_id で完全分離。トークンはユーザーごとに独立。

import { handleMcpRequest } from "./mcp";
import { renderApp, renderLanding, renderJoinPage, renderSetupPage } from "./ui";
import { importConversations, importProjects } from "./importer";
import { ensureSchema } from "./schema";
import { ensureOsSchema } from "./os/schema";
import { handleOsApi } from "./os/api";
import { renderOsApp } from "./os/ui";
import { ICON_192_B64, ICON_512_B64, iconPng, manifestFor, serviceWorker } from "./os/assets";
import {
  getUserByToken,
  createUser,
  countUsers,
  genToken,
  getSetting,
  setSetting,
  listUsers,
  resetUserToken,
  deleteUserCascade,
  getOverview,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  listMemories,
  saveMemory,
  deleteMemory,
  getMemoryChain,
  formatMemoryChain,
  updateProjectDescription,
  listConversations,
  deleteConversation,
  getConversationText,
  exportConversations,
  getMemory,
  getTask,
  searchAll,
  listProjects,
  type UserRow,
} from "./db";

export interface Env {
  DB: D1Database;
  // 招待コード。通常は初期設定時に自動生成して DB (settings) に保存される。
  // 環境変数/Secret で固定したい場合のみ設定(設定されていれば DB より優先)
  INVITE_CODE?: string;
  // AI意思決定OS: 役割(メンター等)を動かす LLM の APIキー。Secret で設定する。
  //   npx wrangler secret put ANTHROPIC_API_KEY
  // 未設定でもアプリは動く(スタブ応答)。
  ANTHROPIC_API_KEY?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
}

// 有効な招待コード(環境変数 > DB設定)
async function effectiveInviteCode(env: Env): Promise<string | null> {
  return env.INVITE_CODE || (await getSetting(env.DB, "invite_code"));
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// タイミング攻撃を避けるためハッシュ同士を比較する
async function secretOk(secret: string | undefined, given: string | null | undefined): Promise<boolean> {
  if (!secret || !given) return false;
  return (await sha256Hex(secret)) === (await sha256Hex(given));
}

function bearerToken(req: Request): string | null {
  const h = req.headers.get("Authorization") ?? "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

const notFound = () => json({ error: "not found" }, 404);
const unauthorized = () => json({ error: "unauthorized: URLのトークンが違います" }, 401);

async function handleApi(req: Request, env: Env, user: UserRow, rest: string[], url: URL): Promise<Response> {
  const db = env.DB;
  const uid = user.id;
  const method = req.method;
  const head = rest[0] ?? "";
  const sub = rest[1] ?? "";

  // GET /me … ログイン中アカウント情報(オーナーには招待リンクも返す)
  if (head === "me" && method === "GET") {
    const invite = user.is_owner ? await effectiveInviteCode(env) : null;
    return json({
      id: user.id,
      email: user.email,
      is_owner: !!user.is_owner,
      join_url: invite ? `${url.origin}/join/${invite}` : null,
    });
  }

  // /users … オーナー専用のメンバー管理
  if (head === "users") {
    if (!user.is_owner) return json({ error: "オーナーのみ実行できます" }, 403);
    if (method === "GET" && !sub) return json({ users: await listUsers(db) });
    const id = Number(sub);
    if (Number.isInteger(id) && id > 0) {
      if (method === "POST" && rest[2] === "reset") {
        const token = await resetUserToken(db, id);
        if (!token) return notFound();
        return json({
          token,
          app_url: `${url.origin}/app/${token}`,
          mcp_url: `${url.origin}/mcp/${token}`,
        });
      }
      if (method === "DELETE") {
        if (id === user.id) return json({ error: "自分自身は削除できません" }, 400);
        return (await deleteUserCascade(db, id)) ? json({ ok: true }) : notFound();
      }
    }
    return notFound();
  }

  // GET /overview?project=&focus=
  if (head === "overview" && method === "GET") {
    const ov = await getOverview(db, uid, {
      project: url.searchParams.get("project") ?? undefined,
      focus: url.searchParams.get("focus") ?? undefined,
    });
    return json({
      counts: ov.counts,
      tasks: ov.tasks,
      memories: ov.memories.slice(0, 8),
      projects: ov.projects,
      recentConvs: ov.recentConvs,
      projectFilter: ov.projectFilter,
      projectId: ov.projectId,
      brief: ov.brief,
      decisions: ov.decisions,
      focusHits: ov.focusHits,
    });
  }

  // /tasks
  if (head === "tasks") {
    if (method === "GET" && !sub) {
      const tasks = await listTasks(db, uid, {
        status: url.searchParams.get("status") ?? "active",
        project: url.searchParams.get("project") ?? undefined,
      });
      return json({ tasks });
    }
    if (method === "POST" && !sub) return json({ task: await createTask(db, uid, await req.json()) }, 201);
    const id = Number(sub);
    if (Number.isInteger(id) && id > 0) {
      if (method === "PATCH") return json({ task: await updateTask(db, uid, { ...(await req.json<object>()), id }) });
      if (method === "DELETE") return (await deleteTask(db, uid, id)) ? json({ ok: true }) : notFound();
      if (method === "GET") {
        const t = await getTask(db, uid, id);
        return t ? json({ task: t }) : notFound();
      }
    }
    return notFound();
  }

  // /memories
  if (head === "memories") {
    if (method === "GET" && !sub) {
      const memories = await listMemories(db, uid, {
        kind: url.searchParams.get("kind") ?? undefined,
        project: url.searchParams.get("project") ?? undefined,
        limit: Number(url.searchParams.get("limit")) || 50,
        activeOnly: url.searchParams.get("active") === "1",
      });
      return json({ memories });
    }
    if (method === "POST" && !sub) {
      const body = (await req.json()) as Record<string, unknown>;
      return json({ memory: await saveMemory(db, uid, { ...body, source: typeof body.source === "string" ? body.source : "manual" }) }, 201);
    }
    const id = Number(sub);
    if (Number.isInteger(id) && id > 0 && method === "DELETE") {
      return (await deleteMemory(db, uid, id)) ? json({ ok: true }) : notFound();
    }
    return notFound();
  }

  // /conversations
  if (head === "conversations") {
    if (method === "GET" && !sub) return json({ conversations: await listConversations(db, uid) });
    const id = Number(sub);
    if (Number.isInteger(id) && id > 0 && method === "DELETE") {
      return (await deleteConversation(db, uid, id)) ? json({ ok: true }) : notFound();
    }
    return notFound();
  }

  // /projects
  if (head === "projects") {
    if (method === "GET" && !sub) return json({ projects: await listProjects(db, uid) });
    const id = Number(sub);
    if (Number.isInteger(id) && id > 0 && method === "PATCH") {
      const body = (await req.json()) as { description?: unknown };
      return (await updateProjectDescription(db, uid, id, body.description)) ? json({ ok: true }) : notFound();
    }
    return notFound();
  }

  // GET /search?q=
  if (head === "search" && method === "GET") {
    const { results } = await searchAll(db, uid, {
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
      const c = await getConversationText(db, uid, id, Number(url.searchParams.get("offset")) || 0);
      if (!c) return notFound();
      return json({ text: (c.offset === 0 ? c.header + "\n\n" : "") + c.page, nextOffset: c.nextOffset, total: c.total });
    }
    if (type === "memory") {
      const m = await getMemory(db, uid, id);
      if (!m) return notFound();
      const warn = m.superseded_by_id ? `⚠ 旧版（現行: memory#${m.superseded_by_id}）\n\n` : "";
      const chain = formatMemoryChain(await getMemoryChain(db, uid, id), id);
      return json({
        text: `${warn}${m.title ? m.title + "\n\n" : ""}${m.content}\n\n(${m.kind}${m.project ? ` / ${m.project}` : ""}${m.tags ? ` / ${m.tags}` : ""} / ${m.created_at})${chain ? `\n\n${chain}` : ""}`,
        nextOffset: null,
      });
    }
    if (type === "task") {
      const t = await getTask(db, uid, id);
      if (!t) return notFound();
      return json({ text: `${t.title}\n状態: ${t.status} / 優先度: ${t.priority}${t.due_date ? ` / 期限: ${t.due_date}` : ""}\n\n${t.description || "(詳細なし)"}`, nextOffset: null });
    }
    return json({ error: "type は memory / task / chat" }, 400);
  }

  // POST /import/conversations, /import/projects
  if (head === "import" && method === "POST") {
    if (sub === "conversations") return json(await importConversations(db, uid, await req.json()));
    if (sub === "projects") return json(await importProjects(db, uid, await req.json()));
    return notFound();
  }

  // GET /export … データのエクスポート(JSON)
  //   省略時: 全データ / ?type=memories|tasks|conversations|projects: カテゴリ別 / ?project=名前: プロジェクト単位
  if (head === "export" && method === "GET") {
    const type = url.searchParams.get("type");
    const project = url.searchParams.get("project")?.trim() || undefined;
    const base = { exported_at: new Date().toISOString(), account: user.email };
    if (project) {
      const projects = await listProjects(db, uid);
      const p = projects.find((x) => x.name === project);
      if (!p) return notFound();
      const [tasks, memories, conversations] = await Promise.all([
        listTasks(db, uid, { status: "all", project, limit: 2000 }),
        listMemories(db, uid, { project, limit: 2000 }),
        exportConversations(db, uid, project),
      ]);
      return json({ ...base, project: { name: p.name, description: p.description }, memories, tasks, conversations });
    }
    if (type === "memories") return json({ ...base, memories: await listMemories(db, uid, { limit: 2000 }) });
    if (type === "tasks") return json({ ...base, tasks: await listTasks(db, uid, { status: "all", limit: 2000 }) });
    if (type === "conversations") return json({ ...base, conversations: await exportConversations(db, uid) });
    if (type === "projects") return json({ ...base, projects: await listProjects(db, uid) });
    const [tasks, memories, projects, conversations] = await Promise.all([
      listTasks(db, uid, { status: "all", limit: 2000 }),
      listMemories(db, uid, { limit: 2000 }),
      listProjects(db, uid),
      exportConversations(db, uid),
    ]);
    return json({ ...base, projects, memories, tasks, conversations });
  }

  // /os/… … AI意思決定OS (チャット + メンター)
  if (head === "os") {
    return handleOsApi(req, db, uid, env, rest.slice(1), url);
  }

  return notFound();
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const seg = url.pathname.split("/").filter(Boolean);

    // テーブルは初回アクセス時に自動作成(CLI不要でブラウザだけで導入できるように)
    await ensureSchema(env.DB);
    await ensureOsSchema(env.DB);

    if (seg.length === 0) {
      // まだ誰も登録されていなければ初期設定ページ(オーナー登録)を表示
      if ((await countUsers(env.DB)) === 0) return html(renderSetupPage());
      return html(renderLanding());
    }

    const [area, token, ...rest] = seg;

    // 初期設定(最初の1人 = オーナーの作成)。ユーザーが存在する間は無効
    if (area === "setup" && req.method === "POST") {
      if ((await countUsers(env.DB)) > 0) return json({ error: "既にセットアップ済みです" }, 403);
      try {
        const body = (await req.json()) as { email?: unknown };
        const owner = await createUser(env.DB, body.email, true);
        let invite = await effectiveInviteCode(env);
        if (!invite) {
          invite = genToken().slice(0, 32);
          await setSetting(env.DB, "invite_code", invite);
        }
        return json(
          {
            email: owner.email,
            app_url: `${url.origin}/app/${owner.token}`,
            mcp_url: `${url.origin}/mcp/${owner.token}`,
            join_url: `${url.origin}/join/${invite}`,
          },
          201
        );
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }

    // 新規登録(招待リンクを知っている人のみ)
    if (area === "join") {
      const invite = await effectiveInviteCode(env);
      if (!(await secretOk(invite ?? undefined, token))) {
        return html(renderLanding(), 404);
      }
      if (req.method === "GET") return html(renderJoinPage());
      if (req.method === "POST") {
        try {
          const body = (await req.json()) as { email?: unknown };
          const user = await createUser(env.DB, body.email);
          return json({
            email: user.email,
            app_url: `${url.origin}/app/${user.token}`,
            mcp_url: `${url.origin}/mcp/${user.token}`,
          }, 201);
        } catch (e) {
          return json({ error: e instanceof Error ? e.message : String(e) }, 400);
        }
      }
      return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
    }

    if (area === "mcp") {
      const user = await getUserByToken(env.DB, token ?? bearerToken(req));
      if (!user) return unauthorized();
      return handleMcpRequest(req, env.DB, user.id);
    }

    if (area === "app") {
      const user = await getUserByToken(env.DB, token);
      if (!user) return unauthorized();
      return html(renderApp());
    }

    // AI意思決定OS アプリ画面 (チャット + 5役職) + PWA アセット
    if (area === "os") {
      // 公開アセット(秘密情報なし)。SW は /os/ スコープでどのトークンのページも担当できる
      if (token === "sw.js") return serviceWorker();
      if (token === "icon-192.png") return iconPng(ICON_192_B64);
      if (token === "icon-512.png") return iconPng(ICON_512_B64);
      const user = await getUserByToken(env.DB, token);
      if (!user) return unauthorized();
      // インストール後にそのユーザーのOSが直接開くよう、トークン入り manifest を返す
      if (rest[0] === "manifest.webmanifest") return manifestFor(token);
      return html(renderOsApp(token));
    }

    if (area === "api") {
      const user = await getUserByToken(env.DB, token);
      if (!user) return unauthorized();
      try {
        return await handleApi(req, env, user, rest, url);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }

    return notFound();
  },
} satisfies ExportedHandler<Env>;
