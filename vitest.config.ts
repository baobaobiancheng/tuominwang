import { defineConfig } from "vitest/config";
// Native raster/font tests need CPU time within their existing deadlines.
// Bound only test workers; application and deployment resources are unchanged.
export default defineConfig({ test: { include: ["tests/**/*.test.ts"], maxWorkers: 2 } });
