// Original readable/main.js lines 20572-20643; only error wrapper and export added.
function Wy(code,message){return Object.assign(new Error(message),{code});}
function Yy(e5) {
  return e5.toString(16).padStart(4, "0");
}
function* Gy(e5) {
  yield '"';
  let t2 = "";
  const n2 = function* () {
    if (t2) {
      const e6 = t2;
      t2 = "", yield e6;
    }
  };
  for (let r2 = 0; r2 < e5.length; r2 += 1) {
    const a2 = e5.charCodeAt(r2);
    let s2;
    if (34 === a2) s2 = '\\"';
    else if (92 === a2) s2 = "\\\\";
    else if (8 === a2) s2 = "\\b";
    else if (9 === a2) s2 = "\\t";
    else if (10 === a2) s2 = "\\n";
    else if (12 === a2) s2 = "\\f";
    else if (13 === a2) s2 = "\\r";
    else if (a2 < 32) s2 = `\\u${Yy(a2)}`;
    else if (a2 >= 55296 && a2 <= 56319) {
      const t3 = e5.charCodeAt(r2 + 1);
      t3 >= 56320 && t3 <= 57343 ? (s2 = e5[r2] + e5[r2 + 1], r2 += 1) : s2 = `\\u${Yy(a2)}`;
    } else s2 = a2 >= 56320 && a2 <= 57343 ? `\\u${Yy(a2)}` : e5[r2];
    t2 += s2, t2.length >= 16384 && (yield* n2());
  }
  yield* n2(), yield '"';
}
function qy(e5) {
  return void 0 === e5 || "function" == typeof e5 || "symbol" == typeof e5;
}
function* Jy(e5, t2, n2 = "root") {
  if (qy(e5)) {
    if ("array" === n2) return void (yield "null");
    if ("object" === n2) return;
    throw Wy("TMM_V3_JSON_INVALID", "\u8F7D\u8377\u4E0D\u80FD\u662F undefined\u3001\u51FD\u6570\u6216 Symbol");
  }
  if (null === e5) return void (yield "null");
  if ("string" == typeof e5) return void (yield* Gy(e5));
  if ("boolean" == typeof e5) return void (yield e5 ? "true" : "false");
  if ("number" == typeof e5) return void (yield Number.isFinite(e5) ? String(0 === e5 ? 0 : e5) : "null");
  if ("bigint" == typeof e5) throw Wy("TMM_V3_JSON_INVALID", "\u8F7D\u8377\u4E0D\u80FD\u5305\u542B BigInt");
  const r2 = e5;
  if ("function" == typeof r2.toJSON) {
    const e6 = r2.toJSON("");
    return void (yield* Jy(e6, t2, n2));
  }
  if (t2.has(r2)) throw Wy("TMM_V3_JSON_INVALID", "\u8F7D\u8377\u5305\u542B\u5FAA\u73AF\u5F15\u7528");
  t2.add(r2);
  try {
    if (Array.isArray(r2)) {
      yield "[";
      for (let e7 = 0; e7 < r2.length; e7 += 1) e7 && (yield ","), yield* Jy(r2[e7], t2, "array");
      return void (yield "]");
    }
    yield "{";
    let e6 = false;
    for (const n3 of Object.keys(r2)) {
      const a2 = r2[n3];
      qy(a2) || (e6 && (yield ","), yield* Gy(n3), yield ":", yield* Jy(a2, t2, "object"), e6 = true);
    }
    yield "}";
  } finally {
    t2.delete(r2);
  }
}
function* Xy(e5) {
  for (const t2 of Jy(e5, /* @__PURE__ */ new Set())) yield Buffer.from(t2, "utf8");
}

export const originalV3JsonBuffers = Xy;
