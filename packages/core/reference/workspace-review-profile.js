// Pure source algorithm: 0.5.9 readable main.js20094-20202; no IO, licensing, keychain or engine invocation.
function Kg(e5) {
  const t2 = e5?.meta?.operationSource, n2 = e5?.source || e5?.meta?.source, r2 = e5?.reviewState?.status || e5?.meta?.reviewState?.status;
  return true === e5?.userAdded || true === e5?.meta?.manual || "manual" === n2 || "manual_batch" === n2 || "user" === t2 || "manual" === t2 || "manual_batch" === t2 || "project-panel" === t2 || false !== e5?.userAdded && ("user_added" === r2 || "user-added" === r2) || "manual_input" === e5?.meta?.imageAnnotationSource;
}
function Yg(e5) {
  return true === e5?.meta?.hiddenByType || true === e5?.hiddenByType || "\u7528\u6237\u53D6\u6D88\u5C55\u793A\uFF1A\u6309\u7C7B\u578B\u9690\u85CF" === e5?.meta?.reviewState?.note;
}
const Gg = /* @__PURE__ */ new Set(["\u516C\u53F8", "\u6709\u9650\u516C\u53F8", "\u96C6\u56E2", "\u4E2D\u56FD", "\u9879\u76EE", "\u5408\u540C", "\u7532\u65B9", "\u4E59\u65B9", "\u672C\u4EBA", "\u672C\u6848", "\u91D1\u989D", "\u5730\u5740", "\u7535\u8BDD", "\u90AE\u7BB1", "\u94F6\u884C", "\u8D26\u53F7"]), qg = new Intl.Collator("zh-CN");
function Jg(e5) {
  return String(e5 || "").normalize("NFKC").replace(/[\s\u00a0\u3000]+/g, "").replace(/[（]/g, "(").replace(/[）]/g, ")").trim();
}
function Xg(e5) {
  let t2 = 2166136261;
  for (let n2 = 0; n2 < e5.length; n2 += 1) t2 ^= e5.charCodeAt(n2), t2 = Math.imul(t2, 16777619);
  return (t2 >>> 0).toString(36);
}
function Zg(e5) {
  const t2 = Jg(e5);
  return t2.length <= 2 || Gg.has(t2) || /^[\d.,，。%％￥¥$()（）+\-/]+$/.test(t2) || /^[\d.,，]+(?:元|万元|亿元|人民币|美元)?$/.test(t2) || /[�]|\?{2,}|[_]{2,}|[A-Za-z0-9]{1,2}$/.test(t2) ? "high" : "normal";
}
function Qg(e5) {
  const t2 = e5.replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")"), n2 = t2.indexOf(":");
  return n2 < 0 ? t2 : `${(function(e6) {
    const t3 = (e6 || "").trim();
    return t3 ? "name_signature" === t3 || "name_cn_signature" === t3 || "name" === t3 || "name_cn" === t3 || t3.startsWith("name_") ? "name_cn" : "org_name" === t3 || t3.startsWith("org_") || t3.startsWith("org_brand_") || t3.startsWith("org_party_") ? "org_name" : "id_card" === t3 || t3.startsWith("id_card_") || "passport" === t3 ? "id_card" : "phone" === t3 || "mobile" === t3 || "landline" === t3 ? "phone" : "bank_card" === t3 ? "bank_card" : "address" === t3 || t3.startsWith("address_") ? "address" : "email" === t3 ? "email" : "website_url" === t3 || "url" === t3 ? "website_url" : "uscc" === t3 || "uscc_old" === t3 || "ein" === t3 ? "uscc" : "wechat_id" === t3 ? "wechat_id" : "plate_cn" === t3 ? "plate_cn" : "securities_account" === t3 ? "securities_account" : "case_number" === t3 ? "case_number" : "cert_no" === t3 ? "cert_no" : "patent_no" === t3 || "filing_no" === t3 ? t3 : "contract_amount" === t3 || t3.startsWith("contract_amount:") ? "contract_amount" : "seal" === t3 || "signature_seal" === t3 ? "seal" : "signature" === t3 || "handwriting" === t3 || "handwritten_signature" === t3 ? "other" : "face" === t3 || "portrait" === t3 ? "face" : "other" : "other";
  })(t2.slice(0, n2))}:${t2.slice(n2 + 1)}`;
}
function ey(e5, t2, n2) {
  const r2 = /* @__PURE__ */ new Map(), a2 = new Set(e5.inheritedPseudonymProfile?.reservedTokens || []), s2 = new Map((e5.projectModeSnapshot?.mergedInto || []).map(([e6, t3]) => [Qg(e6), Qg(t3)]));
  for (const h2 of e5.inheritedPseudonymProfile?.entries || []) h2.key !== h2.canonicalKey && s2.set(Qg(h2.key), Qg(h2.canonicalKey));
  for (const h2 of e5.documents) for (const e6 of h2.review.pseudonymEntries || []) e6.canonicalKey && e6.canonicalKey !== e6.key && s2.set(Qg(e6.key), Qg(e6.canonicalKey));
  const o2 = (e6, t3) => {
    const n3 = Qg(String(e6 || "")), a3 = String(t3 || "").trim();
    if (!n3.includes(":") || !a3) return;
    const s3 = r2.get(n3) || /* @__PURE__ */ new Set();
    s3.add(a3), r2.set(n3, s3);
  };
  for (const h2 of e5.inheritedPseudonymProfile?.entries || []) o2(h2.key, h2.token);
  const i2 = /* @__PURE__ */ new Set();
  for (const h2 of e5.documents) {
    const e6 = h2.review;
    for (const t3 of e6.pseudonymEntries || []) {
      if ("selective" === e6.pseudonymStyle && "pseudonym" !== t3.action) continue;
      for (const e7 of [t3.autoValue, t3.currentValue]) e7?.trim() && a2.add(e7.trim());
      const n3 = Qg(t3.key), c3 = s2.get(n3) || n3;
      if (!i2.has(c3)) {
        for (const e7 of [...r2.keys()]) (s2.get(e7) || e7) === c3 && r2.delete(e7);
        i2.add(c3);
      }
      o2(n3, t3.locked && t3.currentValue?.trim() ? t3.currentValue : "default" === e6.pseudonymStyle ? t3.autoValue : t3.currentValue || t3.autoValue);
    }
  }
  for (const [h2, f2] of e5.projectModeSnapshot?.sharedMapping || []) {
    const e6 = Qg(h2);
    i2.has(s2.get(e6) || e6) || o2(h2, f2);
  }
  const c2 = /* @__PURE__ */ new Map();
  for (const [h2, f2] of r2) {
    const e6 = s2.get(h2) || h2, t3 = c2.get(e6) || /* @__PURE__ */ new Set();
    for (const n3 of f2) t3.add(n3);
    c2.set(e6, t3);
  }
  for (const h2 of r2.keys()) r2.set(h2, c2.get(s2.get(h2) || h2));
  for (const [h2, f2] of c2) r2.has(h2) || r2.set(h2, f2);
  for (const [h2, f2] of s2) {
    const e6 = c2.get(f2);
    e6 && !r2.has(h2) && r2.set(h2, e6);
  }
  const l2 = [...r2].map(([e6, t3]) => ({ key: e6, token: [...t3][0], canonicalKey: s2.get(e6) || e6 })), u2 = [...r2].filter(([, e6]) => e6.size > 1).map(([e6, t3]) => ({ key: e6, choices: [...t3], reason: "multiple-values" })), d2 = (function(e6, t3 = (/* @__PURE__ */ new Date()).toISOString()) {
    const n3 = [], r3 = (e7, t4, r4, a4, s4, o4 = false) => {
      const i4 = String(t4 || "").trim(), c4 = Jg(String(r4 || i4)), l3 = String(a4 || "").trim();
      i4 && c4 && l3 && ("forceDetect" !== e7 || o4 || "high" !== Zg(i4)) && n3.push({ kind: e7, pattern: i4, normalizedPattern: c4, entityType: l3, sourceId: s4, explicit: o4 });
    };
    for (const l3 of e6.documents) if ("image" !== l3.review.kind) for (const e7 of l3.review.entities) Yg(e7) || r3(e7.deleted ? "forceSkip" : "forceDetect", e7.text, e7.normalizedText, e7.type, `${e7.deleted ? "deleted" : "active"}:${l3.id}:${e7.id}`, e7.deleted || Kg(e7));
    else {
      for (const e7 of l3.review.activeBBoxes) r3("forceDetect", e7.text, e7.normalizedText, e7.entityType, `active:${l3.id}:${e7.id}`, e7.userAdded);
      for (const e7 of l3.review.deletedBBoxes) Yg(e7) || r3("forceSkip", e7.text, e7.text, e7.entityType, `deleted:${l3.id}:${e7.id}`, true);
    }
    const a3 = /* @__PURE__ */ new Map();
    for (const l3 of n3) {
      const e7 = `${l3.normalizedPattern}|${l3.entityType}`, t4 = a3.get(e7) || [];
      t4.push(l3), a3.set(e7, t4);
    }
    const s3 = new Map(e6.workspaceCorrections.map((e7) => [`${e7.kind}|${e7.normalizedPattern}|${e7.entityType}`, e7])), o3 = [];
    for (const [l3, u3] of a3) {
      const e7 = u3.filter((e8) => "forceDetect" === e8.kind), n4 = e7.length > 0 ? e7 : u3.filter((e8) => "forceSkip" === e8.kind);
      if (0 === n4.length) continue;
      const r4 = n4[0], a4 = s3.get(`${r4.kind}|${l3}`);
      o3.push({ id: a4?.id || `correction-${Xg(`${r4.kind}|${l3}`)}`, kind: r4.kind, pattern: r4.pattern, normalizedPattern: r4.normalizedPattern, entityType: r4.entityType, matchMode: "exact", sourceDecisionIds: [...new Set(n4.map((e8) => e8.sourceId))], enabled: false !== a4?.enabled, risk: Zg(r4.pattern), createdAt: a4?.createdAt || t3, updatedAt: t3, origin: "imported" === a4?.origin ? "imported" : "automatic", sourceWorkspaceId: a4?.sourceWorkspaceId });
    }
    const i3 = (e7, t4, n4) => JSON.stringify([e7, t4, n4]), c3 = new Map(o3.map((e7) => [i3(e7.kind, e7.normalizedPattern, e7.entityType), e7]));
    for (const l3 of e6.workspaceCorrections.filter((e7) => "imported" === e7.origin)) {
      const e7 = i3(l3.kind, l3.normalizedPattern, l3.entityType), t4 = c3.get(e7);
      if (t4) {
        c3.set(e7, { ...l3, sourceDecisionIds: [.../* @__PURE__ */ new Set([...l3.sourceDecisionIds, ...t4.sourceDecisionIds])] });
        continue;
      }
      const n4 = i3("forceDetect" === l3.kind ? "forceSkip" : "forceDetect", l3.normalizedPattern, l3.entityType), r4 = c3.get(n4);
      if (r4) {
        const e8 = `${l3.normalizedPattern}|${l3.entityType}`;
        if ((a3.get(e8) || []).some((e9) => e9.kind === r4.kind && e9.explicit)) continue;
        c3.delete(n4);
      }
      c3.set(e7, { ...l3, sourceDecisionIds: [...l3.sourceDecisionIds] });
    }
    return [...c3.values()].sort((e7, t4) => e7.entityType.localeCompare(t4.entityType) || qg.compare(e7.pattern, t4.pattern));
  })({ ...e5, workspaceCorrections: e5.workspaceCorrections.map((e6) => ({ ...e6, origin: "imported" })) });
  return { filePath: t2, sourceName: e5.projectName || t2.split(/[\\/]/).pop() || "\u4EE5\u524D\u7684\u5BA1\u67E5", sourceWorkspaceId: e5.projectId, format: n2, corrections: d2.filter((e6) => e6.enabled).map((t3) => ({ ...t3, sourceDecisionIds: [...t3.sourceDecisionIds], origin: "imported", sourceWorkspaceId: e5.projectId })), pseudonyms: { schemaVersion: 1, entries: l2, reservedTokens: [...a2] }, conflicts: u2 };
}

export {ey as extractSourceReviewProfile,Jg as normalizeReviewPattern,Qg as normalizeSourcePseudonymKey};
