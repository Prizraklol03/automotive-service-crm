import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(process.cwd(), "src");
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".css", ".scss", ".html", ".mjs", ".cjs", ".yaml", ".yml"]);
const MOJIBAKE_RE = /(?:[РС][^\x00-\x7F\s]){2,}|\u00d0|\u00d1|\uFFFD/;

async function collectFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(fullPath)));
      continue;
    }
    if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("UTF-8 guard", () => {
  it("does not contain mojibake in desktop/src", async () => {
    const files = await collectFiles(ROOT);
    const suspicious: Array<{ file: string; line: number; text: string }> = [];

    for (const file of files) {
      const relativeFile = path.relative(ROOT, file).replaceAll(path.sep, "/");
      if (relativeFile === "test/utf8_guard.test.ts") {
        continue;
      }
      const content = await readFile(file, "utf8");
      content.split(/\r?\n/).forEach((line, index) => {
        if (MOJIBAKE_RE.test(line)) {
          suspicious.push({
            file: relativeFile,
            line: index + 1,
            text: line.trim(),
          });
        }
      });
    }

    expect(suspicious, suspicious.map((item) => `${item.file}:${item.line} ${item.text}`).join("\n")).toEqual([]);
  });
});
