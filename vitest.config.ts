import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Worker worktrees and local tooling live under ignored var/, not this suite.
  test: { include: ['test/**/*.test.{ts,tsx}'] },
});
