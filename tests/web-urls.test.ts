import { expect, test } from "vitest";
import { appUrl, normalizeBasePath } from "../apps/web/urls.ts";

test("root deployment keeps existing API and resource paths", () => {
  for (const path of ["/api/auth/me", "/api/projects/p/dictionary.xlsx?revision=7", "/assets/app.js"]) {
    expect(appUrl(path, "/")).toBe(path);
  }
  expect(normalizeBasePath()).toBe("/");
  expect(normalizeBasePath("")).toBe("/");
});

test("subpath keeps requests, uploads, dictionary and page images inside application prefix", () => {
  for (const path of ["/api/auth/me", "/api/projects/p/upload-batches?limit=10&offset=0", "/api/projects/p/files?batchId=b&requestId=r", "/api/projects/p/dictionary.xlsx?revision=7", "/api/documents/d/pages/0?revision=3", "/api/documents/d/pages/0/preview"]) {
    expect(appUrl(path, "/tuomin/")).toBe("/tuomin" + path);
  }
  expect(appUrl("api/projects", "/tuomin")).toBe("/tuomin/api/projects");
  expect(normalizeBasePath("/tuomin")).toBe("/tuomin/");
});

test("signed download URLs retain exact query bytes and never get a second prefix", () => {
  const path = "/api/download/token?signature=a%2Fb%2B%3D&name=x+y&expires=123";
  expect(appUrl(path, "/tuomin/")).toBe("/tuomin" + path);
  expect(appUrl("/tuomin" + path, "/tuomin/")).toBe("/tuomin" + path);
  expect(appUrl("/tuomin?x=1#section", "/tuomin/")).toBe("/tuomin?x=1#section");
});

test("prefix matching respects segment boundaries and supports nested mounts", () => {
  expect(appUrl("/tuomin-other/api", "/tuomin/")).toBe("/tuomin/tuomin-other/api");
  expect(appUrl("/api/health", "/tools/tuomin/")).toBe("/tools/tuomin/api/health");
  expect(appUrl("/tools/tuomin/api/health", "/tools/tuomin/")).toBe("/tools/tuomin/api/health");
});

test("absolute downloads, generated blob previews and anchors remain unchanged", () => {
  for (const path of ["https://example.test/file?a=%2B", "//example.test/file", "blob:https://example.test/id", "data:image/png;base64,YQ==", "#review"]) {
    expect(appUrl(path, "/tuomin/")).toBe(path);
  }
});

test("invalid deployment bases fail instead of silently routing to another origin", () => {
  for (const base of ["https://example.test/", "//example.test/", "tuomin/", "/tuomin?x=1", "/tuomin#x", "/../tuomin/", "/tuomin\\api"]) {
    expect(() => normalizeBasePath(base)).toThrow("VITE_BASE_PATH");
  }
});
