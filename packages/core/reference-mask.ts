import type { Mark } from '../contracts/index.ts';
import maskData from './reference/reference-mask-data.json' with {type:'json'};
const typeByKind:Record<Mark['kind'],string>={'姓名':'name_cn','机构':'org_name','地址':'address','身份证号':'id_card','手机号':'mobile','固定电话':'landline','银行账号':'bank_card','证券/资金账号':'securities_account','信用代码':'uscc','邮箱':'email','网址':'website_url','车牌号':'plate_cn','案号':'case_number','公文编号':'case_number','证照/许可证号':'cert_no','专利号':'patent_no','备案号':'filing_no','护照号':'passport','微信号':'wechat_id','自定义':'other','商业秘密':'other','金额':'contract_amount','税号':'tax_id','雇主识别号':'ein','国际身份证号':'id_card','社保号':'social_security_number'};
/** Main source Nt policy; the official-letter three-character name policy is explicitly separate. */
export function referencePartialMask(value:string,kind:Mark['kind']|string,variant:'default'|'official-name'='default'):string{
 if(!value.isWellFormed())throw new Error('INVALID_REPLACEMENT');
 const type=typeByKind[kind as Mark['kind']]??kind;
 if(maskData.Mt.includes(type)){
  const points=[...value];if(variant==='official-name'&&points.length===3)return points[0]+'*'+points[2];
  // Upstream charAt(0) can emit a lone surrogate. Retain one whole code point.
  return points.length?(points[0]+'*'.repeat(Math.max(1,points.length-1))):'*';
 }
 if(maskData.Et.includes(type)){
  if(value.length<2)return '**';const suffix=maskData.It.find(s=>value.endsWith(s))??'';
  let prefix='';for(const re of [/^(北京|上海|天津|重庆)(市)?/u,/^[\u4e00-\u9fa5]{2,4}(省|市|自治区|特别行政区)/u,/^[\u4e00-\u9fa5]{2,6}(市|地区|盟|州)/u,/^[\u4e00-\u9fa5]{2,6}(区|县|旗)/u,/^(中国|中华人民共和国)/u]){const m=value.match(re);if(m){prefix=m[0];break;}}
  prefix||=maskData.St.find(s=>value.startsWith(s))??'';if(!prefix&&suffix&&value.length>suffix.length+2)prefix=[...value.slice(0,-suffix.length)].slice(0,2).join('');return prefix&&suffix?prefix+'**'+suffix:suffix?'**'+suffix:prefix?prefix+'**':'**';
 }
 if(maskData.vt.includes(type)){const province=value.match(/^([\u4e00-\u9fa5]{2,4}(?:省|市|自治区|特别行政区))/u)?.[1],city=value.match(/(?:省|自治区|特别行政区)([\u4e00-\u9fa5]{2,4}(?:市|州|盟|地区))/u)?.[1];return province?(province+(city??'')+'****'):'****';}
 const digits=value.replace(/\D/gu,'');
 switch(type){
  case 'other':return referenceFullMask(value);
  case 'id_card':case 'id_card_label_loose':return value.length===18?'*'.repeat(14)+value.slice(14):'****';
  case 'mobile':case 'phone':return digits.length===11?digits.slice(0,3)+'****'+digits.slice(7):'****';
  case 'bank_card':case 'bank_account':case 'securities_account':return digits.length>=12?digits.slice(0,4)+'****'+digits.slice(-4):'****';
  case 'uscc':return value.length===18?value.slice(0,6)+'********'+value.slice(14):'****';
  case 'email':{const [local,domain]=value.split('@');if(!local||!domain)return '****';return(local.length<=2?'*'.repeat(local.length):local.slice(0,2)+'***')+'@'+domain.replace(/[^.]+/u,s=>[...s][0]+'***');}
  case 'landline':return digits.length<10?'****':digits.slice(0,digits.length===12?4:3)+'-****-'+digits.slice(-4);
  case 'plate_cn':{const prefix=value.match(/^([\u4e00-\u9fa5][A-Z])/u)?.[1];return prefix?prefix+'*****':'****';}
  case 'gender':case 'ethnicity':return '**';
  case 'case_number':return '***案号/文件号***';
  case 'cert_no':return '***证照/许可证号***';
  case 'patent_no':return '***专利号***';
  case 'filing_no':return '***备案号***';
  case 'postal_code':return value.length===6?value.slice(0,3)+'***':'****';
  case 'passport':return value.length>=8?'*****'+value.slice(-4):'****';
  default:return '****';
 }
}
export function referenceFullMask(value:string){if(!value.isWellFormed())throw new Error('INVALID_REPLACEMENT');let count=0;for(const _ of value)count++;return '*'.repeat(Math.max(1,count));}
