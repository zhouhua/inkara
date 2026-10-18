import type { ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { EMBEDDING_DIMS, EMBEDDING_MODEL } from "@/lib/ai/embed";
import {
  toNumberArray,
  type VectorizeIndex,
  type VectorizeMatch,
  type VectorizeVector,
} from "@/lib/ai/vectorize";
import { getMysqlPool } from "@/lib/mysql-d1";

function toVectorText(values: number[] | Float32Array): string {
  return `[${toNumberArray(values).join(",")}]`;
}

function parseVectorText(text: string): number[] {
  const parsed = JSON.parse(text) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.map((n) => Number(n));
}

/** RDS VECTOR(1024) HNSW cosine. Distance 0 = identical; score is similarity. */
export function createMysqlVectorize(): VectorizeIndex {
  const pool = getMysqlPool();
  return {
    async upsert(vectors) {
      for (const vector of vectors) {
        const values = toNumberArray(vector.values);
        if (values.length !== EMBEDDING_DIMS) {
          throw new Error(`vector dims ${values.length} != ${EMBEDDING_DIMS}`);
        }
        const subjectId =
          vector.namespace ??
          (typeof vector.metadata?.subjectId === "string"
            ? vector.metadata.subjectId
            : "");
        if (!subjectId) throw new Error("vector namespace missing");
        await pool.query(
          `INSERT INTO page_embeddings (page_id, subject_id, dims, model, embedding)
           VALUES (?, ?, ?, ?, VEC_FROMTEXT(?))
           ON DUPLICATE KEY UPDATE
             subject_id = VALUES(subject_id),
             dims = VALUES(dims),
             model = VALUES(model),
             embedding = VALUES(embedding)`,
          [
            vector.id,
            subjectId,
            values.length,
            EMBEDDING_MODEL,
            toVectorText(values),
          ],
        );
      }
    },

    async query(vector, options) {
      const values = toNumberArray(vector);
      const namespace = options?.namespace;
      if (!namespace || values.length !== EMBEDDING_DIMS) {
        return { matches: [], count: 0 };
      }
      const topK = options?.topK ?? 16;
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT page_id, subject_id,
                VEC_DISTANCE_COSINE(embedding, VEC_FROMTEXT(?)) AS distance
         FROM page_embeddings
         WHERE subject_id = ?
         ORDER BY distance ASC
         LIMIT ?`,
        [toVectorText(values), namespace, topK],
      );
      const matches: VectorizeMatch[] = [];
      for (const row of rows) {
        const distance = Number(row.distance);
        if (!Number.isFinite(distance)) continue;
        matches.push({
          id: String(row.page_id),
          score: Math.max(0, Math.min(1, 1 - distance)),
          namespace: String(row.subject_id),
          metadata: {
            subjectId: String(row.subject_id),
            pageId: String(row.page_id),
          },
        });
      }
      return { matches, count: matches.length };
    },

    async deleteByIds(ids) {
      if (ids.length === 0) return;
      const placeholders = ids.map(() => "?").join(", ");
      await pool.query<ResultSetHeader>(
        `DELETE FROM page_embeddings WHERE page_id IN (${placeholders})`,
        ids,
      );
    },

    async getByIds(ids) {
      if (ids.length === 0) return [];
      const placeholders = ids.map(() => "?").join(", ");
      const [rows] = await pool.query<RowDataPacket[]>(
        `SELECT page_id, subject_id, VEC_TOTEXT(embedding) AS embedding
         FROM page_embeddings
         WHERE page_id IN (${placeholders})`,
        ids,
      );
      const found: VectorizeVector[] = [];
      for (const row of rows) {
        const text = String(row.embedding ?? "");
        if (!text) continue;
        found.push({
          id: String(row.page_id),
          values: parseVectorText(text),
          namespace: String(row.subject_id),
          metadata: {
            subjectId: String(row.subject_id),
            pageId: String(row.page_id),
          },
        });
      }
      return found;
    },
  };
}
