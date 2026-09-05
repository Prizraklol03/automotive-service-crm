import { describe, expect, it } from "vitest";

import {
  canDeleteInspectionVertex,
  canUndoInspectionGeometry,
  deleteInspectionVertex,
} from "@/features/inspection/ui/inspection-canvas";

describe("inspection canvas geometry helpers", () => {
  it("allows deleting polygon vertices only when shape stays valid", () => {
    const triangle = [
      { x: 0.1, y: 0.1 },
      { x: 0.5, y: 0.1 },
      { x: 0.3, y: 0.6 },
    ];
    const quad = [...triangle, { x: 0.7, y: 0.7 }];

    expect(canDeleteInspectionVertex("polygon", triangle, 1)).toBe(false);
    expect(canDeleteInspectionVertex("polygon", quad, 1)).toBe(true);
    expect(deleteInspectionVertex(quad, 1)).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.3, y: 0.6 },
      { x: 0.7, y: 0.7 },
    ]);
  });

  it("does not allow deleting point geometry or null selection", () => {
    expect(canDeleteInspectionVertex("point", [{ x: 0.4, y: 0.4 }], 0)).toBe(false);
    expect(canDeleteInspectionVertex("line", [{ x: 0.1, y: 0.1 }, { x: 0.7, y: 0.7 }], null)).toBe(false);
  });

  it("reports undo availability only when there is prior geometry state", () => {
    expect(canUndoInspectionGeometry([])).toBe(false);
    expect(canUndoInspectionGeometry([[{ x: 0.2, y: 0.2 }]])).toBe(false);
    expect(
      canUndoInspectionGeometry([
        [{ x: 0.2, y: 0.2 }],
        [{ x: 0.4, y: 0.5 }],
      ]),
    ).toBe(true);
  });
});
