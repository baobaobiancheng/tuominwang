import {validAliasToken} from "../contracts/alias-token.ts";
import {signatureResidueAllowance,countLiteral} from './review-groups.ts';
import {isOfficeProtocolAttribute} from './office-protocol.ts';
import {entityIdentity,entityLabel,entitySpanKey} from './entity-identity.ts';
import { referencePartialMask, referenceFullMask } from "./reference-mask.ts";
import { referenceDetectedMask } from "./reference-detected-mask.ts";
import { MAX_MARKS, type Mark, type Anchor, type DictionaryEntry } from "../contracts/index.ts";
export const RULES_VERSION = "cn-rules-3";
export function validId(value: string) {
  if (!/^[1-9]\d{16}[\dXx]$/.test(value)) return false;
  const weights = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2];
  const y = Number(value.slice(6, 10)),
    m = Number(value.slice(10, 12)),
    d = Number(value.slice(12, 14));
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    y >= 1800 &&
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d &&
    "10X98765432"[
      weights.reduce((n, w, i) => n + w * Number(value[i]), 0) % 11
    ] === value[17].toUpperCase()
  );
}
export function validCreditCode(value: string) {
  const alphabet = "0123456789ABCDEFGHJKLMNPQRTUWXY";
  if (!/^[0-9A-HJ-NPQRTUWXY]{18}$/.test(value)) return false;
  const weights = [1, 3, 9, 27, 19, 26, 16, 17, 20, 29, 25, 13, 8, 24, 10, 30, 28];
  return alphabet[(31 - weights.reduce((sum, weight, i) => sum + weight * alphabet.indexOf(value[i]), 0) % 31) % 31] === value[17];
}
export function validBankCard(value: string) {
  const digits = value.replace(/[ -]/g, "");
  if (!/^[456]\d{12,18}$/.test(digits) || /^(.)\1+$/.test(digits)) return false;
  let sum = 0;
  for (let i = digits.length - 1, doubled = false; i >= 0; i--, doubled = !doubled) { let n = Number(digits[i]) * (doubled ? 2 : 1); if (n > 9) n -= 9; sum += n; }
  return sum % 10 === 0;
}
export function detect(text: string, anchors: Anchor[] = [], dictionary: DictionaryEntry[] = []): Mark[] {
  // Structural format identifiers are not business URLs. Visible text still participates.
  const pictureUriAttributes = new Set(anchors.filter(a => isOfficeProtocolAttribute(text,a)).map(a => `${a.start}:${a.end}`));
  const rules: [Mark["kind"], RegExp, string, ((value: string) => boolean)?][] = [
    ["身份证号", /(?<![A-Za-z0-9])[1-9]\d{16}[\dXx](?![A-Za-z0-9])/g, "id-checksum", validId],
    ["手机号", /(?<!\d)(?:\+86[ -]?)?1[3-9]\d{9}(?!\d)/g, "cn-mobile"],
    ["固定电话", /(?<!\d)0\d{2,3}[- ]\d{7,8}(?:[-转]\d{1,6})?(?!\d)/g, "cn-landline"],
    ["银行账号", /(?<![A-Za-z0-9])[456]\d{12,18}(?![A-Za-z0-9])/g, "card-luhn", validBankCard],
    ["信用代码", /(?<![A-Za-z0-9])[0-9A-HJ-NPQRTUWXY]{18}(?![A-Za-z0-9])/g, "uscc-mod31", validCreditCode],
    ["案号", /[（(](?:19|20)\d{2}[)）][ \t]*(?:最高法|[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙内陕吉闽贵粤青藏川宁琼军兵])\d{0,4}[\u4e00-\u9fff]{1,8}\d{1,10}号/g, "case-format"],
    ["车牌号", /(?<![A-Za-z0-9])[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][·• ]?(?:[DF][A-HJ-NP-Z0-9]\d{4}|\d{5}[DF]|[A-HJ-NP-Z0-9]{5})(?![A-Za-z0-9])/g, "cn-plate-format"],
    ["专利号", /(?<![A-Za-z0-9])(?:(?:CN|ZL)[ \t]*(?:19|20)\d{10}(?:\.[0-9X])?(?:[A-CUY][1-9]?)?|CN[ \t]*\d{9}[A-CUY][1-9]?)(?![A-Za-z0-9.])/gi, "cn-patent-format"],
    ["备案号", /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼]ICP备\d{6,12}号(?:-\d{1,5})?(?![A-Za-z0-9-])/gi, "cn-icp-format"],
    ["网址", /(?<![A-Za-z0-9_])https?:\/\/[^\s<>"'，；。！？、（）()【】\[\]“”‘’]{1,2048}(?![^\s<>"'，；。！？、（）()【】\[\]“”‘’])/gi, "http-url-format", value => { try { return value.length <= 2048 && !!new URL(value).hostname; } catch { return false; } }],
    [
      "邮箱",
      /(?<![\w.%+-])[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,63}(?![\w.-])/g,
      "email-format",
    ],
  ];
  let marks: Mark[] = [];
  const add = (start: number, end: number, kind: Mark["kind"], code: string) => {
    if (marks.length === MAX_MARKS) throw new Error("MARK_LIMIT");
    marks.push({ start, end, kind, decision: "pending", sources: [{ layer: "rules", code }] });
  };
  // A corporate account need not pass Luhn. Explicit field context produces a review candidate, not a validity claim.
  const fields: [Mark["kind"], RegExp, string, ((value: string) => boolean)?][] = [
    ["银行账号", /(?:开户账号|收款账号|银行账号|银行卡号|账户号码)[ \t]*[:：][ \t]*([0-9][0-9 -]{6,30}[0-9])(?!\d)/g, "account-field"],
    ["护照号", /(?:护照号码|护照号)[ \t]*[:：][ \t]*([A-Z][A-Z0-9]{7,8})(?![A-Za-z0-9])/g, "passport-field"],
    ["证券/资金账号", /(?:证券(?:账户(?:号码|号)?|账号|帐号)|股东(?:账户号?|账号|代码)|资金(?:账户(?:号码|号)?|账号|帐号))(?:[ \t]*[:：][ \t]*|[ \t]+)([A-Za-z]?\d[\d -]{4,29}\d)(?![A-Za-z0-9]|[ -]*\d)/g, "securities-account-field"],
    ["微信号", /(?:微信(?:号|账号|帐号)|WeChat[ \t]*ID)(?:[ \t]*[:：][ \t]*|[ \t]+)([A-Za-z][A-Za-z0-9_-]{5,19})(?![A-Za-z0-9_-])/gi, "wechat-field"],
    ["专利号", /专利(?:申请|授权)?(?:号|编号)(?:[ \t]*[:：][ \t]*|[ \t]+)((?:19|20)\d{10}(?:\.[0-9X])?)(?![A-Za-z0-9.])/gi, "patent-field"],
    ["证照/许可证号", /(?:证照(?:号|编号)|(?:不动产权证|土地证|房产证|房地产权证|规划许可证|施工许可证|建筑工程施工许可证|建设工程规划许可证)(?:号|编号)|许可证(?:号|编号)|宗地(?:编号|地块编号)|地块编号|不动产单元号)(?:[ \t]*[:：][ \t]*|[ \t]+)([A-Za-z0-9\u4e00-\u9fff()（）\-—〔〕]{4,64})(?![A-Za-z0-9\u4e00-\u9fff()（）\-—〔〕])/g, "license-field", value => /\d/.test(value)],
  ];
  for (const [kind, re, code, valid] of fields) for (const m of text.matchAll(re)) { if (valid && !valid(m[1])) continue; const start = m.index + m[0].lastIndexOf(m[1]); add(start, start + m[1].length, kind, code); }
  const headers: Record<string, Mark["kind"]> = {
    "姓名": "姓名", "法定代表人": "姓名", "客户名称": "机构", "公司名称": "机构", "开户账号": "银行账号", "银行账号": "银行账号", "银行卡号": "银行账号", "住所": "地址", "联系地址": "地址", "工资": "金额", "薪酬": "金额",
    "证券账户": "证券/资金账号", "证券账户号": "证券/资金账号", "证券账户号码": "证券/资金账号", "证券账号": "证券/资金账号", "股东代码": "证券/资金账号", "资金账号": "证券/资金账号", "资金账户": "证券/资金账号", "资金账户号": "证券/资金账号", "资金账户号码": "证券/资金账号",
    "车牌号": "车牌号", "微信号": "微信号", "网址": "网址", "专利号": "专利号", "专利申请号": "专利号", "备案号": "备案号",
    "证照号": "证照/许可证号", "许可证号": "证照/许可证号", "土地证号": "证照/许可证号", "房产证号": "证照/许可证号", "不动产权证号": "证照/许可证号", "房地产权证号": "证照/许可证号", "规划许可证号": "证照/许可证号", "施工许可证号": "证照/许可证号", "建设工程规划许可证号": "证照/许可证号", "建筑工程施工许可证号": "证照/许可证号", "宗地编号": "证照/许可证号", "宗地地块编号": "证照/许可证号", "地块编号": "证照/许可证号", "不动产单元号": "证照/许可证号",
  };
  const columns = new Map<string, Mark["kind"]>();
  for (const a of anchors) if (a.row === 1 && a.column) {
    const kind = headers[text.slice(a.start, a.end).trim()]; if (kind) columns.set(`${a.part ?? "csv"}:${a.column}`, kind);
  }
  for (const a of anchors) if ((a.row ?? 0) > 1 && a.column && a.end > a.start) {
    const kind = columns.get(`${a.part ?? "csv"}:${a.column}`); if (kind && text.slice(a.start, a.end).trim()) add(a.start, a.end, kind, "column-field");
  }
  // Explicit securities/license fields take precedence over coincidental Luhn matches within that same value.
  const accountFields = marks.filter(m => m.kind === "证券/资金账号" || m.kind === "证照/许可证号").sort((a, b) => a.start - b.start || b.end - a.end);
  let accountEnd = 0;
  const accountEnds = accountFields.map(m => accountEnd = Math.max(accountEnd, m.end));
  function inAccountField(start: number, end: number) {
    let low = 0, high = accountFields.length - 1;
    while (low <= high) { const middle = (low + high) >>> 1; if (accountFields[middle].start <= start) low = middle + 1; else high = middle - 1; }
    return high >= 0 && accountEnds[high] >= end;
  }
  marks = marks.filter(m => m.kind !== "银行账号" || !inAccountField(m.start, m.end));
  for (const [kind, re, code, valid] of rules) {
    for (const m of text.matchAll(re)) {
      if (valid && !valid(m[0])) continue;
      if (kind === "网址" && pictureUriAttributes.has(`${m.index}:${m.index + m[0].length}`)) continue;
      if (kind === "银行账号" && inAccountField(m.index, m.index + m[0].length)) continue;
      add(m.index, m.index + m[0].length, kind, code);
    }
  }
  for (const entry of dictionary) {
    // ponytail: at most 1,000 literal entries; use a trie if measured large-file scans hit the worker timeout.
    if (!entry.value || entry.value.length > 200) throw new Error("INVALID_DICTIONARY");
    let from = 0, found: number;
    while ((found = text.indexOf(entry.value, from)) !== -1) { add(found, found + entry.value.length, entry.kind, entry.action === "exclude" ? "project-whitelist" : "project-dictionary"); if(entry.rawEntityType!==undefined)marks.at(-1)!.rawEntityType=entry.rawEntityType; from = found + 1; }
  }
  return mergeCandidates(text, marks);
}
// Same span/type combines evidence; different types and overlapping spans stay separate for human review.
export function mergeCandidates(text: string, ...groups: Mark[][]): Mark[] {
  const merged = new Map<string, Mark>();
  for (const group of groups) for (const mark of group) {
    validateMarks(text, [{ ...mark, decision: "pending" }]);
    const key = entitySpanKey(mark), previous = merged.get(key);
    const sources = [...previous?.sources ?? [], ...mark.sources ?? []];
    const unique = [...new Map(sources.map(source => [`${source.layer}:${source.code}`, source])).values()];
    if(previous?.signatureGroup&&mark.signatureGroup&&previous.signatureGroup.id!==mark.signatureGroup.id)throw new Error('SIGNATURE_GROUP_CONFLICT');
    merged.set(key, { ...mark, ...previous?.signatureGroup&&!mark.signatureGroup?{signatureGroup:previous.signatureGroup}:{}, decision: "pending", ...(unique.length ? { sources: unique } : {}) });
    if (merged.size > MAX_MARKS) throw new Error("MARK_LIMIT");
  }
  return [...merged.values()].sort((a, b) => a.start - b.start || a.end - b.end || entityIdentity(a).localeCompare(entityIdentity(b), "zh"));
}
export function reviewMarks(previous: Mark[], incoming: Mark[]) {
  const known = new Map(previous.map(m => [entitySpanKey(m), m.sources]));
  return incoming.map(({ sources: _, ...mark }) => ({ ...mark, sources: known.get(entitySpanKey(mark)) ?? [{ layer: "manual" as const, code: "human-mark" }] }));
}
const boundary = (text: string, n: number) =>
  !(
    n > 0 &&
    n < text.length &&
    /[\uD800-\uDBFF]/.test(text[n - 1]) &&
    /[\uDC00-\uDFFF]/.test(text[n])
  );
export function validateMarks(text: string, marks: Mark[], final = false) {
  for (const m of marks) {
    entityIdentity(m);
    if (
      m.start >= m.end ||
      m.end > text.length ||
      !boundary(text, m.start) ||
      !boundary(text, m.end) ||
      (final && m.decision === "pending")
    )
      throw new Error("INVALID_MARKS");
  }
  const selected = marks
    .filter((m) => m.decision === "redact")
    .sort((a, b) => a.start - b.start);
  if (selected.some((m, i) => i > 0 && m.start < selected[i - 1].end))
    throw new Error("OVERLAPPING_MARKS");
  for (const m of selected) replacementFor(text, m);
  return selected;
}
// All exporters and previews use the same replacement. Counts are Unicode code points, not UTF-16 units.
export function replacementFor(text: string, mark: Mark) {
  const value = text.slice(mark.start, mark.end), policy = mark.replacement;
  if (!policy || policy.mode === "type") return `【${entityLabel(mark)}】`;
  if (policy.mode === "full" || policy.mode === "clear") {
    const output = referenceFullMask(value);
    if (!output || output.includes(value)) throw new Error("INVALID_REPLACEMENT");
    return output;
  }
  if (policy.mode === "reference-mask") {
    const output = policy.variant === "detected" || policy.variant === "detected-raster" ? referenceDetectedMask(text, mark, {stage:policy.variant==='detected-raster'?'raster-final':'text-final'}) : referencePartialMask(value, mark.kind, policy.variant);
    if (!output || output.includes(value) || !output.isWellFormed()) throw new Error("INVALID_REPLACEMENT");
    return output;
  }
  if (policy.mode === "alias") {
    if (!Number.isInteger(policy.version) || policy.version < 1 || !validAliasToken(policy.token) || policy.token.includes(value)) throw new Error("INVALID_REPLACEMENT");
    return policy.token;
  }
  let output: string;
  if (policy.mode === "mask") {
    if (!Number.isInteger(policy.prefix) || !Number.isInteger(policy.suffix) || policy.prefix < 0 || policy.suffix < 0 || policy.prefix > 100 || policy.suffix > 100) throw new Error("INVALID_REPLACEMENT");
    let count = 0;
    for (const _ of value) if (++count > policy.prefix + policy.suffix) break;
    if (count <= policy.prefix + policy.suffix) throw new Error("INVALID_REPLACEMENT");
    // Only retained ends need arrays; large selected paragraphs cannot allocate millions of entries.
    const first = [...value.slice(0, 202)], last = [...value.slice(-202)];
    output = first.slice(0, policy.prefix).join("") + "***" + (policy.suffix ? last.slice(-policy.suffix).join("") : "");
  } else {
    if (policy.mode !== "custom" || !policy.value.isWellFormed() || policy.value.includes("\0")) throw new Error("INVALID_REPLACEMENT");
    output = policy.value;
  }
  if (output.includes(value)) throw new Error("INVALID_REPLACEMENT");
  return output;
}
export function redact(text: string, marks: Mark[]) {
  const pieces: string[] = [];
  let cursor = 0;
  for (const mark of validateMarks(text, marks, true)) {
    pieces.push(text.slice(cursor, mark.start), replacementFor(text, mark));
    cursor = mark.end;
  }
  pieces.push(text.slice(cursor));
  return pieces.join("");
}
export function verify(text: string, marks: Mark[], output: string) {
  if (output !== redact(text, marks)) throw new Error("ARTIFACT_MISMATCH");
  // Conservative: repeated selected values elsewhere must also be reviewed.
  const hidden = new Set(marks.filter(m => m.decision === "redact").map(m => text.slice(m.start, m.end)));
  if ([...hidden].some(value => countLiteral(output,value)>signatureResidueAllowance(text,marks,value)))
    throw new Error("RESIDUE_FOUND");
}
