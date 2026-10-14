/** The application can share an origin with other applications at a local prefix. */
export function normalizeBasePath(value = "/"): string {
  const path = value.trim() || "/";
  if (!path.startsWith("/") || path.startsWith("//") || /[?#\\]/.test(path) || path.split("/").some(part => part === "." || part === "..")) {
    throw new Error("VITE_BASE_PATH must be an absolute local path, for example /tuomin/");
  }
  return path.replace(/\/+$/, "") + "/";
}

/** Keep signed query strings intact and tolerate already-prefixed backend URLs. */
export function appUrl(path: string, basePath = import.meta.env.BASE_URL): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(path) || path.startsWith("//") || path.startsWith("#")) return path;
  const base = normalizeBasePath(basePath);
  const rooted = path.startsWith("/") ? path : "/" + path;
  const pathname = rooted.split(/[?#]/, 1)[0];
  if (base === "/" || pathname === base.slice(0, -1) || pathname.startsWith(base)) return rooted;
  return base.slice(0, -1) + rooted;
}
