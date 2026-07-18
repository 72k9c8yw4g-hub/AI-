// AI意思決定OS — REST ハンドラ (/api/<token>/os/...)。
// index.ts の handleApi から head === "os" のとき委譲される。認証済み userId を受け取る。

import { anyKeyPresent, listProviderModels, type LlmSecrets, type Provider } from "./provider";
import { lastBackupStatus, runBackup } from "./backup";
import { runMentorTurn, runRecorderTurn, runMonitorTurn, runWorkerTask, runMentorConsolidation } from "./org";
import {
  activeDecisionList,
  addMessage,
  addWorkerMsg,
  approveCandidate,
  assignChatProject,
  autoTitleIfNeeded,
  consumeLlmBudget,
  createCandidate,
  createChat,
  createWorkerRun,
  deleteChat,
  listOsProjects,
  listSavedData,
  deleteUserApiKey,
  effectiveSecrets,
  finishWorkerRun,
  getChat,
  getDecisionDetail,
  getRoleModel,
  getWorkerLog,
  getWorkerRun,
  keyStatus,
  listChats,
  listDecisions,
  listMessages,
  listPendingCandidates,
  listRoleModels,
  listWorkerRuns,
  rejectCandidate,
  renameChat,
  searchOs,
  setRoleModel,
  setUserApiKey,
  taskFromDecision,
} from "./db";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}
const notFound = () => json({ error: "not found" }, 404);

export async function handleOsApi(
  req: Request,
  db: D1Database,
  userId: number,
  envSecrets: LlmSecrets & { BACKUP?: R2Bucket },
  rest: string[],
  url: URL,
  isOwner = false
): Promise<Response> {
  const method = req.method;
  const head = rest[0] ?? "";
  // env の Secret + ⚙️ で登録されたユーザーキーをマージ(以降は常にこちらを使う)
  const secrets = await effectiveSecrets(db, userId, envSecrets);

  // GET /os/status … LLM 接続の有無 (UI に「モデル未接続」を出すため)
  if (head === "status" && method === "GET") {
    return json({ llm_connected: anyKeyPresent(secrets) });
  }

  // /os/keys … ⚙️ からの APIキー登録/削除 (Cloudflare Secret を触らずに接続できる)
  if (head === "keys") {
    if (method === "PUT") {
      const b = (await req.json().catch(() => ({}))) as { provider?: unknown; key?: unknown };
      const ok = await setUserApiKey(db, userId, String(b.provider ?? ""), b.key);
      return ok
        ? json({ ok: true })
        : json({ error: "キーの形式が不正です(空白・改行なし、10文字以上で貼り付けてください)" }, 400);
    }
    if (method === "DELETE") {
      const b = (await req.json().catch(() => ({}))) as { provider?: unknown };
      return (await deleteUserApiKey(db, userId, String(b.provider ?? ""))) ? json({ ok: true }) : notFound();
    }
    return notFound();
  }

  if (head === "chats") {
    // /os/chats
    if (!rest[1]) {
      if (method === "GET") return json({ chats: await listChats(db, userId, url.searchParams.get("project") ?? undefined) });
      if (method === "POST") {
        const body = (await req.json().catch(() => ({}))) as { title?: unknown; project?: unknown };
        return json({ chat: await createChat(db, userId, body.title, body.project) }, 201);
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

      // 1送信 = メンター + 監視官の2回。1日上限を先に消費(超過なら何も書かずに返す)
      try {
        await consumeLlmBudget(db, userId, 2);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 429);
      }

      const userMsg = await addMessage(db, userId, id, "user", content);
      await autoTitleIfNeeded(db, userId, id, content);

      // LLM に渡す履歴は直近30件まで(長期チャットのコスト増大・コンテキスト溢れ防止)
      const history = (await listMessages(db, userId, id)).slice(-30);
      const rm = await getRoleModel(db, userId, "mentor");
      const result = await runMentorTurn(history, rm, secrets);
      const mentorMsg = await addMessage(db, userId, id, "mentor", result.text);

      // 特命監視官: メンター応答後に横から監査。問題があれば警告を残す(独立監査・非中継)。
      let monitorMsg = null;
      const active = await activeDecisionList(db, userId);
      const monRm = await getRoleModel(db, userId, "monitor");
      const withMentor = (await listMessages(db, userId, id)).slice(-30);
      const warnings = await runMonitorTurn(withMentor, active, monRm, secrets);
      if (warnings.length) {
        const text = warnings.map((w) => `[${w.type}] ${w.message}`).join("\n");
        monitorMsg = await addMessage(db, userId, id, "monitor", text);
      }

      return json({ user: userMsg, mentor: mentorMsg, monitor: monitorMsg, stub: result.stub });
    }

    // POST /os/chats/<id>/delegate … 作業AIにタスクを委任(協働→メンター整理→メイン会話へ)
    if (action === "delegate" && method === "POST") {
      const chat = await getChat(db, userId, id);
      if (!chat) return notFound();
      const body = (await req.json().catch(() => ({}))) as { task?: unknown };
      const task = (typeof body.task === "string" ? body.task : "").trim().slice(0, 4000);
      if (!task) return json({ error: "task が空です" }, 400);

      // 委任 = 作業AI3回 + メンター整理1回 = 4回ぶんの予算
      try {
        await consumeLlmBudget(db, userId, 4);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 429);
      }

      await addMessage(db, userId, id, "user", task);
      await autoTitleIfNeeded(db, userId, id, task);

      // 背景 = 直近の会話(監視官・システムは中継しないので除く)
      const hist = await listMessages(db, userId, id);
      const ctx = hist
        .slice(-8)
        .filter((m) => m.role !== "monitor" && m.role !== "system")
        .map((m) => `${m.role === "user" ? "ユーザー" : m.role === "mentor" ? "メンター" : m.name || m.role}: ${m.content}`)
        .join("\n");

      const run = await createWorkerRun(db, userId, id, task);
      try {
        const wrm = await getRoleModel(db, userId, "worker");
        const wr = await runWorkerTask(task, ctx, wrm, secrets);
        let seq = 1;
        for (const item of wr.log) await addWorkerMsg(db, userId, run.id, seq++, item.role, item.name, item.content);

        // 成果物はメンターが検証・整理してからユーザーに提示(直接は出さない)
        const mrm = await getRoleModel(db, userId, "mentor");
        const cons = await runMentorConsolidation(task, wr.deliverable, mrm, secrets);
        const mentorMsg = await addMessage(db, userId, id, "mentor", `🛠【作業AIの成果・メンター整理】\n${cons.text}`);
        await finishWorkerRun(db, userId, run.id, cons.text);

        return json({ run: { ...run, status: "done" }, log: wr.log, mentor: mentorMsg, stub: wr.stub || cons.stub });
      } catch (e) {
        // 途中で落ちても run を「running」のまま残さない(ゾンビ防止)
        const msg = e instanceof Error ? e.message : String(e);
        await finishWorkerRun(db, userId, run.id, `エラーで中断: ${msg.slice(0, 300)}`, "failed");
        return json({ error: `作業AIの実行に失敗しました: ${msg.slice(0, 200)}` }, 500);
      }
    }

    // POST /os/chats/<id>/propose … 記録官が会話から保存候補を生成(まだ保存しない)
    if (action === "propose" && method === "POST") {
      const chat = await getChat(db, userId, id);
      if (!chat) return notFound();
      const msgs = (await listMessages(db, userId, id)).slice(-30);
      if (!msgs.length) return json({ save: false, reason: "まだ会話がありません" });
      try {
        await consumeLlmBudget(db, userId, 1);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 429);
      }
      const active = await activeDecisionList(db, userId);
      const rm = await getRoleModel(db, userId, "recorder");
      const r = await runRecorderTurn(msgs, active, rm, secrets);
      if (!r.save || !r.candidate) return json({ save: false, stub: r.stub });
      // 候補は元チャットのプロジェクトを引き継ぐ(承認後の決定がそのPJに属するように)
      const candidate = await createCandidate(db, userId, id, { ...r.candidate, project: chat.project ?? "" });
      return json({ save: true, candidate, stub: r.stub });
    }

    if (!action) {
      // GET … チャット + 全メッセージ
      if (method === "GET") {
        const chat = await getChat(db, userId, id);
        if (!chat) return notFound();
        return json({ chat, messages: await listMessages(db, userId, id) });
      }
      // PATCH … リネーム / プロジェクト割り当て
      if (method === "PATCH") {
        const body = (await req.json().catch(() => ({}))) as { title?: unknown; project?: unknown };
        let ok = false;
        if (body.project !== undefined) ok = (await assignChatProject(db, userId, id, body.project)) || ok;
        if (typeof body.title === "string") ok = (await renameChat(db, userId, id, body.title)) || ok;
        return ok ? json({ ok: true }) : notFound();
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

  // /os/decisions … 決定事項(一覧 / 詳細 / タスク化)
  if (head === "decisions") {
    const did = Number(rest[1]);
    // POST /os/decisions/<id>/task … 決定を実行タスクに落とす(憲法 Rule 4: 実行優先)
    if (Number.isInteger(did) && did > 0 && rest[2] === "task" && method === "POST") {
      try {
        return json({ task: await taskFromDecision(db, userId, did) }, 201);
      } catch (e) {
        return json({ error: e instanceof Error ? e.message : String(e) }, 400);
      }
    }
    // GET /os/decisions/<id> … 詳細(更新履歴・元チャット・関連決定・実行タスクつき) — 実装準備第8章
    if (Number.isInteger(did) && did > 0 && method === "GET") {
      const detail = await getDecisionDetail(db, userId, did);
      return detail ? json(detail) : notFound();
    }
    if (!rest[1] && method === "GET") {
      const { active, archived } = await listDecisions(db, userId);
      const pending = await listPendingCandidates(db, userId);
      return json({ active, archived, pending });
    }
    return notFound();
  }

  // GET /os/projects … プロジェクト一覧(OSチャット数・現行決定数つき) — 技術第7章/実装第10章
  if (head === "projects" && method === "GET") {
    return json({ projects: await listOsProjects(db, userId) });
  }

  // GET /os/saved … 保存データ(決定以外の記録: memory / note) — 実装準備第3章
  if (head === "saved" && method === "GET") {
    return json({
      saved: await listSavedData(db, userId, {
        project: url.searchParams.get("project") ?? undefined,
        q: url.searchParams.get("q") ?? undefined,
      }),
    });
  }

  // GET /os/search?q=… … OS内の横断検索(チャット・決定・AI会話ログ) — 実装準備第12章
  if (head === "search" && method === "GET") {
    try {
      const r = await searchOs(db, userId, url.searchParams.get("q") ?? "");
      return json(r);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 400);
    }
  }

  // /os/runs … 作業AIのアサイン履歴と AI会話ログ(閲覧専用)
  if (head === "runs") {
    if (!rest[1] && method === "GET") return json({ runs: await listWorkerRuns(db, userId) });
    const rid = Number(rest[1]);
    if (Number.isInteger(rid) && rid > 0 && method === "GET") {
      const run = await getWorkerRun(db, userId, rid);
      if (!run) return notFound();
      return json({ run, log: await getWorkerLog(db, userId, rid) });
    }
    return notFound();
  }

  // GET /os/models?provider=gemini … そのキーで実際に使えるモデル一覧(⚙️の候補表示用)
  if (head === "models" && method === "GET") {
    const p = url.searchParams.get("provider") ?? "";
    if (!["anthropic", "openai", "gemini"].includes(p)) return json({ error: "provider が不正です" }, 400);
    const key =
      p === "anthropic" ? secrets.ANTHROPIC_API_KEY : p === "openai" ? secrets.OPENAI_API_KEY : secrets.GEMINI_API_KEY;
    if (!key) return json({ models: [], error: "キー未接続" });
    try {
      return json({ models: await listProviderModels(p as Provider, key) });
    } catch (e) {
      return json({ models: [], error: e instanceof Error ? e.message : String(e) });
    }
  }

  // /os/backup … 自動バックアップの状態と手動実行(オーナー限定 — 全ユーザーのデータを含むため)
  if (head === "backup") {
    if (!isOwner) return json({ error: "オーナーのみ実行できます" }, 403);
    if (method === "GET") {
      return json({ enabled: !!envSecrets.BACKUP, last: await lastBackupStatus(db) });
    }
    if (method === "POST") {
      const status = await runBackup(db, envSecrets.BACKUP);
      return json({ status });
    }
    return notFound();
  }

  // /os/roles … 役割別モデル設定(技術設計書 第4-5章)
  if (head === "roles") {
    if (method === "GET") {
      const info = await keyStatus(db, userId, envSecrets);
      return json({
        roles: await listRoleModels(db, userId),
        keys: { anthropic: info.anthropic.set, openai: info.openai.set, gemini: info.gemini.set },
        keyInfo: info,
      });
    }
    if (method === "PUT") {
      const b = (await req.json().catch(() => ({}))) as { role?: unknown; provider?: unknown; model?: unknown };
      const ok = await setRoleModel(db, userId, String(b.role ?? ""), String(b.provider ?? ""), String(b.model ?? ""));
      return ok ? json({ ok: true }) : json({ error: "role または provider が不正です" }, 400);
    }
    return notFound();
  }

  return notFound();
}
