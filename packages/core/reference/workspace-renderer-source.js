/** Pure renderer serialization functions recovered from the locally supplied 0.5.9 bundle.
 * No desktop bridge, process, file, network, entitlement or license operation is included.
 * Source ranges and SHA256 are recorded in workspace-renderer-source-manifest.json.
 */
function oc(e2) {
  const t2 = e2?.meta?.operationSource, n2 = e2?.source || e2?.meta?.source, a2 = e2?.reviewState?.status || e2?.meta?.reviewState?.status;
  return true === e2?.userAdded || true === e2?.meta?.manual || "manual" === n2 || "manual_batch" === n2 || "user" === t2 || "manual" === t2 || "manual_batch" === t2 || "project-panel" === t2 || false !== e2?.userAdded && ("user_added" === a2 || "user-added" === a2) || "manual_input" === e2?.meta?.imageAnnotationSource;
}
function cc(e2) {
  const t2 = (e2 || "").trim();
  return t2 ? "name_signature" === t2 || "name_cn_signature" === t2 || "name" === t2 || "name_cn" === t2 || t2.startsWith("name_") ? "name_cn" : "org_name" === t2 || t2.startsWith("org_") || t2.startsWith("org_brand_") || t2.startsWith("org_party_") ? "org_name" : "id_card" === t2 || t2.startsWith("id_card_") || "passport" === t2 ? "id_card" : "phone" === t2 || "mobile" === t2 || "landline" === t2 ? "phone" : "bank_card" === t2 ? "bank_card" : "address" === t2 || t2.startsWith("address_") ? "address" : "email" === t2 ? "email" : "website_url" === t2 || "url" === t2 ? "website_url" : "uscc" === t2 || "uscc_old" === t2 || "ein" === t2 ? "uscc" : "wechat_id" === t2 ? "wechat_id" : "plate_cn" === t2 ? "plate_cn" : "securities_account" === t2 ? "securities_account" : "case_number" === t2 ? "case_number" : "cert_no" === t2 ? "cert_no" : "patent_no" === t2 || "filing_no" === t2 ? t2 : "contract_amount" === t2 || t2.startsWith("contract_amount:") ? "contract_amount" : "seal" === t2 || "signature_seal" === t2 ? "seal" : "signature" === t2 || "handwriting" === t2 || "handwritten_signature" === t2 ? "other" : "face" === t2 || "portrait" === t2 ? "face" : "other" : "other";
}
function xc(e2) {
  return true === e2?.meta?.hiddenByType || true === e2?.hiddenByType || "\u7528\u6237\u53D6\u6D88\u5C55\u793A\uFF1A\u6309\u7C7B\u578B\u9690\u85CF" === e2?.meta?.reviewState?.note;
}
const Cc = /* @__PURE__ */ new Set(["\u516C\u53F8", "\u6709\u9650\u516C\u53F8", "\u96C6\u56E2", "\u4E2D\u56FD", "\u9879\u76EE", "\u5408\u540C", "\u7532\u65B9", "\u4E59\u65B9", "\u672C\u4EBA", "\u672C\u6848", "\u91D1\u989D", "\u5730\u5740", "\u7535\u8BDD", "\u90AE\u7BB1", "\u94F6\u884C", "\u8D26\u53F7"]), Mc = new Intl.Collator("zh-CN");
function Ac(e2) {
  return String(e2 || "").normalize("NFKC").replace(/[\s\u00a0\u3000]+/g, "").replace(/[（]/g, "(").replace(/[）]/g, ")").trim();
}
function Tc(e2) {
  let t2 = 2166136261;
  for (let n2 = 0; n2 < e2.length; n2 += 1) t2 ^= e2.charCodeAt(n2), t2 = Math.imul(t2, 16777619);
  return (t2 >>> 0).toString(36);
}
function Ec(e2, t2, n2) {
  return `decision-${Tc((function(e3, t3, n3) {
    return `${e3}|${t3}|${n3}`;
  })(e2, t2, n2))}`;
}
function Nc(e2) {
  return Tc(Ac(e2));
}
function Ic(e2) {
  return { kind: "image", bbox: { x: Number(e2.x || 0), y: Number(e2.y || 0), width: Number(e2.width || 0), height: Number(e2.height || 0), shape: e2.shape }, textHash: Nc(e2.text || "") };
}
function Pc(e2, t2) {
  return "docx" === e2 ? (function(e3) {
    return { kind: "docx", startOffset: Number(e3.startOffset || 0), endOffset: Number(e3.endOffset ?? e3.startOffset ?? 0), region: e3.region, contextBefore: String(e3.contextBefore || ""), contextAfter: String(e3.contextAfter || ""), textHash: Nc(e3.text || "") };
  })(t2) : "pdf" === e2 ? (function(e3) {
    const t3 = Array.isArray(e3.bboxes) && e3.bboxes.length > 0 ? e3.bboxes : e3.bbox ? [e3.bbox] : [], n2 = Number(e3.pageNumber || t3[0]?.pageNumber || 1), a2 = t3.map((e4) => ({ x: Number(e4.x || 0), y: Number(e4.y || 0), width: Number(e4.width || 0), height: Number(e4.height || 0), pageNumber: Number(e4.pageNumber || n2), shape: e4.shape }));
    return 0 === a2.length && a2.push({ x: 0, y: 0, width: 0, height: 0, pageNumber: n2 }), { kind: "pdf", pageNumber: n2, bboxes: a2, textHash: Nc(e3.text || "") };
  })(t2) : Ic(t2);
}
function Rc(e2) {
  return String(e2?.text || e2?.original || "").trim();
}
function Dc(e2) {
  return String(e2?.type || e2?.entityType || "").trim();
}
function Oc(e2) {
  return true === e2?.deleted || "rejected" === e2?.reviewState?.status;
}
function Bc(e2, t2, n2, a2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const i2 = [...n2], r2 = (function(e3) {
    const t3 = e3.review, n3 = [];
    if ("image" === t3.kind) {
      for (const e4 of t3.activeBBoxes) e4.userAdded && n3.push({ entityId: e4.id, action: "addMissedEntity", text: e4.text, entityType: e4.entityType, anchor: Ic(e4) });
      for (const e4 of t3.deletedBBoxes) {
        if (xc(e4)) continue;
        const t4 = String(e4.text || "").trim(), a3 = String(e4.entityType || "").trim();
        t4 && a3 && n3.push({ entityId: e4.id, action: "excludeOccurrence", text: t4, entityType: a3, anchor: Ic(e4) });
      }
      return n3;
    }
    for (const a3 of t3.entities) {
      if (xc(a3)) continue;
      const e4 = Rc(a3), i3 = Dc(a3);
      e4 && i3 && (oc(a3) && !Oc(a3) ? n3.push({ entityId: a3.id, action: "addMissedEntity", text: e4, entityType: i3, anchor: Pc(t3.kind, a3) }) : !oc(a3) && Oc(a3) && n3.push({ entityId: a3.id, action: "excludeOccurrence", text: e4, entityType: i3, anchor: Pc(t3.kind, a3) }));
    }
    return n3;
  })(t2), s2 = new Set(r2.map((e3) => `${Ac(e3.text)}|${e3.entityType}|${JSON.stringify(e3.anchor)}`)), o2 = (function(e3, t3) {
    const n3 = /* @__PURE__ */ new Map();
    for (const a3 of e3.filter((e4) => e4.documentId === t3)) {
      const e4 = `${a3.normalizedText}|${a3.entityType}|${JSON.stringify(a3.occurrenceAnchor)}`;
      "excludeOccurrence" === a3.action || "addMissedEntity" === a3.action ? n3.set(e4, a3) : n3.delete(e4);
    }
    return n3;
  })(n2, t2.id);
  for (const l2 of r2) {
    const n3 = Ac(l2.text), r3 = `${n3}|${l2.entityType}|${JSON.stringify(l2.anchor)}`;
    o2.get(r3)?.action !== l2.action && i2.push({ id: Ec(t2.id, l2.action, `${l2.entityId}-${i2.length}`), workspaceId: e2, documentId: t2.id, action: l2.action, text: l2.text, normalizedText: n3, entityType: l2.entityType, occurrenceAnchor: l2.anchor, createdAt: a2 });
  }
  for (const [l2, u2] of o2) {
    if (s2.has(l2)) continue;
    const e3 = "excludeOccurrence" === u2.action ? "restoreEntity" : "removeAddedEntity";
    i2.push({ ...u2, id: Ec(t2.id, e3, `${u2.id}-${i2.length}`), action: e3, createdAt: a2 });
  }
  return i2;
}
function Fc(e2) {
  const t2 = Ac(e2);
  return t2.length <= 2 || Cc.has(t2) || /^[\d.,，。%％￥¥$()（）+\-/]+$/.test(t2) || /^[\d.,，]+(?:元|万元|亿元|人民币|美元)?$/.test(t2) || /[�]|\?{2,}|[_]{2,}|[A-Za-z0-9]{1,2}$/.test(t2) ? "high" : "normal";
}
function $c(e2, t2 = (/* @__PURE__ */ new Date()).toISOString()) {
  const n2 = [], a2 = (e3, t3, a3, i3, r3, s3 = false) => {
    const o3 = String(t3 || "").trim(), l3 = Ac(String(a3 || o3)), u2 = String(i3 || "").trim();
    o3 && l3 && u2 && ("forceDetect" !== e3 || s3 || "high" !== Fc(o3)) && n2.push({ kind: e3, pattern: o3, normalizedPattern: l3, entityType: u2, sourceId: r3, explicit: s3 });
  };
  for (const u2 of e2.documents) if ("image" !== u2.review.kind) for (const e3 of u2.review.entities) xc(e3) || a2(e3.deleted ? "forceSkip" : "forceDetect", e3.text, e3.normalizedText, e3.type, `${e3.deleted ? "deleted" : "active"}:${u2.id}:${e3.id}`, e3.deleted || oc(e3));
  else {
    for (const e3 of u2.review.activeBBoxes) a2("forceDetect", e3.text, e3.normalizedText, e3.entityType, `active:${u2.id}:${e3.id}`, e3.userAdded);
    for (const e3 of u2.review.deletedBBoxes) xc(e3) || a2("forceSkip", e3.text, e3.text, e3.entityType, `deleted:${u2.id}:${e3.id}`, true);
  }
  const i2 = /* @__PURE__ */ new Map();
  for (const u2 of n2) {
    const e3 = `${u2.normalizedPattern}|${u2.entityType}`, t3 = i2.get(e3) || [];
    t3.push(u2), i2.set(e3, t3);
  }
  const r2 = new Map(e2.workspaceCorrections.map((e3) => [`${e3.kind}|${e3.normalizedPattern}|${e3.entityType}`, e3])), s2 = [];
  for (const [u2, c2] of i2) {
    const e3 = c2.filter((e4) => "forceDetect" === e4.kind), n3 = e3.length > 0 ? e3 : c2.filter((e4) => "forceSkip" === e4.kind);
    if (0 === n3.length) continue;
    const a3 = n3[0], i3 = r2.get(`${a3.kind}|${u2}`);
    s2.push({ id: i3?.id || `correction-${Tc(`${a3.kind}|${u2}`)}`, kind: a3.kind, pattern: a3.pattern, normalizedPattern: a3.normalizedPattern, entityType: a3.entityType, matchMode: "exact", sourceDecisionIds: [...new Set(n3.map((e4) => e4.sourceId))], enabled: false !== i3?.enabled, risk: Fc(a3.pattern), createdAt: i3?.createdAt || t2, updatedAt: t2, origin: "imported" === i3?.origin ? "imported" : "automatic", sourceWorkspaceId: i3?.sourceWorkspaceId });
  }
  const o2 = (e3, t3, n3) => JSON.stringify([e3, t3, n3]), l2 = new Map(s2.map((e3) => [o2(e3.kind, e3.normalizedPattern, e3.entityType), e3]));
  for (const u2 of e2.workspaceCorrections.filter((e3) => "imported" === e3.origin)) {
    const e3 = o2(u2.kind, u2.normalizedPattern, u2.entityType), t3 = l2.get(e3);
    if (t3) {
      l2.set(e3, { ...u2, sourceDecisionIds: [.../* @__PURE__ */ new Set([...u2.sourceDecisionIds, ...t3.sourceDecisionIds])] });
      continue;
    }
    const n3 = o2("forceDetect" === u2.kind ? "forceSkip" : "forceDetect", u2.normalizedPattern, u2.entityType), a3 = l2.get(n3);
    if (a3) {
      const e4 = `${u2.normalizedPattern}|${u2.entityType}`;
      if ((i2.get(e4) || []).some((e5) => e5.kind === a3.kind && e5.explicit)) continue;
      l2.delete(n3);
    }
    l2.set(e3, { ...u2, sourceDecisionIds: [...u2.sourceDecisionIds] });
  }
  return [...l2.values()].sort((e3, t3) => e3.entityType.localeCompare(t3.entityType) || Mc.compare(e3.pattern, t3.pattern));
}
const fd = ["\u80A1\u4EFD\u6709\u9650\u516C\u53F8", "\u6709\u9650\u8D23\u4EFB\u516C\u53F8", "\u6709\u9650\u5408\u4F19\u4F01\u4E1A", "\u96C6\u56E2\u6709\u9650\u516C\u53F8", "\u6709\u9650\u516C\u53F8", "\u80A1\u4EFD\u516C\u53F8", "\u5206\u516C\u53F8", "\u652F\u516C\u53F8", "\u96C6\u56E2\u516C\u53F8", "\u5408\u4F19\u4F01\u4E1A", "\u516C\u53F8", "\u96C6\u56E2", "\u5546\u4E1A\u94F6\u884C", "\u519C\u6751\u5546\u4E1A\u94F6\u884C", "\u6751\u9547\u94F6\u884C", "\u8BC1\u5238\u516C\u53F8", "\u4FDD\u9669\u516C\u53F8", "\u57FA\u91D1\u516C\u53F8", "\u94F6\u884C", "\u652F\u884C", "\u5206\u884C", "\u4FE1\u7528\u793E", "\u5F8B\u5E08\u4E8B\u52A1\u6240", "\u4F1A\u8BA1\u5E08\u4E8B\u52A1\u6240", "\u7A0E\u52A1\u5E08\u4E8B\u52A1\u6240", "\u8D44\u4EA7\u8BC4\u4F30\u4E8B\u52A1\u6240", "\u4E8B\u52A1\u6240", "\u5DE5\u4F5C\u5BA4", "\u7814\u7A76\u4E2D\u5FC3", "\u6280\u672F\u4E2D\u5FC3", "\u7814\u53D1\u4E2D\u5FC3", "\u7814\u7A76\u9662", "\u533B\u5B66\u9662", "\u5927\u5B66", "\u5B66\u9662", "\u4E2D\u5B66", "\u5C0F\u5B66", "\u5B66\u6821", "\u9AD8\u7EA7\u4EBA\u6C11\u6CD5\u9662", "\u4E2D\u7EA7\u4EBA\u6C11\u6CD5\u9662", "\u57FA\u5C42\u4EBA\u6C11\u6CD5\u9662", "\u4EBA\u6C11\u6CD5\u9662", "\u4EBA\u6C11\u68C0\u5BDF\u9662", "\u516C\u5B89\u5C40", "\u6D3E\u51FA\u6240", "\u770B\u5B88\u6240", "\u62D8\u7559\u6240", "\u6CD5\u9662", "\u68C0\u5BDF\u9662", "\u4EBA\u6C11\u533B\u9662", "\u4E2D\u533B\u9662", "\u533B\u9662", "\u8BCA\u6240", "\u536B\u751F\u9662", "\u536B\u751F\u6240", "\u57FA\u91D1\u4F1A", "\u534F\u4F1A", "\u5546\u4F1A", "\u8054\u5408\u4F1A", "\u4FC3\u8FDB\u4F1A", "\u4E2D\u5FC3"], vd = ["\u4E2D\u56FD", "\u4E2D\u534E", "\u4E2D\u534E\u4EBA\u6C11\u5171\u548C\u56FD", "\u56FD\u5BB6", "\u4E2D\u592E", "\u5168\u56FD", "\u4E2D\u8F66", "\u4E2D\u94C1", "\u4E2D\u5EFA", "\u4E2D\u4EA4", "\u4E2D\u51B6", "\u4E2D\u822A", "\u4E2D\u8239", "\u4E2D\u77F3\u6CB9", "\u4E2D\u77F3\u5316", "\u4E2D\u6D77\u6CB9", "\u4E2D\u5316", "\u4E2D\u7CAE", "\u4E2D\u7164", "\u56FD\u5BB6\u7535\u7F51", "\u5357\u65B9\u7535\u7F51", "\u4E2D\u56FD\u7535\u4FE1", "\u4E2D\u56FD\u79FB\u52A8", "\u4E2D\u56FD\u8054\u901A", "\u5317\u4EAC\u5E02", "\u4E0A\u6D77\u5E02", "\u5929\u6D25\u5E02", "\u91CD\u5E86\u5E02", "\u5317\u4EAC", "\u4E0A\u6D77", "\u5929\u6D25", "\u91CD\u5E86", "\u6CB3\u5317", "\u5C71\u897F", "\u8FBD\u5B81", "\u5409\u6797", "\u9ED1\u9F99\u6C5F", "\u6C5F\u82CF", "\u6D59\u6C5F", "\u5B89\u5FBD", "\u798F\u5EFA", "\u6C5F\u897F", "\u5C71\u4E1C", "\u6CB3\u5357", "\u6E56\u5317", "\u6E56\u5357", "\u5E7F\u4E1C", "\u6D77\u5357", "\u56DB\u5DDD", "\u8D35\u5DDE", "\u4E91\u5357", "\u9655\u897F", "\u7518\u8083", "\u9752\u6D77", "\u53F0\u6E7E", "\u5185\u8499\u53E4", "\u5E7F\u897F", "\u897F\u85CF", "\u5B81\u590F", "\u65B0\u7586", "\u6DF1\u5733\u5E02", "\u5E7F\u5DDE\u5E02", "\u676D\u5DDE\u5E02", "\u5357\u4EAC\u5E02", "\u6B66\u6C49\u5E02", "\u6210\u90FD\u5E02", "\u897F\u5B89\u5E02", "\u82CF\u5DDE\u5E02", "\u90D1\u5DDE\u5E02", "\u957F\u6C99\u5E02", "\u6C88\u9633\u5E02", "\u9752\u5C9B\u5E02", "\u5927\u8FDE\u5E02", "\u53A6\u95E8\u5E02", "\u5B81\u6CE2\u5E02"], gd = /* @__PURE__ */ new Set(["name_cn", "name_en", "name", "name_anchor_strict", "name_inline", "name_legal_rep", "name_procurator_role", "name_court_role", "name_label_inline", "name_intro", "name_loose", "name_sequence", "name_trailing_list", "name_kinship", "name_preposition", "name_judicial_role_list", "name_idcard_adjacent", "name_lawsuit_sued", "name_numbered_gender", "name_numbered_gender_relaxed", "name_complaint_reply", "name_signature", "name_joint_row"]), yd = /* @__PURE__ */ new Set(["org_name", "org_name_en", "org_name_party", "org_brand_context", "org_brand_ownership", "org_brand_app", "org_brand_social"]), bd = /* @__PURE__ */ new Set(["address", "address_en", "address_label", "address_inline", "address_inline2", "address_inline_aggressive", "address_region", "address_street", "address_cityline"]);
function wd(e2, t2) {
  const n2 = String(e2 || "");
  if (gd.has(n2)) return t2 ? `${t2.charAt(0)}${"*".repeat(Math.max(1, [...t2].length - 1))}` : "*";
  if (yd.has(n2)) return (function(e3) {
    if (!e3 || e3.length < 2) return "**";
    const t3 = fd.find((t4) => e3.endsWith(t4)) || "";
    let n3 = "";
    const a2 = [/^(北京|上海|天津|重庆)(市)?/, /^[\u4e00-\u9fa5]{2,4}(省|市|自治区|特别行政区)/, /^[\u4e00-\u9fa5]{2,6}(市|地区|盟|州)/, /^[\u4e00-\u9fa5]{2,6}(区|县|旗)/, /^(中国|中华人民共和国)/];
    for (const i2 of a2) {
      const t4 = e3.match(i2);
      if (t4) {
        n3 = t4[0];
        break;
      }
    }
    return n3 || (n3 = vd.find((t4) => e3.startsWith(t4)) || ""), !n3 && t3 && e3.length > t3.length + 2 && (n3 = e3.substring(0, e3.length - t3.length).substring(0, 2)), n3 && t3 ? `${n3}**${t3}` : t3 ? `**${t3}` : n3 ? `${n3}**` : "**";
  })(t2);
  if (bd.has(n2)) {
    const e3 = t2.match(/^([\u4e00-\u9fa5]{2,4}(?:省|市|自治区|特别行政区))/), n3 = t2.match(/(?:省|自治区|特别行政区)([\u4e00-\u9fa5]{2,4}(?:市|州|盟|地区))/);
    return e3 && n3 ? `${e3[1]}${n3[1]}****` : e3 ? `${e3[1]}****` : "****";
  }
  switch (n2) {
    case "other":
      return "*".repeat(Math.max(1, t2.length));
    case "id_card":
    case "id_card_label_loose":
      return 18 === t2.length ? `${"*".repeat(14)}${t2.substring(14)}` : "****";
    case "phone":
    case "mobile": {
      const e3 = t2.replace(/\D+/g, "");
      return 11 === e3.length ? `${e3.substring(0, 3)}****${e3.substring(7)}` : "****";
    }
    case "bank_card":
    case "bank_account":
    case "securities_account": {
      const e3 = t2.replace(/\D+/g, "");
      return e3.length >= 12 ? `${e3.substring(0, 4)}****${e3.substring(e3.length - 4)}` : "****";
    }
    case "uscc":
      return 18 === t2.length ? `${t2.substring(0, 6)}********${t2.substring(14)}` : "****";
    case "email": {
      const [e3, n3] = t2.split("@");
      if (!e3 || !n3) return "****";
      return `${e3.length <= 2 ? "*".repeat(e3.length) : `${e3.substring(0, 2)}***`}@${n3.replace(/[^.]+/, (e4) => `${e4.substring(0, 1)}***`)}`;
    }
    case "website_url":
    default:
      return "****";
    case "landline": {
      const e3 = t2.replace(/\D+/g, "");
      if (e3.length < 10) return "****";
      const n3 = 12 === e3.length ? 4 : 3;
      return `${e3.slice(0, n3)}-****-${e3.slice(-4)}`;
    }
    case "plate_cn": {
      const e3 = t2.match(/^([\u4e00-\u9fa5][A-Z])/);
      return e3 ? `${e3[1]}*****` : "****";
    }
    case "gender":
    case "ethnicity":
      return "**";
    case "case_number":
      return "***\u6848\u53F7/\u6587\u4EF6\u53F7***";
    case "cert_no":
      return "***\u8BC1\u7167/\u8BB8\u53EF\u8BC1\u53F7***";
    case "patent_no":
      return "***\u4E13\u5229\u53F7***";
    case "filing_no":
      return "***\u5907\u6848\u53F7***";
    case "postal_code":
      return 6 === t2.length ? `${t2.substring(0, 3)}***` : "****";
    case "passport":
      return t2.length >= 8 ? `*****${t2.substring(t2.length - 4)}` : "****";
  }
}
function Vp(e2) {
  if (!e2 || "object" != typeof e2 || Array.isArray(e2)) return {};
  const t2 = {};
  for (const [n2, a2] of Object.entries(e2)) ["mask", "pseudonym", "partial_star", "full_star"].includes(String(a2)) && (t2[cc(n2)] = a2);
  return t2;
}
function dv(e2) {
  const t2 = e2?.meta?.ocrTextCorrection ?? e2?.ocrTextCorrection;
  if (!t2 || "object" != typeof t2) return null;
  const n2 = String(t2.recognizedText || "").trim(), a2 = String(t2.correctedText || "").trim();
  return n2 && a2 ? { recognizedText: n2, correctedText: a2, originalType: String(t2.originalType || e2?.type || "other"), correctedType: String(t2.correctedType || e2?.type || "other"), source: "manual-draw" === t2.source ? "manual-draw" : "highlight-context-menu", correctedAt: String(t2.correctedAt || "") } : null;
}
function hv(e2) {
  const t2 = dv(e2);
  return t2?.recognizedText ? t2.recognizedText : String(e2?.meta?.recognizedText ?? e2?.recognizedText ?? e2?.original ?? e2?.text ?? "").trim();
}
function mv(e2, t2) {
  if ("text" === t2) return "pdf_native_text";
  if ("scanned" === t2) return "page_ocr";
  const n2 = e2?.meta && "object" == typeof e2.meta ? e2.meta : {};
  return "pdf_native_text" === n2.textSource || "pdf_image_ocr" === n2.textSource || "page_ocr" === n2.textSource ? n2.textSource : "text_pdf_image_ocr" === n2.source || "ocr" === n2.source || "image_ocr" === n2.region || "image_ocr" === e2?.region || "normalized_ocr" === n2.sourceTextSpace || "number" == typeof n2.ocrImageWidth && "number" == typeof n2.ocrImageHeight ? "hybrid" === t2 ? "pdf_image_ocr" : "page_ocr" : "pdf_native_text";
}
function yC(e2, t2) {
  const n2 = Number.isInteger(t2) && Number(t2) > 0 ? Number(t2) : null, a2 = Array.isArray(e2) ? e2 : [];
  return Array.from(new Set(a2.map(Number).filter((e3) => Number.isInteger(e3) && e3 > 0 && (null == n2 || e3 <= n2)))).sort((e3, t3) => e3 - t3);
}
function NU(e2, t2) {
  return e2.filter((e3) => t2.has(e3.documentId)).map((e3) => {
    const t3 = e3.occurrenceAnchor;
    if ("markdown" === t3.kind) throw new Error("\u975E Markdown \u5BA1\u67E5\u6587\u4EF6\u5305\u542B\u4E0D\u517C\u5BB9\u7684\u4FEE\u6539\u951A\u70B9\uFF0C\u5DF2\u505C\u6B62\u4FDD\u5B58");
    return { ...e3, occurrenceAnchor: t3 };
  });
}
function zU(e2) {
  let t2 = 2166136261;
  for (let n2 = 0; n2 < e2.length; n2 += 1) t2 ^= e2.charCodeAt(n2), t2 = Math.imul(t2, 16777619);
  return `fnv1a32:${(t2 >>> 0).toString(16).padStart(8, "0")}`;
}
function jU(e2) {
  return String(e2.meta?.normalizedText || e2.text || "").trim().toLowerCase();
}
function KU(e2, t2) {
  const n2 = Number(e2);
  if (Number.isFinite(n2) && !(void 0 !== t2 && n2 < t2)) return n2;
}
function HU(e2) {
  if (!e2 || "object" != typeof e2) return;
  const t2 = e2, n2 = KU(t2.x), a2 = KU(t2.y), i2 = KU(t2.width, 0), r2 = KU(t2.height, 0);
  return void 0 !== n2 && void 0 !== a2 && void 0 !== i2 && void 0 !== r2 ? { x: n2, y: a2, width: i2, height: r2, ..."string" == typeof t2.shape ? { shape: t2.shape } : {} } : void 0;
}
function UU(e2) {
  const t2 = e2.meta || {}, n2 = {};
  for (const a2 of ["imagePath", "imageAnnotationSource", "imageDomId", "shape"]) "string" == typeof t2[a2] && t2[a2].trim() && (n2[a2] = t2[a2].trim());
  for (const a2 of ["imageDomIndex", "imageWidth", "imageHeight", "noteId", "noteOccurrenceIndex"]) {
    const e3 = KU(t2[a2], 0);
    void 0 !== e3 && (n2[a2] = "imageDomIndex" === a2 || "noteId" === a2 || "noteOccurrenceIndex" === a2 ? Math.floor(e3) : e3);
  }
  for (const a2 of ["imageBbox", "bboxOriginal", "imageDisplayRatioBbox"]) {
    const e3 = HU(t2[a2]);
    e3 && (n2[a2] = e3);
  }
  return Object.keys(n2).length ? n2 : void 0;
}
function VU(e2) {
  const t2 = String(e2.meta?.reviewState?.status || "");
  return "user-added" === t2 ? "user_added" : "confirmed" === t2 || "rejected" === t2 || "pending" === t2 ? t2 : e2.deleted ? "rejected" : e2.confirmed ? "confirmed" : "pending";
}
function WU(e2) {
  return { schemaVersion: 1, kind: "docx", selectedEntityId: e2.selectedEntityId || null, isPreviewMode: true === e2.isPreviewMode, hasVisitedPreview: true === e2.hasVisitedPreview || true === e2.isPreviewMode, enablePseudonymization: true === e2.enablePseudonymization, pseudonymStyle: "selective" === e2.pseudonymStyle ? "selective" : "custom", pseudonymEntries: (e2.pseudonymEntries || []).filter((e3) => e3?.key).map((e3) => ({ key: String(e3.key), canonicalKey: "string" == typeof e3.canonicalKey ? e3.canonicalKey : void 0, originalValue: String(e3.originalValue ?? e3.normalized ?? e3.key), currentValue: String(e3.currentValue ?? ""), autoValue: String(e3.autoValue ?? ""), locked: true === e3.locked, action: ["mask", "pseudonym", "partial_star", "full_star"].includes(String(e3.action)) ? e3.action : void 0 })), pseudonymTypeActions: { ...e2.pseudonymTypeActions || {} }, maskStyle: e2.maskStyle || "black", entities: (e2.entities || []).map((e3) => {
    return { id: String(e3.id), type: String(e3.type), text: String(e3.text), masked: "string" == typeof e3.masked && e3.masked ? e3.masked : wd(String(e3.type), String(e3.text)), normalizedText: jU(e3), ocrTextCorrection: dv(e3) || void 0, deleted: true === e3.deleted, hiddenByType: true === e3.meta?.hiddenByType || "\u7528\u6237\u53D6\u6D88\u5C55\u793A\uFF1A\u6309\u7C7B\u578B\u9690\u85CF" === e3.meta?.reviewState?.note, reviewTypeAdded: true === e3.meta?.reviewTypeAdded, userAdded: true === e3.meta?.hiddenTypeWasUserAdded || "user_added" === VU(e3), reviewState: { status: VU(e3), operationSource: "string" == typeof e3.meta?.reviewState?.operationSource ? e3.meta.reviewState.operationSource : void 0, updatedAt: "string" == typeof e3.meta?.reviewState?.updatedAt ? e3.meta.reviewState.updatedAt : void 0 }, source: "string" == typeof e3.meta?.source ? e3.meta.source : void 0, sourceChain: Array.isArray(e3.meta?.sourceChain) ? e3.meta.sourceChain.map(String) : void 0, startOffset: Number(e3.startOffset) || 0, endOffset: Number(e3.endOffset) || 0, contextBefore: e3.selectionContextBefore, contextAfter: e3.selectionContextAfter, region: (t2 = e3.region, "header_footer" === t2 ? "header" : ["body", "table", "header", "footer", "comment", "textbox", "footnote", "endnote", "image_ocr"].includes(String(t2)) ? t2 : void 0), meta: UU(e3) };
    var t2;
  }), exportMaskingMode: "full" === e2.exportMaskingMode ? "full" : "partial", removeHeaderFooter: false !== e2.removeHeaderFooter, removeImages: true === e2.removeImages, commentHandlingMode: e2.commentHandlingMode || (false === e2.removeComments ? "keep" : "remove"), viewport: e2.viewport || { scrollTop: 0, scrollLeft: 0, zoom: 1, searchText: "" } };
}
function GU(e2, t2) {
  if (t2 && "object" == typeof t2 && !Array.isArray(t2)) return { schemaId: e2, schemaVersion: 1, data: JSON.parse(JSON.stringify(t2)) };
}
function YU(e2) {
  const t2 = e2.now || (/* @__PURE__ */ new Date()).toISOString(), n2 = WU(e2.reviewDraft), a2 = e2.existing, i2 = a2 ? a2.contentRevision + 1 : 1, r2 = `documents/${e2.documentId}/source.docx`, s2 = e2.legacyOffice || a2?.documents.find((t3) => t3.id === e2.documentId)?.legacyOffice;
  return { snapshot: { schemaVersion: 1, projectId: e2.projectId, projectName: e2.projectName, createdAt: a2?.createdAt || t2, updatedAt: t2, activeDocumentId: e2.documentId, contentRevision: i2, documents: [{ id: e2.documentId, fileName: e2.fileName, fileKind: "docx", sourceEntry: r2, ...s2 ? { legacyOffice: { ...s2 } } : {}, route: { selectedKey: e2.selectedRoute, systemKey: e2.systemRoute, systemConfidence: e2.systemConfidence }, detection: { documentText: e2.documentText, entities: e2.detectedEntities.map((t3) => (function(e3, t4) {
    const n3 = Math.max(0, Number(e3.startOffset) || 0), a3 = Math.max(n3, Number(e3.endOffset) || n3), i3 = e3.selectionContextBefore ?? t4.slice(Math.max(0, n3 - 48), n3), r3 = e3.selectionContextAfter ?? t4.slice(a3, a3 + 48);
    return { id: String(e3.id), type: String(e3.type), text: String(e3.text), normalizedText: jU(e3), confidence: Number.isFinite(e3.score) ? Number(e3.score) : 1, source: "string" == typeof e3.meta?.source ? e3.meta.source : void 0, sourceChain: Array.isArray(e3.meta?.sourceChain) ? e3.meta.sourceChain.map(String) : void 0, anchor: { kind: "docx", startOffset: n3, endOffset: a3, region: e3.region, contextBefore: i3, contextAfter: r3, textHash: zU(String(e3.text)) } };
  })(t3, e2.documentText)), bboxes: [], hasHeaderFooter: e2.hasHeaderFooter, hasComments: e2.hasComments, ocrImageInfos: Array.isArray(e2.ocrImageInfos) ? e2.ocrImageInfos : void 0, docxStructuredInput: GU("docx-structured-input", e2.docxStructuredInput), docxImageScan: GU("docx-image-scan", e2.docxImageScan), canonicalDocument: GU("canonical-document", e2.canonicalDocument) }, review: n2, exportState: { kind: "docx", mode: n2.enablePseudonymization ? "selective" === n2.pseudonymStyle ? "selective_pseudonym" : "custom_pseudonym" : "full" === n2.exportMaskingMode ? "full_star" : "default_star", pseudonym: n2.enablePseudonymization, fullMask: "full" === n2.exportMaskingMode, exportMarkdown: false, pseudonymTableName: `${e2.projectName}_\u5047\u540D\u5BF9\u7167\u8868` } }], rulesetSnapshot: a2?.rulesetSnapshot || null, profileSnapshot: a2?.profileSnapshot || null, projectModeSnapshot: null, reviewDecisionEvents: NU(a2?.reviewDecisionEvents || [], /* @__PURE__ */ new Set([e2.documentId])), workspaceCorrections: a2?.workspaceCorrections || [] }, sources: { [e2.documentId]: e2.source } };
}
function XU(e2) {
  return "object" == typeof e2 && null !== e2 && !Array.isArray(e2);
}
function JU(e2, t2) {
  const n2 = e2[t2];
  if ("number" != typeof n2 || !Number.isFinite(n2)) throw new Error(`${t2} must be a finite number`);
  return n2;
}
function QU(e2, t2) {
  const n2 = e2[t2];
  if ("string" != typeof n2) throw new Error(`${t2} must be a string`);
  return n2;
}
function ZU(e2, t2 = false) {
  if (!XU(e2)) throw new Error("bbox must be an object");
  for (const n2 of ["x", "y", "width", "height"]) JU(e2, n2);
  t2 && JU(e2, "pageNumber");
}
function eV(e2) {
  !(function(e3) {
    if (!XU(e3)) throw new Error("pdfOcrProgress must be an object");
    if (1 !== e3.schemaVersion) throw new Error("pdfOcrProgress schemaVersion is unsupported");
    if ("incomplete" !== e3.status && "complete" !== e3.status) throw new Error("pdfOcrProgress status is invalid");
    const t3 = JU(e3, "totalPages");
    if (!Number.isInteger(t3) || t3 <= 0) throw new Error("pdfOcrProgress totalPages must be a positive integer");
    if (void 0 !== e3.controlState && !["running", "paused", "skipped", "complete"].includes(String(e3.controlState))) throw new Error("pdfOcrProgress controlState is invalid");
    if (void 0 !== e3.mode && "supplement" !== e3.mode && "required" !== e3.mode) throw new Error("pdfOcrProgress mode is invalid");
    if (void 0 !== e3.targetPageNumbers) {
      if (!Array.isArray(e3.targetPageNumbers)) throw new Error("pdfOcrProgress targetPageNumbers must be an array");
      for (const n2 of e3.targetPageNumbers) if ("number" != typeof n2 || !Number.isInteger(n2) || n2 <= 0 || n2 > t3) throw new Error("pdfOcrProgress target page number is invalid");
    }
    if (!Array.isArray(e3.completedPageNumbers)) throw new Error("pdfOcrProgress completedPageNumbers must be an array");
    for (const n2 of e3.completedPageNumbers) if ("number" != typeof n2 || !Number.isInteger(n2) || n2 <= 0 || n2 > t3) throw new Error("pdfOcrProgress completed page number is invalid");
    if (void 0 !== e3.repeatedImageGroups) {
      if (!Array.isArray(e3.repeatedImageGroups)) throw new Error("pdfOcrProgress repeatedImageGroups must be an array");
      const n2 = /* @__PURE__ */ new Set();
      for (const a2 of e3.repeatedImageGroups) {
        if (!XU(a2)) throw new Error("pdfOcrProgress repeated image group must be an object");
        const e4 = QU(a2, "id");
        if (!e4 || n2.has(e4)) throw new Error("pdfOcrProgress repeated image group id is invalid");
        n2.add(e4);
        const i2 = JU(a2, "pageWidth"), r2 = JU(a2, "pageHeight");
        if (i2 <= 0 || r2 <= 0) throw new Error("pdfOcrProgress repeated image page size is invalid");
        if (!Array.isArray(a2.pageNumbers) || a2.pageNumbers.length < 2) throw new Error("pdfOcrProgress repeated image pageNumbers are invalid");
        const s2 = /* @__PURE__ */ new Set();
        for (const n3 of a2.pageNumbers) {
          if (!Number.isInteger(n3) || Number(n3) <= 0 || Number(n3) > t3 || s2.has(Number(n3))) throw new Error("pdfOcrProgress repeated image page number is invalid");
          s2.add(Number(n3));
        }
        const o2 = JU(a2, "representativePageNumber");
        if (!Number.isInteger(o2) || !s2.has(o2)) throw new Error("pdfOcrProgress repeated image representative page is invalid");
        ZU(a2.bbox);
        const l2 = a2.bbox;
        if (l2.x < 0 || l2.y < 0 || l2.width <= 0 || l2.height <= 0 || l2.x + l2.width > i2 || l2.y + l2.height > r2) throw new Error("pdfOcrProgress repeated image bbox is invalid");
      }
    }
    QU(e3, "updatedAt");
  })(e2);
  const t2 = e2;
  return { schemaVersion: 1, status: t2.status, ...t2.controlState ? { controlState: t2.controlState } : {}, ...t2.mode ? { mode: t2.mode } : {}, totalPages: t2.totalPages, ...t2.targetPageNumbers ? { targetPageNumbers: [...t2.targetPageNumbers] } : {}, completedPageNumbers: [...t2.completedPageNumbers], ...t2.repeatedImageGroups?.length ? { repeatedImageGroups: t2.repeatedImageGroups.map((e3) => ({ id: e3.id, pageNumbers: [...e3.pageNumbers], representativePageNumber: e3.representativePageNumber, pageWidth: e3.pageWidth, pageHeight: e3.pageHeight, bbox: { x: e3.bbox.x, y: e3.bbox.y, width: e3.bbox.width, height: e3.bbox.height } })) } : {}, updatedAt: t2.updatedAt };
}
function tV(e2) {
  let t2 = 2166136261;
  for (let n2 = 0; n2 < e2.length; n2 += 1) t2 ^= e2.charCodeAt(n2), t2 = Math.imul(t2, 16777619);
  return `fnv1a32:${(t2 >>> 0).toString(16).padStart(8, "0")}`;
}
function nV(e2) {
  return String(e2 || "").trim().toLowerCase();
}
function aV(e2) {
  const t2 = (Array.isArray(e2.meta?.bboxes) ? e2.meta.bboxes : []).map((e3) => ({ x: Number(e3?.x) || 0, y: Number(e3?.y) || 0, width: Number(e3?.width) || 0, height: Number(e3?.height) || 0, ..."string" == typeof e3?.shape ? { shape: e3.shape } : {} })).filter((e3) => e3.width > 0 && e3.height > 0);
  return t2.length > 1 ? t2 : void 0;
}
function iV(e2) {
  return (Array.isArray(e2) ? e2 : []).filter((e3) => e3?.key).map((e3) => ({ key: String(e3.key), canonicalKey: "string" == typeof e3.canonicalKey ? e3.canonicalKey : void 0, originalValue: String(e3.originalValue ?? e3.normalized ?? e3.key), currentValue: String(e3.currentValue ?? ""), autoValue: String(e3.autoValue ?? ""), locked: true === e3.locked, action: ["mask", "pseudonym", "partial_star", "full_star"].includes(String(e3.action)) ? e3.action : void 0 }));
}
function rV(e2) {
  const t2 = Math.max(1, Number(e2.pageNumber) || 1);
  return (Array.isArray(e2.meta?.bboxes) && e2.meta.bboxes.length > 0 ? e2.meta.bboxes : e2.meta?.bbox ? [e2.meta.bbox] : []).map((e3) => ({ x: Number(e3?.x) || 0, y: Number(e3?.y) || 0, width: Number(e3?.width) || 0, height: Number(e3?.height) || 0, pageNumber: Number(e3?.pageNumber) || t2, ..."string" == typeof e3?.shape ? { shape: e3.shape } : {} })).filter((e3) => e3.width > 0 && e3.height > 0);
}
function sV(e2) {
  const t2 = String(hv(e2) || e2.original || e2.text || ""), n2 = rV(e2), a2 = Number(e2.position?.start) || 0, i2 = Math.max(a2, Number(e2.position?.end) || a2);
  return { id: String(e2.id || `${e2.type}:${t2}:${a2}`), type: String(e2.type || "other"), text: t2, normalizedText: nV(e2.meta?.normalizedText || t2), confidence: Number.isFinite(e2.confidence) ? Number(e2.confidence) : 1, source: "string" == typeof e2.meta?.source ? e2.meta.source : void 0, sourceChain: Array.isArray(e2.meta?.sourceChain) ? e2.meta.sourceChain.map(String) : void 0, anchor: { kind: "pdf", pageNumber: Math.max(1, Number(e2.pageNumber) || n2[0]?.pageNumber || 1), bboxes: n2, textStart: a2, textEnd: i2, textHash: tV(t2) } };
}
function oV(e2) {
  const t2 = e2.state || {};
  return { schemaVersion: 1, kind: "pdf", selectedEntityId: t2.selectedEntityId || null, isPreviewMode: true === t2.isPreviewMode, hasVisitedPreview: true === t2.hasVisitedPreview || true === t2.isPreviewMode, enablePseudonymization: true === t2.enablePseudonymization, pseudonymStyle: "selective" === t2.pseudonymStyle ? "selective" : "custom", pseudonymEntries: iV(t2.pseudonymEntries ?? t2.pseudonymMappings), pseudonymTypeActions: Vp(t2.pseudonymTypeActions), maskStyle: t2.maskStyle || "black", entities: (e2.entities || []).map((t3) => {
    const n2 = rV(t3), a2 = (function(e3, t4) {
      const n3 = e3.meta || {}, a3 = { textSource: true === n3.manualRegionOnly ? "manual_region" : mv(e3, t4) };
      true === n3.textLayerBbox && (a3.textLayerBbox = true), "string" == typeof n3.operationSource && (a3.operationSource = n3.operationSource), "text" !== t4 && n3.ocrTextCorrection && "object" == typeof n3.ocrTextCorrection && (a3.ocrTextCorrection = { ...n3.ocrTextCorrection }), "text" !== t4 && "string" == typeof n3.recognizedText && (a3.recognizedText = n3.recognizedText), true === n3.manual && (a3.manual = true), true === n3.manualRegionOnly && (a3.manualRegionOnly = true), "string" == typeof n3.manualRegionId && (a3.manualRegionId = n3.manualRegionId), "string" == typeof n3.samePositionBatchId && (a3.samePositionBatchId = n3.samePositionBatchId), Number.isInteger(n3.samePositionSourcePageNumber) && (a3.samePositionSourcePageNumber = n3.samePositionSourcePageNumber), "string" == typeof n3.bboxCoordinateSpace && (a3.bboxCoordinateSpace = n3.bboxCoordinateSpace), "string" == typeof n3.timestamp && (a3.timestamp = n3.timestamp), true === n3.rangeAdjusted && (a3.rangeAdjusted = true), true === n3.userAdjusted && (a3.userAdjusted = true), "string" == typeof n3.shape && (a3.shape = n3.shape), Number.isFinite(Number(n3.verticalOffset)) && (a3.verticalOffset = Number(n3.verticalOffset)), Number.isFinite(Number(n3.ocrImageWidth)) && Number(n3.ocrImageWidth) > 0 && (a3.ocrImageWidth = Number(n3.ocrImageWidth)), Number.isFinite(Number(n3.ocrImageHeight)) && Number(n3.ocrImageHeight) > 0 && (a3.ocrImageHeight = Number(n3.ocrImageHeight));
      const i3 = n3.bboxOriginal;
      return i3 && Number.isFinite(Number(i3.x)) && Number.isFinite(Number(i3.y)) && Number.isFinite(Number(i3.width)) && Number.isFinite(Number(i3.height)) && Number(i3.width) > 0 && Number(i3.height) > 0 && (a3.bboxOriginal = { x: Number(i3.x), y: Number(i3.y), width: Number(i3.width), height: Number(i3.height), ..."string" == typeof i3.shape ? { shape: i3.shape } : {} }), Object.keys(a3).length > 0 ? a3 : void 0;
    })(t3, e2.pdfType), i2 = (function(e3) {
      const t4 = e3.text || ("original" in e3 ? e3.original : "") || "", n3 = oc(e3);
      return { id: String(e3.id || `${e3.type}:${t4}`), type: String(e3.type || "other"), text: String(t4 || ""), normalizedText: nV(e3.meta?.normalizedText || t4), ocrTextCorrection: dv(e3) || void 0, deleted: true === e3.deleted, hiddenByType: true === e3.meta?.hiddenByType || true === e3.hiddenByType, reviewTypeAdded: true === e3.meta?.reviewTypeAdded || true === e3.reviewTypeAdded, userAdded: n3, reviewState: { status: true === e3.deleted ? "rejected" : n3 ? "user_added" : "pending" }, source: "string" == typeof e3.meta?.source ? e3.meta.source : void 0, sourceChain: Array.isArray(e3.meta?.sourceChain) ? e3.meta.sourceChain.map(String) : void 0 };
    })(t3);
    if ("text" === e2.pdfType) {
      const e3 = String(hv(t3) || t3.original || t3.text || "");
      i2.text = e3, i2.normalizedText = nV(e3), i2.ocrTextCorrection = void 0;
    }
    return { ...i2, pageNumber: Math.max(1, Number(t3.pageNumber) || n2[0]?.pageNumber || 1), bbox: n2[0], bboxes: n2, ...a2 ? { meta: a2 } : {} };
  }), pageRotations: t2.pageRotations || {}, manualOnlyRotationPages: Array.isArray(t2.manualOnlyRotationPages) ? t2.manualOnlyRotationPages : [], deletedPageNumbers: yC(t2.deletedPageNumbers), sealProgress: t2.sealProgress, viewport: t2.viewport || { pageNumber: 1, scrollTop: 0, scrollLeft: 0, scale: 1.5, searchText: "" } };
}
function uV(e2) {
  const t2 = e2.state || {}, n2 = (e2.activeBBoxes || []).map((e3) => ({ x: Number(e3.x) || 0, y: Number(e3.y) || 0, width: Number(e3.width) || 0, height: Number(e3.height) || 0, id: String(e3.id), text: String(e3.text || ""), normalizedText: nV(e3.text), entityType: String(e3.type || "other"), userAdded: oc(e3), hiddenByType: true === e3.meta?.hiddenByType, reviewTypeAdded: true === e3.meta?.reviewTypeAdded, ..."string" == typeof e3.shape ? { shape: e3.shape } : {}, bboxes: aV(e3), ocrTextCorrection: dv(e3) || void 0 })), a2 = (e2.deletedBBoxes || []).map((e3) => ({ x: Number(e3.x) || 0, y: Number(e3.y) || 0, width: Number(e3.width) || 0, height: Number(e3.height) || 0, id: String(e3.id), text: e3.text ? String(e3.text) : void 0, entityType: e3.type ? String(e3.type) : void 0, userAdded: oc(e3), hiddenByType: true === e3.meta?.hiddenByType, reviewTypeAdded: true === e3.meta?.reviewTypeAdded, ..."string" == typeof e3.shape ? { shape: e3.shape } : {}, bboxes: aV(e3), ocrTextCorrection: dv(e3) || void 0 }));
  return { schemaVersion: 1, kind: "image", isPreviewMode: true === t2.isPreviewMode, hasVisitedPreview: true === t2.hasVisitedPreview || true === t2.isPreviewMode, enablePseudonymization: true === t2.enablePseudonymization, pseudonymStyle: "selective" === t2.pseudonymStyle ? "selective" : "custom", pseudonymEntries: iV(t2.pseudonymEntries ?? t2.pseudonymMappings), pseudonymTypeActions: Vp(t2.pseudonymTypeActions), maskStyle: t2.maskStyle || "black", activeBBoxes: n2, deletedBBoxes: a2, selectedBBoxId: t2.selectedBBoxId || null, viewport: t2.viewport || { scrollTop: 0, scrollLeft: 0, scale: 1 } };
}
function dV(e2) {
  const t2 = e2.now || (/* @__PURE__ */ new Date()).toISOString(), n2 = e2.existing, a2 = n2 ? n2.contentRevision + 1 : 1, i2 = `documents/${e2.documentId}/source.${"pdf" === e2.fileKind ? "pdf" : "image"}`, r2 = e2.pdfEntities || [], s2 = e2.imageBBoxes || [], o2 = "pdf" === e2.fileKind ? e2.pdfDraft || oV({ entities: r2, pdfType: e2.pdfType }) : e2.imageDraft || uV({ activeBBoxes: s2 });
  return { snapshot: { schemaVersion: 1, projectId: e2.projectId, projectName: e2.projectName, createdAt: n2?.createdAt || t2, updatedAt: t2, activeDocumentId: e2.documentId, contentRevision: a2, documents: [{ id: e2.documentId, fileName: e2.fileName, fileKind: e2.fileKind, sourceEntry: i2, route: { selectedKey: e2.selectedRoute, systemKey: e2.systemRoute, systemConfidence: e2.systemConfidence }, detection: { documentText: e2.documentText, canonicalDocument: null == e2.canonicalDocument ? void 0 : { schemaId: "canonical-document", schemaVersion: 1, data: JSON.parse(JSON.stringify(e2.canonicalDocument)) }, entities: "pdf" === e2.fileKind ? r2.map(sV) : [], bboxes: "image" === e2.fileKind ? s2.map((e3) => ({ kind: "image", id: e3.id, text: e3.text, normalizedText: nV(e3.text), entityType: e3.type, confidence: 1, x: e3.x, y: e3.y, width: e3.width, height: e3.height })) : [], pdfType: e2.pdfType, pdfOcrProgress: "pdf" === e2.fileKind && e2.pdfOcrProgress ? eV(e2.pdfOcrProgress) : void 0, ocrCachePages: "pdf" === e2.fileKind ? e2.pdfOcrCachePages || n2?.documents.find((t3) => t3.id === e2.documentId)?.detection.ocrCachePages : void 0, ocrImageInfos: "image" === e2.fileKind ? [{ sourceEntry: i2, width: e2.imageWidth, height: e2.imageHeight, lines: [] }] : void 0 }, review: o2, exportState: "pdf" === e2.fileKind ? { kind: "pdf", mode: o2.enablePseudonymization ? "selective" === o2.pseudonymStyle ? "selective_pseudonym" : "custom_pseudonym" : "default_star", redact: true, redactPseudo: o2.enablePseudonymization, exportDocx: false, exportMarkdown: false, pseudonymTableName: `${e2.projectName}_\u5047\u540D\u5BF9\u7167\u8868`, maskStyle: o2.maskStyle } : { kind: "image", mode: o2.enablePseudonymization ? "selective" === o2.pseudonymStyle ? "selective_pseudonym" : "custom_pseudonym" : "default_star", redact: true, redactPseudo: o2.enablePseudonymization, exportMarkdown: false, pseudonymTableName: `${e2.projectName}_\u5047\u540D\u5BF9\u7167\u8868`, maskStyle: o2.maskStyle } }], rulesetSnapshot: n2?.rulesetSnapshot || null, profileSnapshot: n2?.profileSnapshot || null, projectModeSnapshot: null, reviewDecisionEvents: NU(n2?.reviewDecisionEvents || [], /* @__PURE__ */ new Set([e2.documentId])), workspaceCorrections: n2?.workspaceCorrections || [] }, sources: { [e2.documentId]: e2.source } };
}
function hV(e2) {
  return JSON.parse(JSON.stringify(e2));
}
function pV(e2) {
  let t2 = 2166136261;
  for (let n2 = 0; n2 < e2.length; n2 += 1) t2 ^= e2.charCodeAt(n2), t2 = Math.imul(t2, 16777619);
  return `fnv1a32:${(t2 >>> 0).toString(16).padStart(8, "0")}`;
}
const mV = /* @__PURE__ */ new Set(["default_pseudonym", "custom_pseudonym", "selective_pseudonym"]);
function fV(e2) {
  return e2.pseudonym ? e2.preferredMode && mV.has(e2.preferredMode) ? "default_pseudonym" === e2.preferredMode ? "custom_pseudonym" : e2.preferredMode : "custom_pseudonym" : e2.fullMask ? "full_star" : "default_star";
}
function vV(e2) {
  if ("markdown" !== e2.fileKind || "markdown" !== e2.review.kind || "markdown" !== e2.exportState.kind) return false;
  if ("default_pseudonym" === e2.exportState.mode || "default_pseudonym" === e2.review.exportMode) return false;
  const t2 = mV.has(e2.exportState.mode), n2 = "full_star" === e2.exportState.mode, a2 = "custom_pseudonym" === e2.exportState.mode ? "custom" : "selective_pseudonym" === e2.exportState.mode ? "selective" : "default";
  return e2.review.exportMode === e2.exportState.mode && e2.review.pseudonymTableName === e2.exportState.pseudonymTableName && e2.exportState.pseudonym === t2 && e2.exportState.fullMask === n2 && e2.review.enablePseudonymization === t2 && e2.review.exportMaskingMode === (n2 ? "full" : "partial") && e2.review.pseudonymStyle === a2;
}
function gV(e2, t2) {
  if ("markdown" !== e2.fileKind || "markdown" !== e2.review.kind) return false;
  const n2 = "default_pseudonym" === t2.mode ? "custom_pseudonym" : t2.mode, a2 = mV.has(n2), i2 = "full_star" === n2;
  return e2.exportState = hV({ ...t2, mode: n2, pseudonym: a2, fullMask: i2 }), e2.review.exportMode = n2, e2.review.pseudonymTableName = t2.pseudonymTableName, e2.review.enablePseudonymization = a2, e2.review.exportMaskingMode = i2 ? "full" : "partial", e2.review.pseudonymStyle = "custom_pseudonym" === n2 ? "custom" : "selective_pseudonym" === n2 ? "selective" : "default", true;
}
function yV(e2, t2) {
  const n2 = String(e2?.region || e2?.meta?.region || "");
  if (["text", "table", "code", "frontmatter", "link_label", "link_destination", "image_alt", "footnote"].includes(n2)) return n2;
  const a2 = Number(e2?.meta?.markdownScanStart ?? e2?.scanStart ?? e2?.startOffset ?? e2?.position?.start ?? 0), i2 = Number(e2?.meta?.markdownScanEnd ?? e2?.scanEnd ?? e2?.endOffset ?? e2?.position?.end ?? a2);
  return t2.regions.find((e3) => e3.scanStart < i2 && e3.scanEnd > a2)?.kind || "text";
}
function wV(e2) {
  const t2 = e2.draft || {}, n2 = (Array.isArray(t2.entities) ? t2.entities : e2.detectedEntities || []).map((t3, n3) => (function(e3, t4, n4, a2) {
    const i2 = Math.max(0, Number(e3?.meta?.markdownScanStart ?? e3?.scanStart ?? e3?.startOffset ?? e3?.position?.start ?? 0)), r2 = Math.max(i2, Number(e3?.meta?.markdownScanEnd ?? e3?.scanEnd ?? e3?.endOffset ?? e3?.position?.end ?? i2)), s2 = n4.regions.find((e4) => e4.scanStart <= i2 && e4.scanEnd >= r2), o2 = Math.max(0, Number(e3?.sourceStart ?? e3?.meta?.markdownSourceStart ?? s2?.sourceStart ?? 0)), l2 = Math.max(o2, Number(e3?.sourceEnd ?? e3?.meta?.markdownSourceEnd ?? s2?.sourceEnd ?? o2)), u2 = String(e3?.text || e3?.original || t4.slice(i2, r2)), c2 = true === e3?.deleted || "rejected" === e3?.reviewState?.status, d2 = oc(e3);
    return { id: String(e3?.id || `markdown-entity-${a2 + 1}`), type: String(e3?.type || "other"), text: u2, masked: String(e3?.masked || "*".repeat(Math.max(1, u2.length))), normalizedText: String(e3?.normalizedText || e3?.meta?.normalizedText || u2).trim().toLowerCase(), confidence: Number(e3?.confidence ?? e3?.score ?? 1), deleted: c2, userAdded: d2, reviewState: { status: c2 ? "rejected" : d2 ? "user_added" : "pending" }, source: "string" == typeof e3?.meta?.source ? e3.meta.source : "markdown", sourceChain: Array.isArray(e3?.meta?.sourceChain) ? e3.meta.sourceChain.map(String) : void 0, startOffset: i2, endOffset: r2, sourceStart: o2, sourceEnd: l2, sourceExact: true === e3?.sourceExact || true === e3?.meta?.markdownSourceExact, usePseudonym: true === e3?.usePseudonym, customReplacement: String(e3?.customReplacement || ""), contextBefore: String(e3?.contextBefore || e3?.meta?.contextBefore || t4.slice(Math.max(0, i2 - 48), i2)), contextAfter: String(e3?.contextAfter || e3?.meta?.contextAfter || t4.slice(r2, r2 + 48)), textHash: String(e3?.textHash || e3?.meta?.textHash || pV(u2)), region: yV(e3, n4) };
  })(t3, e2.scanText, e2.sidecar, n3));
  return { schemaVersion: 2, kind: "markdown", isPreviewMode: true === t2.isPreviewMode, hasVisitedPreview: true === t2.hasVisitedPreview || true === t2.isPreviewMode, enablePseudonymization: true === t2.enablePseudonymization, pseudonymStyle: "selective" === t2.pseudonymStyle ? "selective" : "custom", pseudonymEntries: (Array.isArray(t2.pseudonymEntries) ? t2.pseudonymEntries : []).filter((e3) => e3?.key).map((e3) => ({ key: String(e3.key), canonicalKey: "string" == typeof e3.canonicalKey ? e3.canonicalKey : void 0, originalValue: String(e3.originalValue ?? e3.normalized ?? e3.key), currentValue: String(e3.currentValue ?? ""), autoValue: String(e3.autoValue ?? ""), locked: true === e3.locked, action: ["mask", "pseudonym", "partial_star", "full_star"].includes(String(e3.action)) ? e3.action : void 0 })), pseudonymTypeActions: Vp(t2.pseudonymTypeActions), maskStyle: "black", selectedEntityId: "string" == typeof t2.selectedEntityId ? t2.selectedEntityId : null, entities: n2, blockerDecisions: (Array.isArray(t2.blockerDecisions) ? t2.blockerDecisions : []).filter((e3) => "remove" === e3?.action && e3?.blockerId).map((e3) => ({ blockerId: String(e3.blockerId), action: "remove" })), exportMaskingMode: "full" === t2.exportMaskingMode ? "full" : "partial", exportMode: "default_pseudonym" === t2.exportMode ? "custom_pseudonym" : "custom_pseudonym" === t2.exportMode || "selective_pseudonym" === t2.exportMode || "full_star" === t2.exportMode ? t2.exportMode : "default_star", pseudonymTableName: String(t2.pseudonymTableName || ""), viewport: { scrollTop: Number(t2.viewport?.scrollTop || 0), scrollLeft: Number(t2.viewport?.scrollLeft || 0), searchText: String(t2.viewport?.searchText || ""), firstVisibleLine: Math.max(1, Number(t2.viewport?.firstVisibleLine || 1)) } };
}
function xV(e2) {
  const t2 = wV({ draft: { ...e2.reviewDraft || {}, exportMode: e2.exportMode, pseudonymTableName: e2.pseudonymTableName }, source: e2.sourceText, scanText: e2.scanText, sidecar: e2.sidecar, detectedEntities: e2.detectedEntities }), n2 = e2.sidecar.originalExtension, a2 = e2.persistedSidecar, i2 = a2 && a2.sourceSha256 === e2.sidecar.sourceSha256 && a2.scanTextSha256 === e2.sidecar.scanTextSha256 && a2.sourceLength === e2.sidecar.sourceLength ? a2 : hV(e2.sidecar), r2 = { id: e2.documentId, fileName: e2.fileName, ...e2.relativePath ? { relativePath: e2.relativePath } : {}, fileKind: "markdown", sourceEntry: `documents/${e2.documentId}/source${n2}`, route: { selectedKey: e2.selectedRoute, systemKey: e2.systemRoute, systemConfidence: e2.systemConfidence }, detection: { documentText: e2.scanText, entities: t2.entities.map((e3) => ({ id: e3.id, type: e3.type, text: e3.text, normalizedText: e3.normalizedText, confidence: e3.confidence, source: e3.source, sourceChain: e3.sourceChain, anchor: { kind: "markdown", sourceStart: e3.sourceStart, sourceEnd: e3.sourceEnd, scanStart: e3.startOffset, scanEnd: e3.endOffset, region: e3.region, contextBefore: e3.contextBefore, contextAfter: e3.contextAfter, textHash: e3.textHash } })), bboxes: [], recognitionProgress: e2.recognitionProgress, markdownSourceSidecar: i2 }, review: t2, exportState: { kind: "markdown", mode: e2.exportMode, pseudonym: mV.has(e2.exportMode), fullMask: "full_star" === e2.exportMode, pseudonymTableName: t2.pseudonymTableName, sourceExtension: n2 } };
  return gV(r2, r2.exportState), r2;
}
function AV(e2, t2) {
  const n2 = `${String(t2 ?? "")}\0`;
  for (let a2 = 0; a2 < n2.length; a2 += 1) {
    const t3 = n2.charCodeAt(a2);
    e2.primary = Math.imul(e2.primary ^ t3, 16777619), e2.secondary = Math.imul(e2.secondary + t3 + a2, 1540483477) ^ e2.secondary >>> 13;
  }
}
function TV(e2, t2) {
  AV(e2, t2?.x), AV(e2, t2?.y), AV(e2, t2?.width), AV(e2, t2?.height);
}
function EV(e2) {
  const t2 = Array.isArray(e2) ? [...e2].sort((e3, t3) => Number(e3.pageNumber) - Number(t3.pageNumber)) : [], n2 = { primary: 2166136261, secondary: 2654435769 };
  let a2 = 0, i2 = 0;
  for (const r2 of t2) {
    AV(n2, "page"), AV(n2, r2.pageNumber), AV(n2, r2.pageWidth), AV(n2, r2.pageHeight), AV(n2, r2.ocrText);
    for (const e3 of r2.lines || []) {
      a2 += 1, AV(n2, "line"), AV(n2, e3.text), AV(n2, e3.confidence), TV(n2, e3.bbox);
      for (const t3 of e3.charBoxes || []) {
        i2 += 1, AV(n2, "char"), AV(n2, t3.char);
        for (const e4 of t3.bbox || []) AV(n2, e4?.[0]), AV(n2, e4?.[1]);
      }
    }
  }
  return [t2.length, a2, i2, n2.primary >>> 0, n2.secondary >>> 0].join(":");
}
export {WU as sourceDocxReview,YU as sourceDocxWorkspace,oV as sourcePdfReview,uV as sourceImageReview,dV as sourceVisualWorkspace,wV as sourceMarkdownReview,xV as sourceMarkdownDocument,EV as sourceOcrCacheSignature,vV as sourceMarkdownConsistent,gV as sourceApplyMarkdownExport,Bc as sourceWorkspaceDecisions,$c as sourceWorkspaceCorrections};

// Pure PseudonymPolicyList action result from renderer.js:5344-5346.
function qp(e2, t2, n2, a2 = "") {
  return "mask" === e2 ? null : "partial_star" === e2 ? wd(cc(t2), n2) : "full_star" === e2 ? "*".repeat(Math.max(1, [...String(n2 || "")].length)) : a2 || n2;
}
export {cc as sourceSelectiveEntityType, qp as sourcePseudonymActionResult};
