export type PaperStyleId =
  | "blank"
  | "lines"
  | "dots-sm"
  | "dots-md"
  | "dots-lg"
  | "grid-sm"
  | "grid-md"
  | "grid-lg";

export type PaperStyle = {
  id: PaperStyleId;
  kind: "blank" | "lines" | "dots" | "grid";
  /** CSS length for pattern pitch */
  step?: string;
};

export const paperStyles: PaperStyle[] = [
  { id: "blank", kind: "blank" },
  { id: "lines", kind: "lines" },
  { id: "dots-sm", kind: "dots", step: "16px" },
  { id: "dots-md", kind: "dots", step: "24px" },
  { id: "dots-lg", kind: "dots", step: "32px" },
  { id: "grid-sm", kind: "grid", step: "16px" },
  { id: "grid-md", kind: "grid", step: "24px" },
  { id: "grid-lg", kind: "grid", step: "32px" },
];

export const defaultPaperStyle: PaperStyleId = "lines";

export function isPaperStyleId(value: unknown): value is PaperStyleId {
  return paperStyles.some((p) => p.id === value);
}

export function getPaperStyle(id: PaperStyleId): PaperStyle {
  return paperStyles.find((p) => p.id === id) ?? paperStyles[1];
}
