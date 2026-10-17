import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";
const u=AdmZip,a={fxp:{XMLParser}};
  function U2(e5) {
    return null == e5 ? [] : Array.isArray(e5) ? e5 : [e5];
  }
  function H2(e5, t2) {
    const n3 = e5.getEntry(t2);
    return n3 ? n3.getData().toString("utf8") : "";
  }
  function K2(e5) {
    return null == e5 ? "" : "string" == typeof e5 || "number" == typeof e5 || "boolean" == typeof e5 ? String(e5) : Array.isArray(e5) ? e5.map((e6) => K2(e6)).join("") : null != e5["#text"] ? String(e5["#text"]) : null != e5.t ? K2(e5.t) : null != e5.r ? K2(e5.r) : "";
  }
  function Y2(e5) {
    const t2 = String(e5 || "").match(/^[A-Z]+/i);
    return t2 ? t2[0].toUpperCase() : "";
  }
  function G2(e5, t2) {
    const n3 = e5?.["@_t"];
    if ("s" === n3) {
      const n4 = Number(e5.v);
      return Number.isFinite(n4) && t2[n4] || "";
    }
    return K2("inlineStr" === n3 ? e5.is : e5?.v);
  }

/** Original main.js sheet1 cell extraction, with the cloud fourth-column raw-type extension. */
export function sourceDictionaryRows(bytes){
 const zip=new u(bytes),parser=new a.fxp.XMLParser({ignoreAttributes:false,attributeNamePrefix:"@_",textNodeName:"#text",trimValues:false});
 const shared=H2(zip,"xl/sharedStrings.xml"),strings=shared?U2(parser.parse(shared)?.sst?.si).map(K2):[],sheet=H2(zip,"xl/worksheets/sheet1.xml");
 if(!sheet)return null;
 const records=[];
 for(const item of U2(parser.parse(sheet)?.worksheet?.sheetData?.row)){
  const number=Number(item?.["@_r"])||0;if(number<1)continue;const row=new Map();
  for(const cell of U2(item?.c)){const column=Y2(cell?.["@_r"]),index=["A","B","C","D"].indexOf(column);if(index<0)continue;const value=G2(cell,strings);row.set(index+1,index===3?value:value.trim())}
  records.push({number,columns:row});
 }
 return records;
}
export function sourceDictionaryZip(parts){const zip=new u();for(const [name,value] of Object.entries(parts))zip.addFile(name,Buffer.from(value));return zip.toBuffer()}
