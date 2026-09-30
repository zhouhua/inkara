import type { ReactNode } from "react";
import { InkKbd } from "@/components/InkKbd";

const KBD_RE = /\[\[([^\]]+)\]\]/g;

/** Renders help copy with `[[Enter]]`-style markers as ink keycaps. */
export function HelpText({ text }: { text: string }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  const re = new RegExp(KBD_RE.source, "g");

  while ((match = re.exec(text)) !== null) {
    if (match.index > last) {
      nodes.push(text.slice(last, match.index));
    }
    nodes.push(<InkKbd key={`k${i++}`}>{match[1]}</InkKbd>);
    last = match.index + match[0].length;
  }

  if (last < text.length) {
    nodes.push(text.slice(last));
  }

  return <>{nodes}</>;
}
