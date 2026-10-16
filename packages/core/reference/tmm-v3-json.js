// Mechanically adapted from readable/main.js:21618-21629 (vb). Only the
// bundle-local error constructor and name were changed for this module.
const Ay = 134217728;
function Ib(code, message, cause) { throw Object.assign(new Error(message, cause === undefined ? undefined : { cause }), { code }); }
function vb(e5, t2, n2 = Ay) {
  let r2;
  try {
    r2 = JSON.stringify(e5);
  } catch (s2) {
    Ib("TMM_V3_JSON_INVALID", `${t2} 无法序列化`, s2);
  }
  void 0 === r2 && Ib("TMM_V3_JSON_INVALID", `${t2} 不能是 undefined`);
  const a2 = Buffer.from(r2, "utf8");
  return a2.length > n2 && Ib("TMM_V3_BASE_STATE_TOO_LARGE", `${t2} 的非集合状态超过安全上限`), a2;
}
export { vb as originalV3JsonBytes };
