import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

/** Faint ink keycap — paper annotation, not a glossy OS key. */
export function InkKbd({ children }: Props) {
  return <kbd className="ink-kbd">{children}</kbd>;
}
