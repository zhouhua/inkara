import { describe, expect, it } from "vitest";
import { getStroke } from "perfect-freehand";
import {
  getSvgPathFromStroke,
  inkStrokeOptions,
  normalizePressure,
  strokeSize,
  strokeWidth,
} from "./strokes";

describe("normalizePressure", () => {
  it("maps missing / default 0.5 to mid comfort", () => {
    expect(normalizePressure(0)).toBe(0.5);
    expect(normalizePressure(0.5)).toBe(0.5);
  });

  it("applies dead zone and soft ceiling", () => {
    expect(normalizePressure(0.08)).toBeCloseTo(0.28, 5);
    expect(normalizePressure(0.92)).toBeCloseTo(1, 5);
    expect(normalizePressure(1)).toBeCloseTo(1, 5);
  });
});

describe("strokeSize / strokeWidth", () => {
  it("keeps mid diameter aligned with legacy mid width", () => {
    expect(strokeSize(1, false)).toBeCloseTo(strokeWidth(0.5, 1, false), 5);
    expect(strokeSize(2, true)).toBeCloseTo(strokeWidth(0.5, 2, true), 5);
  });
});

describe("inkStrokeOptions", () => {
  it("uses real pressure for pen, simulated for mouse/touch", () => {
    expect(
      inkStrokeOptions(1, { simulatePressure: false }).simulatePressure,
    ).toBe(false);
    expect(
      inkStrokeOptions(1, { simulatePressure: true }).simulatePressure,
    ).toBe(true);
  });

  it("keeps streamline / smoothing in the Quickdraw band", () => {
    const pen = inkStrokeOptions(1, { simulatePressure: false });
    expect(pen.streamline).toBe(0.6);
    expect(pen.smoothing).toBe(0.6);
    expect(pen.thinning).toBe(0.6);
  });
});

describe("getSvgPathFromStroke", () => {
  it("returns empty for tiny outlines", () => {
    expect(getSvgPathFromStroke([])).toBe("");
    expect(getSvgPathFromStroke([[0, 0]])).toBe("");
  });

  it("builds a closed path from perfect-freehand outline", () => {
    const outline = getStroke(
      [
        [0, 0, 0.5],
        [10, 4, 0.6],
        [22, 8, 0.7],
        [40, 6, 0.55],
      ],
      inkStrokeOptions(1, { simulatePressure: false, last: true }),
    );
    expect(outline.length).toBeGreaterThan(4);
    const d = getSvgPathFromStroke(outline);
    expect(d.startsWith("M ")).toBe(true);
    expect(d.endsWith("Z")).toBe(true);
    expect(d).toContain(" Q ");
  });
});
