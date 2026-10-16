// Mechanical original source extract: main.js:20528 constants, 20814-20816 lb, 20957-20966 validatePersisted.
const Ey = 25e4, Oy = 8388608;
function lb(e5, t2) {
  return Object.assign(new Error(t2), { code: e5 });
}
export function originalValidatePersisted(e5) {
    if (1 !== e5.schemaVersion || !/^[a-f0-9]{64}$/.test(e5.hashKey) || !Array.isArray(e5.buckets) || e5.buckets.length > Ey || !Number.isSafeInteger(e5.records) || e5.records < 0) throw lb("TMM_V3_INDEX_INTEGRITY", "\u6301\u4E45\u5316\u78C1\u76D8\u7D22\u5F15\u58F0\u660E\u65E0\u6548");
    let t2 = 0, n2 = "";
    const r2 = /* @__PURE__ */ new Set();
    for (const a2 of e5.buckets) {
      if (!/^[0-9a-f-]{36}\.bin$/.test(a2.name) || r2.has(a2.name) || !Number.isSafeInteger(a2.count) || a2.count <= 0 || a2.count > 2e4 || !Number.isSafeInteger(a2.bytes) || a2.bytes <= 0 || a2.bytes > Oy || !/^[a-f0-9]{64}$/.test(a2.sha256) || "string" != typeof a2.first || "string" != typeof a2.last || !/^[a-zA-Z0-9.:-]{1,80}\|[a-f0-9]{64}$/.test(a2.first) || !/^[a-zA-Z0-9.:-]{1,80}\|[a-f0-9]{64}$/.test(a2.last) || a2.first > a2.last || n2 && a2.first <= n2) throw lb("TMM_V3_INDEX_INTEGRITY", "\u6301\u4E45\u5316\u78C1\u76D8\u7D22\u5F15\u6876\u58F0\u660E\u65E0\u6548");
      n2 = a2.last, t2 += a2.count, r2.add(a2.name);
    }
    if (t2 !== e5.records) throw lb("TMM_V3_INDEX_INTEGRITY", "\u6301\u4E45\u5316\u78C1\u76D8\u7D22\u5F15\u8BA1\u6570\u4E0D\u4E00\u81F4");
  }
