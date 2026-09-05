import { describe, expect, it } from "vitest";

import { createDefaultInspectionChecklist, INSPECTION_CHECKLIST_DEFINITIONS } from "@/features/inspection/model/checklist";
import { INSPECTION_VIEW_ORDER } from "@/features/inspection/model/types";

describe("inspection checklist defaults", () => {
  it("creates a default checklist entry for every definition", () => {
    const checklist = createDefaultInspectionChecklist();

    expect(Object.keys(checklist)).toHaveLength(INSPECTION_CHECKLIST_DEFINITIONS.length);
    for (const definition of INSPECTION_CHECKLIST_DEFINITIONS) {
      expect(checklist[definition.key]).toEqual({
        checked: false,
        label: definition.label,
        note: "",
      });
    }
  });

  it("keeps the fixed order of the six vehicle projections", () => {
    expect(INSPECTION_VIEW_ORDER).toEqual(["front", "rear", "left", "right", "top", "interior"]);
  });
});
