const Rh = 67108864;
class yx extends Error {
  constructor(e5, t2, n2) {
    super(t2, n2), this.code = e5, this.name = "TmmV2ArchiveError";
  }
}
function bx(e5, t2, n2) {
  throw new yx(e5, t2, void 0 === n2 ? void 0 : { cause: n2 });
}
function _x(e5) {
  (!e5 || Buffer.byteLength(e5, "utf8") > 1024) && bx("TMM_V2_UNSAFE_ENTRY", "\u5F52\u6863\u6761\u76EE\u540D\u79F0\u4E3A\u7A7A\u6216\u8FC7\u957F"), (e5.includes("\\") || e5.startsWith("/") || /^[A-Za-z]:/.test(e5) || e5.endsWith("/")) && bx("TMM_V2_UNSAFE_ENTRY", `\u62D2\u7EDD\u4E0D\u5B89\u5168\u5F52\u6863\u6761\u76EE\uFF1A${e5}`);
  return e5.split("/").some((e6) => !e6 || "." === e6 || ".." === e6) && bx("TMM_V2_UNSAFE_ENTRY", `\u62D2\u7EDD\u8DEF\u5F84\u7A7F\u8D8A\u6216\u5F02\u5E38\u5F52\u6863\u6761\u76EE\uFF1A${e5}`), e5;
}
function Sx(e5, t2) {
  let n2;
  try {
    n2 = JSON.stringify(e5);
  } catch (a2) {
    bx("TMM_V2_JSON_INVALID", `${t2} \u65E0\u6CD5\u5E8F\u5217\u5316`, a2);
  }
  void 0 === n2 && bx("TMM_V2_JSON_INVALID", `${t2} \u4E0D\u80FD\u662F undefined`);
  const r2 = Buffer.from(n2, "utf8");
  return r2.length > Rh && bx("TMM_V2_LIMIT_EXCEEDED", `${t2} \u8D85\u8FC7 64 MiB \u5B89\u5168\u4E0A\u9650`), r2;
}

export { _x as originalEntryPath, Sx as originalJsonBytes };
