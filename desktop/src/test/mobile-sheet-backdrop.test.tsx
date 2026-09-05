import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";

import { MobileSheet } from "@/shared/ui/mobile-sheet";

function mount(ui: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return {
    root,
    unmount() {
      act(() => root.unmount());
      container.remove();
    }
  };
}

describe("MobileSheet backdrop", () => {
  it("renders a translucent, theme-aware backdrop instead of a solid white wall", () => {
    const { unmount } = mount(
      <MobileSheet onClose={() => undefined}>
        <div>content</div>
      </MobileSheet>
    );

    const backdrop = document.body.querySelector(".fixed.inset-0");
    expect(backdrop).not.toBeNull();
    expect(backdrop?.className).toContain("bg-black/35");
    expect(backdrop?.className).toContain("dark:bg-black/60");
    expect(backdrop?.className).not.toContain("bg-background");
    expect(backdrop?.className).not.toContain("bg-white");

    unmount();
  });
});
