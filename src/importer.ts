// claude.ai の公式データエクスポート (conversations.json / projects.json) の取り込み
// 設定 → プライバシー → 「データをエクスポート」で届く zip の中身を想定。
// フォーマット差異に耐えるよう、フィールドは緩めに解釈する。

import { ensureProject } from "./db";

export interface ImportStats {
  imported: number;
  updated: number;
  messages: number;
  skipped: number;
  errors: string[];
}

interface RawMessage {
  sender?: unknown;
  role?: unknown;
  text?: unknown;
  content?: unknown;
  created_at?: unknown;
}

function messageText(m: RawMessage): string {
  if (typeof m.text === "string" && m.text.trim()) return m.text;
  if (Array.isArray(m.content)) {
    const parts = m.content
      .map((c: any) => (c && typeof c.text === "string" ? c.text : ""))
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  if (typeof m.content === "string") return m.content;
  return "";
}

function asString(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}

export async function importConversations(db: D1Database, list: unknown): Promise<ImportStats> {
  let items: any[];
  if (Array.isArray(list)) items = list;
  else if (list && typeof list === "object" && Array.isArray((list as any).conversations)) {
    items = (list as any).conversations;
  } else {
    throw new Error("conversations.json の配列(またはその一部)を送信してください");
  }

  const stats: ImportStats = { imported: 0, updated: 0, messages: 0, skipped: 0, errors: [] };

  for (const conv of items) {
    try {
      const uuid = asString(conv?.uuid) || asString(conv?.id);
      if (!uuid) {
        stats.skipped++;
        continue;
      }
      const name = asString(conv?.name).slice(0, 300);
      const projectName = asString(conv?.project?.name) || asString(conv?.project_name);
      const createdAt = asString(conv?.created_at) || null;
      const updatedAt = asString(conv?.updated_at) || createdAt;
      const rawMsgs: RawMessage[] = Array.isArray(conv?.chat_messages)
        ? conv.chat_messages
        : Array.isArray(conv?.messages)
          ? conv.messages
          : [];

      const existing = await db
        .prepare("SELECT id FROM conversations WHERE uuid = ?")
        .bind(uuid)
        .first<{ id: number }>();

      let convId: number;
      if (existing) {
        convId = existing.id;
        await db
          .prepare("UPDATE conversations SET name = ?, project_name = ?, created_at = ?, updated_at = ?, imported_at = datetime('now') WHERE id = ?")
          .bind(name, projectName, createdAt, updatedAt, convId)
          .run();
        await db.prepare("DELETE FROM messages WHERE conversation_id = ?").bind(convId).run();
        stats.updated++;
      } else {
        const res = await db
          .prepare("INSERT INTO conversations (uuid, name, project_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
          .bind(uuid, name, projectName, createdAt, updatedAt)
          .run();
        convId = Number(res.meta.last_row_id);
        stats.imported++;
      }

      // メッセージをバッチ挿入
      const stmt = db.prepare(
        "INSERT INTO messages (conversation_id, sender, text, created_at, seq) VALUES (?, ?, ?, ?, ?)"
      );
      let batch: D1PreparedStatement[] = [];
      let seq = 0;
      for (const m of rawMsgs) {
        const text = messageText(m).slice(0, 100000);
        if (!text.trim()) continue;
        const sender = asString(m.sender) || asString(m.role) || "unknown";
        batch.push(stmt.bind(convId, sender === "human" || sender === "user" ? "human" : "assistant", text, asString(m.created_at) || null, seq++));
        if (batch.length >= 40) {
          await db.batch(batch);
          stats.messages += batch.length;
          batch = [];
        }
      }
      if (batch.length) {
        await db.batch(batch);
        stats.messages += batch.length;
      }
    } catch (e) {
      stats.errors.push(`会話の取り込みに失敗: ${e instanceof Error ? e.message : String(e)}`);
      if (stats.errors.length > 20) break;
    }
  }
  return stats;
}

export async function importProjects(db: D1Database, list: unknown): Promise<ImportStats> {
  let items: any[];
  if (Array.isArray(list)) items = list;
  else if (list && typeof list === "object" && Array.isArray((list as any).projects)) {
    items = (list as any).projects;
  } else {
    throw new Error("projects.json の配列を送信してください");
  }

  const stats: ImportStats = { imported: 0, updated: 0, messages: 0, skipped: 0, errors: [] };

  for (const proj of items) {
    try {
      const name = asString(proj?.name).trim();
      if (!name) {
        stats.skipped++;
        continue;
      }
      const pid = await ensureProject(db, name);
      const desc = asString(proj?.description) || asString(proj?.prompt_template);
      if (pid && desc) {
        await db.prepare("UPDATE projects SET description = ? WHERE id = ?").bind(desc.slice(0, 5000), pid).run();
      }
      stats.imported++;

      // プロジェクトのナレッジ(docs)は note として保存(再取込時は差し替え)
      const docs: any[] = Array.isArray(proj?.docs) ? proj.docs : [];
      for (const doc of docs) {
        const content = asString(doc?.content).trim();
        if (!content || !pid) continue;
        const title = (asString(doc?.filename) || "project-doc").slice(0, 200);
        await db
          .prepare("DELETE FROM memories WHERE project_id = ? AND kind = 'note' AND source = 'import' AND title = ?")
          .bind(pid, title)
          .run();
        await db
          .prepare("INSERT INTO memories (kind, title, content, source, project_id) VALUES ('note', ?, ?, 'import', ?)")
          .bind(title, content.slice(0, 50000), pid)
          .run();
        stats.messages++;
      }
    } catch (e) {
      stats.errors.push(`プロジェクトの取り込みに失敗: ${e instanceof Error ? e.message : String(e)}`);
      if (stats.errors.length > 20) break;
    }
  }
  return stats;
}
