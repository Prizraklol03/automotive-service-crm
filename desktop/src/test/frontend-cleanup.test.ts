import fs, { type Dirent } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

function getSourceFiles(rootDir: string): string[] {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });

  return entries.flatMap((entry: Dirent) => {
    const nextPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "test") {
        return [];
      }
      return getSourceFiles(nextPath);
    }

    if (!entry.name.endsWith(".ts") && !entry.name.endsWith(".tsx")) {
      return [];
    }

    if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx")) {
      return [];
    }

    return [nextPath];
  });
}

function readActiveSource(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const sourceRoot = path.resolve(currentDir, "..");
  const sources = getSourceFiles(sourceRoot);
  return sources.map((filePath) => fs.readFileSync(filePath, "utf8")).join("\n");
}

const CANONICAL_LABELS = [
  "\u041e\u0431\u043e\u0440\u043e\u0442",
  "\u0420\u0430\u0441\u0445\u043e\u0434\u043d\u0438\u043a\u0438",
  "\u0412\u0430\u043b\u043e\u0432\u0430\u044f \u043f\u0440\u0438\u0431\u044b\u043b\u044c",
  "\u0424\u0438\u043d\u0430\u043d\u0441\u043e\u0432\u044b\u0435 \u0440\u0430\u0441\u0445\u043e\u0434\u044b",
  "\u0427\u0438\u0441\u0442\u044b\u0439 \u0440\u0435\u0437\u0443\u043b\u044c\u0442\u0430\u0442",
  "\u041d\u043e\u0432\u044b\u0439",
  "\u0412 \u0440\u0430\u0431\u043e\u0442\u0435",
  "\u0413\u043e\u0442\u043e\u0432\u043e",
  "\u0412\u044b\u0434\u0430\u043d",
  "\u041e\u0442\u043c\u0435\u043d\u0451\u043d",
];

const MOJIBAKE_MARKERS = [
  "\u0420\u2019\u0421\u2039\u0421\u20ac\u0421\u201c\u0421\u201a\u0420\u00a7\u0420\u00ba\u0430",
  "\u0420\u045e\u0420\u00b1\u0420\u0405\u0420\u201a\u0420\u00be\u0421\u201a",
  "\u0420\u2019\u0420\u00b0\u0420\u00bb\u0420\u0455\u0420\u00a0\u0420\u00b0\u0421\u040f",
  "\u0420\u00a4\u0420\u0451\u0420\u00a0\u0420\u2026\u0420\u00b0\u0420\u2026\u0421\u040e\u0420\u0405\u0420\u00a0\u0421\u2019\u0420\u00b5",
  "\u0420\u00a7\u0420\u0451\u0421\u0403\u0421\u201a\u0421\u2039\u0420\u00b9",
];

const REFRESH_BUTTON_GUARD_FILES = [
  "pages/analytics-page.tsx",
  "pages/notifications-page.tsx",
  "pages/documents-page.tsx",
  "pages/services-page.tsx",
  "pages/calendar-page.tsx",
  "features/inspection/ui/inspection-order-section.tsx"
] as const;

describe("frontend cleanup guard", () => {
  it("keeps forbidden legacy imports out of the active source tree", () => {
    const content = readActiveSource();

    expect(content).not.toContain("@mantine/core");
    expect(content).not.toContain("@tanstack/react-router");
    expect(content).not.toContain("@tabler/icons-react");
    expect(content).not.toContain("../api/crm");
    expect(content).not.toContain("frontend-v2");
    expect(content).not.toContain("discount_rub");
    MOJIBAKE_MARKERS.forEach((marker) => {
      expect(content).not.toContain(marker);
    });
    expect(content).not.toContain("window.localStorage.setItem");
    expect(content).not.toContain("window.localStorage.getItem");
    expect(content).not.toContain("window.sessionStorage.setItem");
    expect(content).not.toContain("@/tauri/bridge");
  });

  it("keeps canonical Russian analytics and status labels readable", () => {
    const content = readActiveSource();

    CANONICAL_LABELS.forEach((label) => {
      expect(content).toContain(label);
    });
  });

  it("does not keep user-facing refresh buttons in the active desktop source files", () => {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const sourceRoot = path.resolve(currentDir, "..");

    REFRESH_BUTTON_GUARD_FILES.forEach((relativePath) => {
      const filePath = path.join(sourceRoot, relativePath);
      const content = fs.readFileSync(filePath, "utf8");
      expect(content).not.toMatch(/<AppButton[\s\S]*?Обновить[\s\S]*?<\/AppButton>/);
      expect(content).not.toMatch(/aria-label\s*=\s*["']Обновить["']/);
      expect(content).not.toMatch(/title\s*=\s*["']Обновить["']/);
    });
  });
});
