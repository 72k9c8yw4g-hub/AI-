// AI意思決定OS — REST ハンドラ (/api/<token>/os/...)。
// index.ts の handleApi から head === "os" のとき委譲される。認証済み userId を受け取る。

import { anyKeyPresent, type LlmSecrets } from "./provider";
import { runMentorTurn, runRecorderTurn } from "./org";
import {
  activeDecisionList,
  addMessage,
  approveCandidate,
  autoTitleIfNeeded,
  createCandidate,
  createChat,
  deleteChat,
  getChat,
  getRoleModel,
  listChats,
  listDecisions,
  listMessages,
  listPendingCandidates,
  rejectCandidate,
  renameChat,
} from "./db";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
const notFound = () => json({ error: "not found" }, 404);

export async function handleOsApi(
  req: Request,
  db: D1Database,
  userId: number,
  secrets: LlmSecrets,
  rest: string[],
  _url: URL
): Promise<Response> {
  const method = req.method;
  const head = rest[0] ?? "";

  // GET /os/status … LLM 接続の有無 (UI に「モデル未接続」を出すため)
  if (head === "status" && method === "GET") {
    return json({ llm_connected: anyKeyPresent(secrets) });
  }

  if (head === "chats") {
    // /os/chats
    if (!rest[1]) {
      if (method === "GET") return json({ chats: await listChats(db, userId) });
      if (method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { title?: unknown };
        return json({ chat: await createChat(db, userId, body.title) }, 201);
      }
      return notFound();
    }
    // /os/chats/<id>[/send]
    const id = Number(rest[1]);
    if (!Number.isInteger(id) || id <= 0) return notFound();
    const action = rest[2] ?? "";

    // POST /os/chats/<id>/send … ユーザー発言 → メンター応答
    if (action === "send" && method === "POST") {
      const chat = await getChat(db, userId, id);
      if (!chat) return notFound();
      const body = (await req.json().catch(() => ({}))) as { content?: unknown };
      const content = (typeof body.content === "string" ? body.content : "").trim();
      if (!content) return json({ error: "content が空です" }, 400);

      const userMsg = await addMessage(db, userId, id, "user", content);
      await autoTitleIfNeeded(db, userId, id, content);

      const history = await listMessages(db, userId, id);
      const rm = await getRoleModel(db, userId, "mentor");
      const result = await runMentorTurn(history, rm, secrets);
      const mentorMsg = await addMessage(db, userId, id, "mentor", result.text);

      return json({ user: userMsg, mentor: mentorMsg, stub: result.stub });
    }

    // POST /os/chats/<id>/propose … 記録官が会話から保存候補を生成(まだ保存しない)
    if (action === "propose" && method === "POST") {
      const chat = await getChat(db, userId, id);
      if (!chat) return notFound();
      const msgs = await listMessages(db, userId, id);
      if (!msgs.length) return json({ save: false, reason: "まだ会話がありません" });
      const active = await activeDecisionList(db, userId);
      const rm = await getRoleModel(db, userId, "recorder");
      const r = await runRecorderTurn(msgs, active, rm, secrets);
      if (!r.save || !r.candidate) return json({ save: false, stub: r.stub });
      const candidate = await createCandidate(db, userId, id, r.candidate);
      return json({ save: true, candidate, stub: r.stub });
    }

    if (!action) {
      // GET … チャット + 全メッセージ
      if (method === "GET") {
        const chat = await getChat(db, userId, id);
        if (!chat) return notFound();
        return json({ chat, messages: await listMessages(db, userId, id) });
      }
      // PATCH … リネーム
      if (method === "PATCH") {
        const body = (await req.json().catch(() => ({}))) as { title?: unknown };
        return (await renameChat(db, userId, id, body.title)) ? json({ ok: true }) : notFound();
      }
      // DELETE
      if (method === "DELETE") {
        return (await deleteChat(db, userId, id)) ? json({ ok: true }) : notFound();
      }
    }
    return notFound();
  }

  // /os/candidates … 保存候補の承認/却下(承認 = 明示的承認 → 決定事項に保存)
  if (head === "candidates") {
    if (!rest[1] && method === "GET") return json({ candidates: await listPendingCandidates(db, userId) });
    const cid = Number(rest[1]);
    if (Number.isInteger(cid) && cid > 0) {
      const act = rest[2] ?? "";
      if (act === "approve" && method === "POST") {
        const r = await approveCandidate(db, userId, cid);
        return r.ok ? json({ ok: true, memory: r.memory }) : json({ error: r.error }, 400);
      }
      if (act === "reject" && method === "POST") {
        return (await rejectCandidate(db, userId, cid)) ? json({ ok: true }) : notFound();
      }
    }
    return notFound();
  }

  // GET /os/decisions … 決定事項(Active / Archived / 承認待ち)
  if (head === "decisions" && method === "GET") {
    const { active, archived } = await listDecisions(db, userId);
    const pending = await listPendingCandidates(db, userId);
    return json({ active, archived, pending });
  }

  return notFound();
}
