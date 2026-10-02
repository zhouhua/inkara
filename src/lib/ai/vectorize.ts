/** Cloudflare Vectorize binding for page embeddings (bge-m3, 1024-d). */

export const VECTOR_DIMS = 1024;
export const VECTOR_TOP_K = 16;

export type VectorizeVector = {
  id: string;
  values: number[] | Float32Array;
  namespace?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type VectorizeMatch = {
  id: string;
  score: number;
  namespace?: string;
  metadata?: Record<string, unknown>;
};

export type VectorizeIndex = {
  upsert: (vectors: VectorizeVector[]) => Promise<{ mutationId?: string } | void>;
  query: (
    vector: number[] | Float32Array,
    options?: {
      topK?: number;
      namespace?: string;
      filter?: Record<string, unknown>;
      returnValues?: boolean;
      returnMetadata?: "none" | "indexed" | "all";
    },
  ) => Promise<{ matches?: VectorizeMatch[]; count?: number }>;
  deleteByIds: (ids: string[]) => Promise<{ mutationId?: string } | void>;
  getByIds: (ids: string[]) => Promise<VectorizeVector[]>;
};

export async function resolveVectorize(): Promise<VectorizeIndex | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    return (env as { VECTORIZE?: VectorizeIndex }).VECTORIZE ?? null;
  } catch {
    return null;
  }
}

export function toNumberArray(v: number[] | Float32Array): number[] {
  return Array.isArray(v) ? v : Array.from(v);
}

/** Upsert one page embedding under subject namespace. */
export async function upsertPageVector(
  index: VectorizeIndex,
  subjectId: string,
  pageId: string,
  values: number[] | Float32Array,
): Promise<void> {
  const arr = toNumberArray(values);
  if (arr.length !== VECTOR_DIMS) {
    throw new Error(`vector dims ${arr.length} != ${VECTOR_DIMS}`);
  }
  await index.upsert([
    {
      id: pageId,
      values: arr,
      namespace: subjectId,
      metadata: { subjectId, pageId },
    },
  ]);
}

export async function deletePageVectors(
  index: VectorizeIndex,
  pageIds: string[],
): Promise<void> {
  if (pageIds.length === 0) return;
  // Vectorize deleteByIds typically accepts batches; chunk for safety.
  const CHUNK = 100;
  for (let i = 0; i < pageIds.length; i += CHUNK) {
    await index.deleteByIds(pageIds.slice(i, i + CHUNK));
  }
}

/** Re-namespace vectors when anon content merges into a user. */
export async function reNamespacePageVectors(
  index: VectorizeIndex,
  pageIds: string[],
  toSubjectId: string,
): Promise<void> {
  if (pageIds.length === 0) return;
  const CHUNK = 20;
  for (let i = 0; i < pageIds.length; i += CHUNK) {
    const chunk = pageIds.slice(i, i + CHUNK);
    const existing = await index.getByIds(chunk);
    if (!existing?.length) continue;
    await index.upsert(
      existing
        .filter((v) => v.values && toNumberArray(v.values).length === VECTOR_DIMS)
        .map((v) => ({
          id: v.id,
          values: toNumberArray(v.values),
          namespace: toSubjectId,
          metadata: {
            ...(typeof v.metadata === "object" && v.metadata ? v.metadata : {}),
            subjectId: toSubjectId,
            pageId: v.id,
          },
        })),
    );
  }
}

export async function queryPageVectors(
  index: VectorizeIndex,
  subjectId: string,
  queryVec: number[] | Float32Array,
  topK = VECTOR_TOP_K,
): Promise<VectorizeMatch[]> {
  const arr = toNumberArray(queryVec);
  if (arr.length !== VECTOR_DIMS) return [];
  const res = await index.query(arr, {
    topK,
    namespace: subjectId,
    returnMetadata: "indexed",
  });
  return res.matches ?? [];
}
