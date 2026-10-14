import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { normalizeBasePath } from "./urls.ts";
const base = normalizeBasePath(process.env.VITE_BASE_PATH);
export default defineConfig({
  base,
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "127.0.0.1",
    port: 5178,
    strictPort: true,
    fs: {
      strict: true,
      allow: [fileURLToPath(new URL(".", import.meta.url))],
      deny: [".env", ".env.*", "**/.data/**", "**/.git/**"],
    },
    proxy: { [`${base}api`]: { target: "http://127.0.0.1:4318", rewrite: path => base === "/" ? path : path.slice(base.length - 1) } },
  },
  build: { outDir: "../../dist/web", emptyOutDir: true },
});
