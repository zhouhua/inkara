/**
 * Incrementally extract the "reply" (and "transcription") string fields
 * from a model that streams a JSON object like:
 * {"transcription":"...","reply":"..."}
 */

export type ReplyExtractResult = {
  deltas: string;
  transcription: string | null;
  reply: string;
  replyComplete: boolean;
};

export function createJsonReplyExtractor() {
  let raw = "";
  let emitted = 0;
  let transcription: string | null = null;

  return {
    push(chunk: string): ReplyExtractResult {
      raw += chunk;

      const tr = readJsonStringField(raw, "transcription");
      if (tr?.complete) transcription = tr.value;

      const replyField = readJsonStringField(raw, "reply");
      const reply = replyField?.value ?? "";
      const deltas = reply.slice(emitted);
      emitted = reply.length;

      return {
        deltas,
        transcription,
        reply,
        replyComplete: !!replyField?.complete,
      };
    },
    getRaw() {
      return raw;
    },
  };
}

function readJsonStringField(
  source: string,
  field: string
): { value: string; complete: boolean } | null {
  const marker = new RegExp(`"${field}"\\s*:\\s*"`);
  const match = marker.exec(source);
  if (!match) return null;

  let i = match.index + match[0].length;
  let value = "";
  let escaped = false;

  while (i < source.length) {
    const ch = source[i];

    if (escaped) {
      const mapped = unescapeJsonChar(source, i);
      value += mapped.char;
      i += mapped.advance;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      i += 1;
      continue;
    }

    if (ch === '"') {
      return { value, complete: true };
    }

    value += ch;
    i += 1;
  }

  return { value, complete: false };
}

function unescapeJsonChar(
  source: string,
  i: number
): { char: string; advance: number } {
  const ch = source[i];
  switch (ch) {
    case "n":
      return { char: "\n", advance: 1 };
    case "r":
      return { char: "\r", advance: 1 };
    case "t":
      return { char: "\t", advance: 1 };
    case "b":
      return { char: "\b", advance: 1 };
    case "f":
      return { char: "\f", advance: 1 };
    case '"':
    case "\\":
    case "/":
      return { char: ch, advance: 1 };
    case "u": {
      const hex = source.slice(i + 1, i + 5);
      if (/^[0-9a-fA-F]{4}$/.test(hex)) {
        return { char: String.fromCharCode(parseInt(hex, 16)), advance: 5 };
      }
      return { char: "u", advance: 1 };
    }
    default:
      return { char: ch ?? "", advance: 1 };
  }
}
