import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/dist/**", "**/node_modules/**", "**/.worktrees/**"],
    projects: [
      "packages/*",
      "apps/*",
      "adapters/*",
      "ops",
      "!**/.worktrees/**",
    ],
  },
});
