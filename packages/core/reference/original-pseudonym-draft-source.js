// Original renderer.js function bodies are copied verbatim by the local extraction script.
// The factory supplies Vue refs and side effects from the current document only.
export function createOriginalPseudonymDraftRuntime(context) {
  const {de2, hi2, C2, ui2, si2, ne2, Z2} = context;
function cc(e2) {
  const t2 = (e2 || "").trim();
  return t2 ? "name_signature" === t2 || "name_cn_signature" === t2 || "name" === t2 || "name_cn" === t2 || t2.startsWith("name_") ? "name_cn" : "org_name" === t2 || t2.startsWith("org_") || t2.startsWith("org_brand_") || t2.startsWith("org_party_") ? "org_name" : "id_card" === t2 || t2.startsWith("id_card_") || "passport" === t2 ? "id_card" : "phone" === t2 || "mobile" === t2 || "landline" === t2 ? "phone" : "bank_card" === t2 ? "bank_card" : "address" === t2 || t2.startsWith("address_") ? "address" : "email" === t2 ? "email" : "website_url" === t2 || "url" === t2 ? "website_url" : "uscc" === t2 || "uscc_old" === t2 || "ein" === t2 ? "uscc" : "wechat_id" === t2 ? "wechat_id" : "plate_cn" === t2 ? "plate_cn" : "securities_account" === t2 ? "securities_account" : "case_number" === t2 ? "case_number" : "cert_no" === t2 ? "cert_no" : "patent_no" === t2 || "filing_no" === t2 ? t2 : "contract_amount" === t2 || t2.startsWith("contract_amount:") ? "contract_amount" : "seal" === t2 || "signature_seal" === t2 ? "seal" : "signature" === t2 || "handwriting" === t2 || "handwritten_signature" === t2 ? "other" : "face" === t2 || "portrait" === t2 ? "face" : "other" : "other";
}
function Lc(e2) {
  const t2 = e2.replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")"), n2 = t2.indexOf(":");
  return n2 < 0 ? t2 : `${cc(t2.slice(0, n2))}:${t2.slice(n2 + 1)}`;
}
const jc = new class {
  entries = /* @__PURE__ */ new Map();
  active = false;
  reserved = /* @__PURE__ */ new Set();
  counters = /* @__PURE__ */ new Map();
  aliases = /* @__PURE__ */ new Map();
  get enabled() {
    return this.active;
  }
  maximumSequence(e2) {
    return this.counters.get(e2) || 0;
  }
  reserve(e2) {
    if (!this.active || !e2) return;
    this.reserved.add(e2);
    const t2 = /^【(.+?)(\d+)】$/.exec(e2);
    t2 && this.counters.set(t2[1], Math.max(this.counters.get(t2[1]) || 0, Number(t2[2])));
  }
  set(e2) {
    this.entries = new Map((e2?.entries || []).map((e3) => [Lc(e3.key), { ...e3, key: Lc(e3.key), canonicalKey: Lc(e3.canonicalKey) }])), this.active = !!e2?.entries.length, this.reserved = /* @__PURE__ */ new Set(), this.counters.clear(), this.aliases.clear();
    for (const t2 of e2?.reservedTokens || []) this.reserve(t2);
    for (const t2 of this.entries.values()) if (this.reserve(t2.token), t2.key !== t2.canonicalKey) {
      const e3 = this.aliases.get(t2.canonicalKey) || [];
      e3.push(t2.key), this.aliases.set(t2.canonicalKey, e3);
    }
  }
  snapshot() {
    return this.active ? { schemaVersion: 1, entries: [...this.entries.values()].map((e2) => ({ ...e2 })), reservedTokens: [...this.reserved] } : void 0;
  }
  canonicalKey(e2) {
    return this.entries.get(Lc(e2))?.canonicalKey || e2;
  }
  tokenFor(e2, t2) {
    if (!this.active) return t2;
    e2 = Lc(e2);
    const n2 = this.entries.get(e2);
    if (n2) return n2.token;
    const a2 = this.canonicalKey(e2), i2 = this.entries.get(a2);
    if (i2) return i2.token;
    const r2 = /^【(.+?)(\d+)】$/.exec(t2);
    let s2 = t2;
    const o2 = this.reserved;
    if (r2) {
      const e3 = r2[1];
      let t3 = (this.counters.get(e3) || 0) + 1;
      for (s2 = `\u3010${e3}${String(t3).padStart(3, "0")}\u3011`; o2.has(s2); ) s2 = `\u3010${e3}${String(++t3).padStart(3, "0")}\u3011`;
    } else if (o2.has(s2)) {
      let e3 = 1;
      for (; o2.has(`${t2}${e3}`); ) e3++;
      s2 = `${t2}${e3}`;
    }
    return this.entries.set(e2, { key: e2, token: s2, canonicalKey: e2 }), this.reserve(s2), s2;
  }
  apply(e2, t2) {
    if (!this.active) return e2;
    const n2 = /* @__PURE__ */ new Map();
    for (const a2 of t2.values()) a2.locked && this.reserve(a2.currentValue);
    for (const [a2, i2] of e2) {
      const e3 = this.tokenFor(i2.key, i2.autoValue), r2 = t2.get(a2), s2 = r2?.locked ? r2.currentValue : e3, o2 = r2?.canonicalKey || i2.canonicalKey || this.canonicalKey(i2.key);
      n2.set(a2, { ...i2, canonicalKey: o2, autoValue: e3, currentValue: s2, locked: !!r2?.locked });
    }
    for (const [a2, i2] of [...n2]) for (const e3 of this.aliases.get(a2) || []) n2.has(e3) || n2.set(e3, i2);
    return n2;
  }
}();
function Wp(e2, t2) {
  const n2 = e2?.[cc(t2)];
  return "mask" === n2 || "partial_star" === n2 || "full_star" === n2 ? n2 : "pseudonym";
}
const ef = /* @__PURE__ */ new Set(["\u516C\u53F8", "\u672C\u516C\u53F8", "\u8BE5\u516C\u53F8", "\u6211\u516C\u53F8", "\u8D35\u516C\u53F8", "\u53CC\u65B9\u516C\u53F8", "\u7532\u65B9", "\u4E59\u65B9", "\u4E19\u65B9", "\u4E01\u65B9", "\u53CC\u65B9", "\u5404\u65B9", "\u4E00\u65B9", "\u53E6\u4E00\u65B9", "\u5BF9\u65B9", "\u59D4\u6258\u65B9", "\u53D7\u6258\u65B9", "\u627F\u5305\u65B9", "\u53D1\u5305\u65B9", "\u627F\u79DF\u65B9", "\u51FA\u79DF\u65B9", "\u8F6C\u8BA9\u65B9", "\u53D7\u8BA9\u65B9", "\u51FA\u8BA9\u65B9", "\u4E70\u65B9", "\u5356\u65B9", "\u4F9B\u65B9", "\u9700\u65B9", "\u91C7\u8D2D\u65B9", "\u670D\u52A1\u65B9", "\u7528\u4EBA\u5355\u4F4D", "\u52B3\u52A8\u8005", "\u76EE\u6807\u516C\u53F8", "\u6807\u7684\u516C\u53F8", "\u9879\u76EE\u516C\u53F8", "\u53D1\u884C\u4EBA", "\u4FDD\u8350\u673A\u6784", "\u4E3B\u627F\u9500\u5546", "\u672C\u5408\u540C", "\u672C\u534F\u8BAE", "\u5408\u540C", "\u534F\u8BAE", "\u672C\u5DE5\u7A0B", "\u672C\u9879\u76EE", "\u672C\u6848", "\u672C\u6807", "\u672C\u6B21", "\u672C\u6240\u5F8B\u5E08", "\u5F8B\u5E08\u5DE5\u4F5C\u62A5\u544A", "\u672C\u6FC0\u52B1\u8BA1\u5212", "\u672C\u6B21\u6FC0\u52B1\u8BA1\u5212", "\u6FC0\u52B1\u8BA1\u5212", "\u6CD5\u5F8B\u6CD5\u89C4", "\u4E0A\u5E02\u516C\u53F8\u8BC1\u5238", "\u516C\u5F00\u53D1\u884C\u8BC1\u5238", "\u516C\u53F8\u7AE0\u7A0B", "\u672C\u7AE0\u7A0B", "\u7AE0\u7A0B", "\u5408\u683C\u9000\u51FA", "\u6539\u5236\u4E3A\u80A1\u4EFD\u6709\u9650\u516C\u53F8", "\u4E0A\u5E02\u4E2D\u4ECB\u673A\u6784\u4E2D\u4F1A\u8BA1\u5E08\u4E8B\u52A1\u6240", "\u4E0A\u5E02\u4E2D\u4ECB\u673A\u6784\u4E2D\u5F8B\u5E08\u4E8B\u52A1\u6240", "\u4E0A\u5E02\u4E2D\u4ECB\u673A\u6784\u4E2D\u8BC1\u5238\u516C\u53F8", "\u8865\u6551\u81F4\u4F7F\u516C\u53F8"]), tf = /(?:有限责任公司|股份有限公司|有限公司|集团有限公司|集团公司|股份公司|总公司|分公司|子公司|有限合伙|合伙企业|人民政府|人民法院|高级人民法院|中级人民法院|基层人民法院|人民检察院|高级人民检察院|律师事务所|法律服务所|会计师事务所|税务师事务所|仲裁委员会|仲裁委|委员会|管理局|监督管理局|公安局|司法局|分局|派出所|公证处|交易所|商会|联合会|协会|中心|研究院|研究所|医院|大学|学院|学校|银行|支行|分行|信用社|保险公司|证券公司|基金管理公司|公司|集团)$/, nf = /^(?:(?:因与|因被|与|及|被)?(?:原审|一审|二审)?(?:上诉人|被上诉人|原告|被告|第三人|申请人|被申请人|申诉人|被申诉人|执行人|被执行人)|原审判决)/;
function af(e2) {
  return String(e2 || "").replace(/[\s\u00a0\u3000]+/g, "").replace(/^["“”'‘’「『]+|["“”'‘’」』]+$/g, "").replace(/（/g, "(").replace(/）/g, ")");
}
function rf(e2) {
  const t2 = af(e2);
  return ef.has(t2);
}
function sf(e2, t2) {
  const n2 = af(e2), a2 = af(t2 || "");
  return !(!n2 || !a2) && (!(n2.length < 2 || n2.length > 20) && (n2 !== a2 && (!rf(n2) && (!rf(a2) && (i2 = a2, !nf.test(af(i2)) && (!!(function(e3) {
    const t3 = af(e3);
    return t3.length >= 4 && tf.test(t3);
  })(a2) && a2.length > n2.length))))));
  var i2;
}
function of(e2, t2, n2) {
  const a2 = af(t2 || "");
  if (!a2) return;
  const i2 = n2.map((e3) => ({ original: String(e3 || "").trim(), normalized: af(e3) })).filter((t3) => t3.normalized && a2.endsWith(t3.normalized) && sf(e2, t3.normalized)).sort((e3, t3) => t3.normalized.length - e3.normalized.length)[0];
  return i2 ? i2.original : sf(e2, a2) ? a2 : void 0;
}
const lf = "[\uFF08(]\\s*(?:\u4EE5\u4E0B\u7B80\u79F0\u4E3A|\u4EE5\u4E0B\u7B80\u79F0|\u7B80\u79F0\u4E3A|\u7B80\u79F0\u4F5C|\u4E0B\u79F0|\u7B80\u79F0|\u4EE5\u4E0B\u79F0|\u53C8\u79F0)\\s*[\u4E3A]?[\uFF1A:\u3001]?\\s*";
function uf(e2) {
  const t2 = /* @__PURE__ */ new Map(), n2 = /* @__PURE__ */ new Map(), a2 = [];
  for (let s2 = 0; s2 < e2.length; s2++) if ("(" === e2[s2] || "\uFF08" === e2[s2]) a2.push(s2);
  else if (")" === e2[s2] || "\uFF09" === e2[s2]) {
    const e3 = a2.pop();
    null != e3 && n2.set(e3, s2);
  }
  const i2 = new RegExp(lf, "g");
  let r2;
  for (; r2 = i2.exec(e2); ) {
    const a3 = n2.get(r2.index);
    if (null == a3) continue;
    const s2 = e2.slice(i2.lastIndex, a3).trim().replace(/^["“”‘’']|["“”‘’']$/g, "");
    if (!s2) continue;
    let o2 = r2.index;
    for (; o2 > 0 && /\s/.test(e2[o2 - 1]); ) o2--;
    const l2 = Math.max(0, o2 - 128), u2 = t2.get(s2) || [];
    u2.push({ text: e2.slice(l2, a3 + 1), start: l2 }), t2.set(s2, u2);
  }
  return (e3, n3, a3) => {
    const i3 = t2.get(e3.trim());
    if (!i3) return;
    const r3 = e3.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), s2 = new RegExp(`([\\u4e00-\\u9fa5A-Za-z0-9\xB7\\-]{4,80}?(?:\u6709\u9650\u8D23\u4EFB\u516C\u53F8|\u80A1\u4EFD\u6709\u9650\u516C\u53F8|\u6709\u9650\u516C\u53F8|\u96C6\u56E2\u6709\u9650\u516C\u53F8|\u96C6\u56E2\u516C\u53F8|\u603B\u516C\u53F8|\u5206\u516C\u53F8|\u5B50\u516C\u53F8|\u6709\u9650\u5408\u4F19|\u5408\u4F19\u4F01\u4E1A|\u5F8B\u5E08\u4E8B\u52A1\u6240|\u6CD5\u5F8B\u670D\u52A1\u6240|\u4F1A\u8BA1\u5E08\u4E8B\u52A1\u6240|\u7A0E\u52A1\u5E08\u4E8B\u52A1\u6240|\u4EBA\u6C11\u6CD5\u9662|\u4EBA\u6C11\u68C0\u5BDF\u9662|\u4EF2\u88C1\u59D4\u5458\u4F1A|\u4EF2\u88C1\u59D4|\u59D4\u5458\u4F1A|\u7BA1\u7406\u5C40|\u76D1\u7763\u7BA1\u7406\u5C40|\u516C\u5B89\u5C40|\u53F8\u6CD5\u5C40|\u5206\u5C40|\u6D3E\u51FA\u6240|\u516C\u8BC1\u5904|\u4EA4\u6613\u6240|\u5546\u4F1A|\u8054\u5408\u4F1A|\u534F\u4F1A|\u4E2D\u5FC3|\u7814\u7A76\u9662|\u7814\u7A76\u6240|\u533B\u9662|\u5927\u5B66|\u5B66\u9662|\u5B66\u6821|\u94F6\u884C|\u652F\u884C|\u5206\u884C|\u4FE1\u7528\u793E|\u4FDD\u9669\u516C\u53F8|\u8BC1\u5238\u516C\u53F8|\u57FA\u91D1\u7BA1\u7406\u516C\u53F8|\u516C\u53F8|\u96C6\u56E2))\\s*${lf}["\u201C\u201D\u2018\u2019']?${r3}["\u201C\u201D\u2018\u2019']?\\s*[\uFF09)]`, "g");
    let o2;
    for (const t3 of i3) {
      let i4;
      for (s2.lastIndex = 0; i4 = s2.exec(t3.text); ) {
        const r4 = of(e3, i4[1], n3);
        if (!r4) continue;
        const s3 = t3.start + i4.index + i4[0].lastIndexOf(e3.trim()), l2 = "number" == typeof a3 ? Math.abs(s3 - a3) : s3;
        (!o2 || l2 < o2.distance) && (o2 = { fullName: r4, distance: l2 });
      }
    }
    return o2?.fullName;
  };
}
  function mi2(e3) {
    return cc(e3);
  }
  const fi2 = { name_cn: "\u59D3\u540D", org_name: "\u673A\u6784", phone: "\u8054\u7CFB", id_card: "\u8BC1\u4EF6", bank_card: "\u8D26\u53F7", address: "\u5730\u5740", email: "\u90AE\u7BB1", website_url: "\u7F51\u5740", uscc: "\u4EE3\u7801", wechat_id: "\u5FAE\u4FE1", plate_cn: "\u8F66\u724C", securities_account: "\u8BC1\u5238", case_number: "\u6848\u53F7", cert_no: "\u8BC1\u7167", patent_no: "\u4E13\u5229", filing_no: "\u5907\u6848", contract_amount: "\u91D1\u989D", other: "\u5176\u4ED6" }, vi2 = { name_cn: 0, org_name: 1, phone: 2, id_card: 3, bank_card: 4, address: 5, email: 6, website_url: 7, uscc: 8, contract_amount: 9, case_number: 10, wechat_id: 10, plate_cn: 11, securities_account: 12, cert_no: 13, patent_no: 14, filing_no: 15, other: 99 }, gi2 = /* @__PURE__ */ new Map(), yi2 = /* @__PURE__ */ new Set();
  let bi2 = { source: "", lookup: null }, wi2 = { source: "", names: "" }, ki2 = false, _i2 = 0;
  function Si2(e3) {
    return String(e3 || "").replace(/\s+/g, "").replace(/（/g, "(").replace(/）/g, ")");
  }
  function Ci2(e3, t3) {
    return `${mi2(e3)}:${Si2(t3)}`;
  }
  function Mi2(e3, t3) {
    const n3 = Si2(t3 || "");
    if (n3) return `${mi2(e3)}:${n3}`;
  }
  function Ti2(e3, t3) {
    const n3 = Ci2(e3.type, e3.text);
    if (e3.canonicalKey) {
      const n4 = e3.canonicalKey.slice(e3.canonicalKey.indexOf(":") + 1), a4 = of(e3.text, n4, t3);
      if (a4) return Mi2(e3.type, a4);
    }
    const a3 = gi2.get(n3);
    if (a3) {
      const i4 = a3.slice(a3.indexOf(":") + 1), r4 = of(e3.text, i4, t3);
      if (r4) {
        const t4 = Mi2(e3.type, r4);
        return t4 && t4 !== a3 && gi2.set(n3, t4), t4;
      }
      gi2.delete(n3);
    }
    const i3 = "string" == typeof e3.meta?.fullName ? e3.meta.fullName : "", r3 = of(e3.text, i3, t3), s3 = r3 ? Mi2(e3.type, r3) : void 0;
    if (s3) return gi2.set(n3, s3), yi2.delete(n3), s3;
    if ("org_name" === mi2(e3.type)) {
      if (yi2.has(n3)) return;
      const a4 = (function(e4, t4, n4) {
        const a5 = String(e4 || "").trim();
        if (a5 && C2.documentText) return bi2.source !== C2.documentText && (bi2 = { source: C2.documentText, lookup: uf(C2.documentText) }), bi2.lookup?.(a5, t4, n4);
      })(e3.text, t3, e3.startOffset), i4 = Mi2(e3.type, a4);
      if (a4 && i4 && i4 !== n3) return gi2.set(n3, i4), e3.canonicalKey = i4, e3.meta = { ...e3.meta || {}, fullName: a4, definedInDocument: true, source: e3.meta?.source || "manual-abbrev-definition" }, i4;
    }
    yi2.add(n3);
  }
  function Ei2(e3 = {}) {
    const t3 = de2.value.filter((e4) => !e4.deleted && (e4.type, true)).sort((e4, t4) => e4.startOffset - t4.startOffset), n3 = [...new Set(t3.filter((e4) => "org_name" === mi2(e4.type)).map((e4) => e4.text))], a3 = JSON.stringify(n3);
    wi2.source === C2.documentText && wi2.names === a3 || (wi2 = { source: C2.documentText, names: a3 }, yi2.clear(), gi2.clear());
    const i3 = [], r3 = /* @__PURE__ */ new Map(), s3 = /* @__PURE__ */ new Map(), o3 = /* @__PURE__ */ new Map();
    for (const m3 of t3) {
      const t4 = Si2(m3.text), a4 = mi2(m3.type), l4 = `${a4}:${t4}`, u4 = e3.restoreSaved ? hi2.value.get(l4) : void 0, c4 = u4 ? u4.canonicalKey || u4.key : Ti2(m3, n3), d4 = jc.canonicalKey(l4), h4 = d4 !== l4 ? d4 : c4 || l4;
      if (!r3.has(h4)) {
        r3.set(h4, 0), i3.push(h4);
        const e4 = h4.substring(a4.length + 1);
        s3.set(h4, { typeKey: a4, normalized: e4 });
      }
      r3.set(h4, (r3.get(h4) || 0) + 1), h4 !== l4 && o3.set(l4, h4);
    }
    const l3 = new Map(i3.map((e4, t4) => [e4, t4])), u3 = [...i3].sort((e4, t4) => {
      const n4 = s3.get(e4).typeKey, a4 = s3.get(t4).typeKey, i4 = vi2[n4] ?? 50, r4 = vi2[a4] ?? 50;
      return i4 !== r4 ? i4 - r4 : (l3.get(e4) || 0) - (l3.get(t4) || 0);
    }), c3 = /* @__PURE__ */ new Map(), d3 = /* @__PURE__ */ new Map(), h3 = e3.restoreSaved ? new Set([...hi2.value.values()].map((e4) => e4.autoValue)) : /* @__PURE__ */ new Set(), p3 = /* @__PURE__ */ new Map();
    for (const [m3, f3] of o3) {
      const e4 = hi2.value.get(m3);
      e4?.locked && !p3.has(f3) && p3.set(f3, e4);
    }
    for (const m3 of u3) {
      const t4 = s3.get(m3), { typeKey: n4, normalized: a4 } = t4, i4 = r3.get(m3) || 1, o4 = hi2.value.get(m3), l4 = p3.get(m3), u4 = o4?.locked ? o4 : l4 || o4, f3 = fi2[n4] || "\u5176\u4ED6";
      let v3 = (d3.get(n4) || 0) + 1;
      if (e3.restoreSaved && !u4?.autoValue) for (; h3.has(`\u3010${f3}${String(v3).padStart(3, "0")}\u3011`); ) v3++;
      d3.set(n4, v3);
      const g3 = e3.restoreSaved && u4?.autoValue ? u4.autoValue : `\u3010${f3}${String(v3).padStart(3, "0")}\u3011`;
      h3.add(g3);
      const y3 = u4?.locked || false, b3 = e3.restoreSaved && u4 ? u4.currentValue || g3 : y3 && u4?.currentValue || g3, w3 = Wp(ui2.value, n4), x3 = u4?.action && "mask" !== u4.action ? u4.action : "selective" === si2.value ? "mask" === w3 ? "pseudonym" : w3 : void 0;
      c3.set(m3, { key: m3, canonicalKey: u4?.canonicalKey, entityType: n4, normalized: a4, autoValue: g3, currentValue: b3, locked: y3, autoUpgraded: false, occurrences: i4, action: x3 });
    }
    for (const [m3, f3] of o3) {
      const e4 = c3.get(f3);
      e4 && c3.set(m3, e4);
    }
    for (const [m3, f3] of hi2.value) c3.has(m3) || c3.set(m3, { ...f3, occurrences: 0 });
    hi2.value = jc.apply(c3, hi2.value);
  }
  async function zi2(e3, t3) {
    const n3 = hi2.value.get(e3);
    if (n3) {
      if (!C2.unifiedMode && "string" == typeof t3.currentValue) {
        const n4 = t3.currentValue.trim(), a3 = [...hi2.value.values()].find((t4) => t4.key !== e3 && t4.occurrences > 0 && t4.currentValue.trim() === n4);
        if (a3) {
          if (true !== await ne2.open({ title: "\u8BE5\u5047\u540D\u5DF2\u88AB\u4F7F\u7528", description: `\u5047\u540D\u201C${n4}\u201D\u5DF2\u88AB\u201C${a3.normalized}\u201D\u4F7F\u7528\u3002\u7EE7\u7EED\u5171\u7528\u540E\uFF0C\u7CFB\u7EDF\u65E0\u6CD5\u5224\u65AD\u6BCF\u4E00\u5904\u5E94\u8FD8\u539F\u4E3A\u54EA\u4E2A\u539F\u6587\uFF1B\u6267\u884C\u8FD8\u539F\u65F6\u9700\u8981\u7531\u4F60\u9009\u62E9\u7EDF\u4E00\u8FD8\u539F\u5185\u5BB9\u3002`, confirmText: "\u786E\u8BA4\u5171\u7528", cancelText: "\u53D6\u6D88\u4FEE\u6539", variant: "warning", icon: "warning" })) return;
          a3.canonicalKey = a3.canonicalKey || a3.key, t3.canonicalKey = a3.canonicalKey;
        }
      }
      Object.assign(n3, t3), hi2.value = new Map(hi2.value), Z2("review-state-change"), C2.unifiedMode && "string" == typeof t3.currentValue && Z2("unified-token-update", e3, t3.currentValue);
    }
  }
  function Ui2() {
    "selective" === si2.value && (ui2.value = {});
    const e3 = /* @__PURE__ */ new Map();
    for (const t3 of hi2.value.values()) t3.currentValue = t3.autoValue, t3.locked = false, "selective" === si2.value && (t3.action = "pseudonym"), t3.key && !e3.has(t3.key) && e3.set(t3.key, t3.autoValue);
    hi2.value = new Map(hi2.value), Z2("review-state-change"), C2.unifiedMode && Z2("unified-reset-all", Array.from(e3, ([e4, t3]) => ({ key: e4, autoValue: t3 })));
  }
  jc.set(context.unifiedMapping);
  return { rebuild: Ei2, edit: zi2, reset: Ui2, keyFor: Ci2, entries: () => hi2.value, unifiedSnapshot: () => jc.snapshot() };
}
