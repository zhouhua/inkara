import type { AppSettings } from "@/lib/settings";
import type { MemoryPage } from "@/lib/memory";
import type { D1Database } from "@/lib/db-server";

const MAX_PAGES = 5000;

export function createD1ContentStore(db: D1Database) {
  return {
    async getSettings(subjectId: string): Promise<AppSettings | null> {
      const row = await db
        .prepare(
          `SELECT locale, paper_style, input_mode, submit_mode, idle_pace, has_committed_once
           FROM user_settings WHERE subject_id = ?`,
        )
        .bind(subjectId)
        .first<{
          locale: string;
          paper_style: string;
          input_mode: string;
          submit_mode: string;
          idle_pace: string;
          has_committed_once: number;
        }>();
      if (!row) return null;
      return {
        locale: row.locale as AppSettings["locale"],
        paperStyle: row.paper_style as AppSettings["paperStyle"],
        inputMode: row.input_mode as AppSettings["inputMode"],
        submitMode: row.submit_mode as AppSettings["submitMode"],
        idlePace: row.idle_pace as AppSettings["idlePace"],
        hasCommittedOnce: row.has_committed_once === 1,
      };
    },

    async upsertSettings(subjectId: string, s: AppSettings): Promise<void> {
      await db
        .prepare(
          `INSERT INTO user_settings
             (subject_id, locale, paper_style, input_mode, submit_mode, idle_pace, has_committed_once, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
           ON CONFLICT(subject_id) DO UPDATE SET
             locale = excluded.locale,
             paper_style = excluded.paper_style,
             input_mode = excluded.input_mode,
             submit_mode = excluded.submit_mode,
             idle_pace = excluded.idle_pace,
             has_committed_once = excluded.has_committed_once,
             updated_at = datetime('now')`,
        )
        .bind(
          subjectId,
          s.locale,
          s.paperStyle,
          s.inputMode,
          s.submitMode,
          s.idlePace,
          s.hasCommittedOnce ? 1 : 0,
        )
        .run();
    },

    async listPages(subjectId: string): Promise<MemoryPage[]> {
      const { results } = await db
        .prepare(
          `SELECT id, created_at, transcription, reply
           FROM pages WHERE subject_id = ?
           ORDER BY created_at ASC
           LIMIT ?`,
        )
        .bind(subjectId, MAX_PAGES)
        .all<{
          id: string;
          created_at: number;
          transcription: string;
          reply: string;
        }>();
      return (results ?? []).map((r) => ({
        id: r.id,
        createdAt: r.created_at,
        transcription: r.transcription,
        reply: r.reply,
      }));
    },

    async listPageIds(subjectId: string): Promise<string[]> {
      const { results } = await db
        .prepare(`SELECT id FROM pages WHERE subject_id = ?`)
        .bind(subjectId)
        .all<{ id: string }>();
      return (results ?? []).map((r) => r.id);
    },

    async insertPage(
      subjectId: string,
      page: MemoryPage,
    ): Promise<{ droppedIds: string[] }> {
      await db
        .prepare(
          `INSERT INTO pages (id, subject_id, created_at, transcription, reply)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(
          page.id,
          subjectId,
          page.createdAt,
          page.transcription,
          page.reply,
        )
        .run();
      const row = await db
        .prepare(`SELECT COUNT(*) AS n FROM pages WHERE subject_id = ?`)
        .bind(subjectId)
        .first<{ n: number }>();
      const n = row?.n ?? 0;
      if (n <= MAX_PAGES) return { droppedIds: [] };

      const drop = n - MAX_PAGES;
      const { results } = await db
        .prepare(
          `SELECT id FROM pages WHERE subject_id = ?
           ORDER BY created_at ASC LIMIT ?`,
        )
        .bind(subjectId, drop)
        .all<{ id: string }>();
      const droppedIds = (results ?? []).map((r) => r.id);
      if (droppedIds.length > 0) {
        await db
          .prepare(
            `DELETE FROM pages WHERE id IN (
               SELECT id FROM pages WHERE subject_id = ?
               ORDER BY created_at ASC LIMIT ?
             )`,
          )
          .bind(subjectId, drop)
          .run();
      }
      return { droppedIds };
    },

    async deletePage(subjectId: string, pageId: string): Promise<boolean> {
      const existing = await db
        .prepare(`SELECT id FROM pages WHERE id = ? AND subject_id = ?`)
        .bind(pageId, subjectId)
        .first<{ id: string }>();
      if (!existing) return false;
      await db
        .prepare(`DELETE FROM pages WHERE id = ? AND subject_id = ?`)
        .bind(pageId, subjectId)
        .run();
      return true;
    },

    async clearPages(subjectId: string): Promise<string[]> {
      const ids = await this.listPageIds(subjectId);
      await db
        .prepare(`DELETE FROM pages WHERE subject_id = ?`)
        .bind(subjectId)
        .run();
      return ids;
    },

    async transferContent(fromSubject: string, toSubject: string): Promise<{
      pagesMoved: number;
      settingsMoved: boolean;
      movedPageIds: string[];
      droppedAnonIds: string[];
    }> {
      if (!fromSubject || !toSubject || fromSubject === toSubject) {
        return {
          pagesMoved: 0,
          settingsMoved: false,
          movedPageIds: [],
          droppedAnonIds: [],
        };
      }

      const toSettings = await this.getSettings(toSubject);
      let settingsMoved = false;
      if (!toSettings) {
        const fromSettings = await this.getSettings(fromSubject);
        if (fromSettings) {
          await this.upsertSettings(toSubject, fromSettings);
          settingsMoved = true;
        }
      }
      await db
        .prepare(`DELETE FROM user_settings WHERE subject_id = ?`)
        .bind(fromSubject)
        .run();

      const pages = await this.listPages(fromSubject);
      const movedPageIds: string[] = [];
      for (const page of pages) {
        const clash = await db
          .prepare(`SELECT id FROM pages WHERE id = ?`)
          .bind(page.id)
          .first<{ id: string }>();
        if (clash) continue;
        await db
          .prepare(
            `UPDATE pages SET subject_id = ? WHERE id = ? AND subject_id = ?`,
          )
          .bind(toSubject, page.id, fromSubject)
          .run();
        movedPageIds.push(page.id);
      }
      const droppedAnonIds = await this.clearPages(fromSubject);

      return {
        pagesMoved: movedPageIds.length,
        settingsMoved,
        movedPageIds,
        droppedAnonIds,
      };
    },
  };
}

export type D1ContentStore = ReturnType<typeof createD1ContentStore>;
