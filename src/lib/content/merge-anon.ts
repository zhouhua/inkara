import type { D1Database } from "@/lib/db-server";
import {
  deletePageVectors,
  reNamespacePageVectors,
  resolveVectorize,
} from "@/lib/ai/vectorize";
import { createD1ContentStore } from "./d1-store";

/** Move anon settings/pages → user; re-namespace Vectorize vectors. */
export async function mergeAnonContent(
  db: D1Database,
  anonSubjectId: string,
  userId: string,
): Promise<{ pagesMoved: number; settingsMoved: boolean }> {
  if (!anonSubjectId || !userId || anonSubjectId === userId) {
    return { pagesMoved: 0, settingsMoved: false };
  }
  const store = createD1ContentStore(db);
  const result = await store.transferContent(anonSubjectId, userId);

  const vectorize = await resolveVectorize();
  if (vectorize) {
    if (result.movedPageIds.length > 0) {
      await reNamespacePageVectors(
        vectorize,
        result.movedPageIds,
        userId,
      );
    }
    const leftover = result.droppedAnonIds.filter(
      (id) => !result.movedPageIds.includes(id),
    );
    if (leftover.length > 0) {
      await deletePageVectors(vectorize, leftover);
    }
  }

  return {
    pagesMoved: result.pagesMoved,
    settingsMoved: result.settingsMoved,
  };
}
