import path from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  test: {
    browser: {
      enabled: false,
      name: "chromium",
      provider: "playwright"
    },
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["src/test/browser-smoke.browser.test.tsx"],
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"]
  }
});
