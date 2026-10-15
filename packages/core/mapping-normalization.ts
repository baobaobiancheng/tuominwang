/** Public source formatting/defined-alias pure functions, main2931–2979/3122–3138. No vendor service. */
function Nr(e5:string) {
  const t2 = e5.replace(/[(（][\s\u200b\ufeff]*/g, "\uFF08").replace(/[\s\u200b\ufeff]*[)）]/g, "\uFF09");
  return (/[\u3400-\u9fff]/.test(e5) ? t2.replace(/([\u3400-\u9fff0-9）])[\s\u200b\ufeff]+(?=（)/g, "$1").replace(/）[\s\u200b\ufeff]+(?=[\u3400-\u9fff0-9（])/g, "\uFF09") : t2.replace(/（/g, "(").replace(/）/g, ")")).replace(/([\u3400-\u9fff])[\s\u200b\ufeff]+(?=[\u3400-\u9fff0-9])/g, "$1").replace(/([0-9])[\s\u200b\ufeff]+(?=[\u3400-\u9fff])/g, "$1");
}
export function normalizeMappingOriginal(e5:string, t2:string) {
  const n2 = String(t2 || "").trim(), r2 = n2.replace(/[\s\u200b\ufeff]+/g, ""), a2 = (function(e6:string) {
    return e6.startsWith("name_") ? "name_cn" : e6.startsWith("org_") ? "org_name" : e6.startsWith("address_") ? "address" : e6.startsWith("contract_amount:") ? "contract_amount" : ["mobile", "landline", "hotline_400_800"].includes(e6) ? "phone" : "bank_account" === e6 ? "bank_card" : e6.startsWith("id_card_") || "passport" === e6 ? "id_card" : "url" === e6 ? "website_url" : "uscc_old" === e6 ? "uscc" : e6;
  })(String(e5 || ""));
  switch (a2) {
    case "name_cn":
    case "org_name":
    case "cert_no":
      return Nr(n2);
    case "address":
      return Nr(n2).replace(/([A-Za-z])\s+(?=[栋幢座楼层室号])/g, "$1");
    case "phone":
      return /^\+?(?:[0-9]|[（(][0-9]+[）)])[0-9()（）.\-]*(?:(?:转|分机|ext\.?)[0-9]+)?$/i.test(r2) && (r2.match(/[0-9]/g)?.length || 0) >= 5 ? r2.replace(/（/g, "(").replace(/）/g, ")") : n2;
    case "id_card":
      return /^(?:[0-9]{15}|[0-9]{17}[0-9Xx]|[A-Za-z]{1,3}[0-9]{5,12})$/.test(r2) ? r2 : n2;
    case "bank_card":
    case "securities_account":
      return /^[A-Za-z]?[0-9]{6,34}$/.test(r2) ? r2 : n2;
    case "uscc":
      return /^[A-Z0-9]{15,18}$/.test(r2) ? r2 : n2;
    case "plate_cn":
      return /^[\u3400-\u9fff][A-Z][A-Z0-9]{4,6}[A-Z0-9挂学警港澳]$/.test(r2) ? r2 : n2;
    case "case_number":
      return /^[（(][0-9]{4}[）)][\u3400-\u9fffA-Za-z0-9]+号$/.test(r2) ? Nr(r2) : Nr(n2);
    case "patent_no":
      return /^(?:[A-Z]{2})?[0-9]{8,13}(?:\.[0-9Xx])?[A-Z][0-9]?$/.test(r2) || /^(?:[A-Z]{2})?[0-9]{8,13}(?:\.[0-9Xx])?$/.test(r2) ? r2 : n2;
    case "filing_no":
      return /^[\u3400-\u9fff]{1,3}(?:ICP[备证]|公网安备)[0-9]{6,20}(?:号(?:-[0-9]+)?)?$/i.test(r2) ? r2 : Nr(n2);
    case "email": {
      const e6 = n2.replace(/\s*([@.])\s*/g, "$1").replace(/[ \t]*\r?\n[ \t]*/g, "");
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e6) ? e6 : n2;
    }
    case "website_url": {
      const e6 = n2.replace(/[ \t]*\r?\n[ \t]*/g, "");
      return /^(?:https?:\/\/|www\.)[^\s]+$/i.test(e6) ? e6 : n2;
    }
    case "contract_amount": {
      if ((n2.match(/[0-9]+(?:\s+[0-9]+)+/g) || []).some((e7) => !/^[0-9]{1,3}(?:[ \t]+[0-9]{3})+$/.test(e7))) return Nr(n2);
      const e6 = n2.replace(/\s+/g, "");
      return /^(?:(?:人民币|港币|美元|欧元|USD|RMB|CNY|EUR|HKD)|[￥¥$€£])?[+-]?(?:[0-9]+|[0-9]{1,3}(?:[,，][0-9]{3})+)(?:\.[0-9]+)?(?:万|亿|万元|亿元|元|圆|美元|港元|欧元|USD|RMB|CNY|EUR|HKD)?$/.test(e6) || /^[零一壹二贰三叁四肆伍五六陆七柒八捌九玖十拾百佰千仟万亿元圆角分整正]+$/.test(e6) ? e6 : Nr(n2);
    }
    default:
      return n2;
  }
}
function kr(e5:string, t2:string[]) {
  return [...new Set(t2.map((t3) => normalizeMappingOriginal(e5, t3)).filter(Boolean))].sort((e6, t3) => e6 < t3 ? -1 : e6 > t3 ? 1 : 0);
}
const Dr = /* @__PURE__ */ new Set(["\u516C\u53F8", "\u672C\u516C\u53F8", "\u8BE5\u516C\u53F8", "\u6211\u516C\u53F8", "\u8D35\u516C\u53F8", "\u53CC\u65B9\u516C\u53F8", "\u7532\u65B9", "\u4E59\u65B9", "\u4E19\u65B9", "\u4E01\u65B9", "\u53CC\u65B9", "\u5404\u65B9", "\u4E00\u65B9", "\u53E6\u4E00\u65B9", "\u5BF9\u65B9", "\u59D4\u6258\u65B9", "\u53D7\u6258\u65B9", "\u627F\u5305\u65B9", "\u53D1\u5305\u65B9", "\u627F\u79DF\u65B9", "\u51FA\u79DF\u65B9", "\u8F6C\u8BA9\u65B9", "\u53D7\u8BA9\u65B9", "\u51FA\u8BA9\u65B9", "\u4E70\u65B9", "\u5356\u65B9", "\u4F9B\u65B9", "\u9700\u65B9", "\u91C7\u8D2D\u65B9", "\u670D\u52A1\u65B9", "\u7528\u4EBA\u5355\u4F4D", "\u52B3\u52A8\u8005", "\u76EE\u6807\u516C\u53F8", "\u6807\u7684\u516C\u53F8", "\u9879\u76EE\u516C\u53F8", "\u53D1\u884C\u4EBA", "\u4FDD\u8350\u673A\u6784", "\u4E3B\u627F\u9500\u5546", "\u672C\u5408\u540C", "\u672C\u534F\u8BAE", "\u5408\u540C", "\u534F\u8BAE", "\u672C\u5DE5\u7A0B", "\u672C\u9879\u76EE", "\u672C\u6848", "\u672C\u6807", "\u672C\u6B21", "\u672C\u6240\u5F8B\u5E08", "\u5F8B\u5E08\u5DE5\u4F5C\u62A5\u544A", "\u672C\u6FC0\u52B1\u8BA1\u5212", "\u672C\u6B21\u6FC0\u52B1\u8BA1\u5212", "\u6FC0\u52B1\u8BA1\u5212", "\u6CD5\u5F8B\u6CD5\u89C4", "\u4E0A\u5E02\u516C\u53F8\u8BC1\u5238", "\u516C\u5F00\u53D1\u884C\u8BC1\u5238", "\u516C\u53F8\u7AE0\u7A0B", "\u672C\u7AE0\u7A0B", "\u7AE0\u7A0B", "\u5408\u683C\u9000\u51FA", "\u6539\u5236\u4E3A\u80A1\u4EFD\u6709\u9650\u516C\u53F8", "\u4E0A\u5E02\u4E2D\u4ECB\u673A\u6784\u4E2D\u4F1A\u8BA1\u5E08\u4E8B\u52A1\u6240", "\u4E0A\u5E02\u4E2D\u4ECB\u673A\u6784\u4E2D\u5F8B\u5E08\u4E8B\u52A1\u6240", "\u4E0A\u5E02\u4E2D\u4ECB\u673A\u6784\u4E2D\u8BC1\u5238\u516C\u53F8", "\u8865\u6551\u81F4\u4F7F\u516C\u53F8", "\u6295\u8D44\u65B9", "\u7B2C\u4E09\u65B9", "\u8054\u5408\u4F53", "\u72EC\u7ACB\u8D22\u52A1\u987E\u95EE", "\u5408\u683C\u5BA1\u8BA1\u673A\u6784", "\u97E9\u56FD\u5F8B\u5E08", "\u8BA4\u8D2D\u65B9", "\u56DE\u8D2D\u65B9", "\u8BA4\u8D2D\u5BF9\u8C61", "\u53D1\u884C\u5BF9\u8C61", "\u4EA4\u6613\u5BF9\u65B9", "\u6807\u7684\u8D44\u4EA7", "\u63A7\u80A1\u80A1\u4E1C", "\u5B9E\u9645\u63A7\u5236\u4EBA", "\u4FDD\u8BC1\u65B9", "\u4FDD\u8BC1\u4EBA", "\u62C5\u4FDD\u4EBA", "\u503A\u52A1\u4EBA", "\u503A\u6743\u4EBA", "\u8BA4\u8D2D\u4EBA", "\u51FA\u8D44\u65B9", "\u5408\u4F5C\u65B9", "\u534F\u8BAE\u65B9", "\u76F8\u5173\u65B9", "\u8D22\u52A1\u987E\u95EE", "\u5171\u7BA1\u8D26\u6237", "\u53D1\u884C\u4EF7\u683C", "\u8BC4\u4F30\u57FA\u51C6\u65E5", "\u52A0\u671F\u8BC4\u4F30\u57FA\u51C6\u65E5", "\u5DEE\u989D\u90E8\u5206", "\u627F\u8BFA\u91D1\u989D", "\u9501\u5B9A\u671F", "\u80A1\u4EFD\u767B\u8BB0\u65E5", "\u672C\u6B21\u53D1\u884C", "\u672C\u6B21\u4EA4\u6613", "\u672C\u6B21\u8F6C\u8BA9", "\u95EE\u8BE2\u51FD", "\u5BA1\u6838\u4E2D\u5FC3\u610F\u89C1\u843D\u5B9E\u51FD", "\u5B50\u5348\u80CE"]), Rr = /(?:有限责任公司|股份有限公司|有限公司|集团有限公司|集团公司|股份公司|总公司|分公司|子公司|有限合伙|合伙企业|人民政府|人民法院|高级人民法院|中级人民法院|基层人民法院|人民检察院|高级人民检察院|律师事务所|法律服务所|会计师事务所|税务师事务所|仲裁委员会|仲裁委|委员会|管理局|监督管理局|公安局|司法局|分局|派出所|公证处|交易所|商会|联合会|协会|中心|研究院|研究所|医院|大学|学院|学校|银行|支行|分行|信用社|保险公司|证券公司|基金管理公司|公司|集团)(?:\([^()]{1,12}\))?$/, Cr = /^(?:(?:因与|因被|与|及|被)?(?:原审|一审|二审)?(?:上诉人|被上诉人|原告|被告|第三人|申请人|被申请人|申诉人|被申诉人|执行人|被执行人)|原审判决)/;
function $r(e5:string) {
  return String(e5 || "").replace(/[\s\u00a0\u3000]+/g, "").replace(/^["“”'‘’「『]+|["“”'‘’」』]+$/g, "").replace(/（/g, "(").replace(/）/g, ")");
}
function Lr(e5:string) {
  const t2 = $r(e5);
  return Dr.has(t2);
}
export function isFullMappingOrganization(e5:string) {
  const t2 = $r(e5);
  return t2.length >= 4 && Rr.test(t2);
}
export function definedMappingAlias(e5:string, t2:string) {
  const n2 = $r(e5), r2 = $r(t2 || "");
  return !(!n2 || !r2) && (!(n2.length < 2 || n2.length > 20) && (n2 !== r2 && (!Lr(n2) && (!Lr(r2) && (!Cr.test(r2) && (!!isFullMappingOrganization(r2) && r2.length > n2.length))))));
}
