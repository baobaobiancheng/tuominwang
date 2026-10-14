import type {Mark} from '../contracts/index.ts';
import {referencePartialMask,referenceFullMask} from './reference-mask.ts';
import {referenceLegacyOrganizationMask,referenceLegacyAddressMask} from './reference-scenario-mask.ts';

/** jo2 uses the detector's computed `masked` before Nt (renderer.js:8943–8948).
 * Recompute from the immutable original plus stable detector provenance; never trust a supplied mask.
 * The normal textual finalizer applies An/Jn (main.js:9160). Modern standalone raster/PDF paths preserve detector values (main.js:12419/12455/10894)
 * and select `raster-final`; `raster-initial` remains an equivalent compatibility spelling.
 */
export type ReferenceDetectedMaskOptions={stage?:'text-final'|'raster-final'|'raster-initial'};
const points=(value:string)=>[...value];
const stars=(value:string,max=Infinity)=>'*'.repeat(Math.max(1,Math.min(points(value).length,max)));
const name=(value:string)=>{const p=points(value);return p.length<=1?'*':p[0]+'*'.repeat(p.length-1);};
const email=(value:string)=>referencePartialMask(value.replace(/\s/gu,''),'邮箱');
const bank=(value:string)=>{const digits=value.replace(/\D/gu,'');return digits.slice(0,4)+'****'.repeat(Math.floor((digits.length-8)/4))+digits.slice(-4);};
const initialAddress=(value:string)=>{const province='北京|天津|上海|重庆|河北|山西|辽宁|吉林|黑龙江|江苏|浙江|安徽|福建|江西|山东|河南|湖北|湖南|广东|海南|四川|贵州|云南|陕西|甘肃|青海|台湾|内蒙古|广西|西藏|宁夏|新疆|香港|澳门';return(value.replace(/\s/gu,'').match(new RegExp('^((?:'+province+')(?:省|市|自治区|特别行政区)?(?:[\\u4e00-\\u9fa5]{0,3})?(?:市)?)','u'))?.[1]??'')+'****';};
function amount(value:string){const v=value.trim(),unit=v.replace(/\s/gu,'').match(/万?元(?:整|正)?/u)?.[0]??'元';if(/^[¥￥]/u.test(v))return '¥***'+unit+(/[（(]/u.test(v)?'（[金额]）':'');if(/^(?:RMB|CNY)/iu.test(v))return(v.match(/^[A-Za-z]+/u)?.[0]??'RMB').toUpperCase()+' ***'+(v.replace(/\s/gu,'').match(/万?元(?:整|正)?/u)?.[0]??'');if(/^人民币/u.test(v))return '人民币[金额]';if(/^[（(]/u.test(v))return v.includes('人民币')?'（人民币[金额]）':'（[金额]）';return '***'+(v.replace(/\s/gu,'').match(/(?:万?元(?:圆整|整|正)?|圆(?:整|正))$/u)?.[0]??'');}
const safe=(text:string,index:number)=>!(index>0&&index<text.length&&/[\uD800-\uDBFF]/u.test(text[index-1])&&/[\uDC00-\uDFFF]/u.test(text[index]));
const propagationCodes=new Set(['primary_party_consistency_name','primary_party_consistency_org','org_consistency_propagation','glossary_abbrev_fulltext','name_consistency_propagation','kinship-suffix-name','kinship-prefix-name','paren-name-list','legal-role-anchor-name','fragment_recomposer']);
const nameCodes=new Set(['contact_name','transcript_name','officer_names','self_name']);
export function referenceDetectedMask(text:string,mark:Mark,options:ReferenceDetectedMaskOptions={}):string{
 if(!text.isWellFormed()||!Number.isSafeInteger(mark.start)||!Number.isSafeInteger(mark.end)||mark.start<0||mark.end<=mark.start||mark.end>text.length||!safe(text,mark.start)||!safe(text,mark.end))throw new Error('INVALID_REPLACEMENT');
 const value=text.slice(mark.start,mark.end),codes=mark.sources?.map(s=>s.code)??[],source=codes.find(c=>c.startsWith('REF41-'))?.slice(6),table=codes.some(c=>c.startsWith('TABLE-')),scene=codes.find(c=>c.startsWith('SCENE-')),initial=options.stage==='raster-initial'||options.stage==='raster-final';let result:string|undefined;
 // Do is used by table matching for all types; one-character signature cells must also be erased.
 if(codes.includes('runtime-whitelist'))result=codes.includes('runtime-mask-org')?referenceLegacyOrganizationMask(value):codes.includes('runtime-mask-address')?referenceLegacyAddressMask(value):codes.includes('runtime-mask-default')?'****':mark.kind==='机构'?referenceLegacyOrganizationMask(value):mark.kind==='地址'?referenceLegacyAddressMask(value):'****';
 else if(table)result=mark.kind==='机构'?referenceLegacyOrganizationMask(value):mark.kind==='地址'?referenceLegacyAddressMask(value):stars(value);
 else if(source){
  if(nameCodes.has(source))result=name(value);
  else switch(source){
   case 'id_card':result=/出生|出生日期|出生于|住址|地址|户籍|户籍地|户籍所在地|居住地|经常居住地/u.test(text.slice(Math.max(0,mark.start-50),Math.min(text.length,mark.end+50)))?stars(value):'*'.repeat(14)+value.slice(14);break;
   case 'mobile':{const mobile=value.replace(/\D/gu,'').match(/1[3-9]\d{9}/u)?.[0];result=mobile?mobile.slice(0,3)+'****'+mobile.slice(7):'****';break;}
   case 'wechat_labeled':result=value.length>6?value.slice(0,2)+'*'.repeat(value.length-4)+value.slice(-2):stars(value);break;
   case 'wechat_wxid':result=value.slice(0,2)+'*'.repeat(Math.max(1,value.length-4))+value.slice(-2);break;
   case 'bank':result=bank(value);break;
   case 'bank_labeled':result=/[OoＯｏ〇○IlIｌ１l丨|￨]/u.test(value)?value.slice(0,4)+'****'+value.slice(-4):bank(value);break;
   case 'email':case 'email_ocr':result=email(value);break;
   case 'uscc':{const v=value.toUpperCase();result=v.slice(0,6)+'********'+v.slice(14);break;}
   case 'tax_labeled':{const v=value.replace(/\s/gu,'').toUpperCase();result=v.length<=8?'****':v.slice(0,4)+'****'+v.slice(-4);break;}
   case 'landline':{let digits=value.replace(/\D/gu,'');const country=digits.startsWith('86')&&digits.length>11&&(/^(?:\+?86[\s-])/u.test(value)||/^[（(]\s*86/u.test(value)||/^\+86\d/u.test(value));if(country)digits=digits.slice(2);const length=digits.length===12?4:digits.length===10?2:3;result=(country?'86-':'')+digits.slice(0,length)+'-****-'+digits.slice(-4);break;}
   case 'local_phone':result=value.length<=4?'****':value.slice(0,Math.max(2,value.length-4))+'****';break;
   case 'plate':result=value.slice(0,2)+'*****';break;
   case 'securities_account':{const label=value.match(/^([^：:\s\d]+)[：:\s]*/u)?.[1]??'';result=label+'：*****'+value.replace(/\D/gu,'').slice(-4);break;}
   case 'case_no':result='（****）****号';break;
   case 'admin_no':result='〔****〕****号';break;
   case 'realty_cert':result='（****）不动产权第****号';break;
   case 'patent':result='专利号：****';break;
   case 'patent_labeled':result=(value.match(/^(专利号|专利申请号|申请号|专利编号)/u)?.[1]??'专利号')+'：****';break;
   case 'icp':case 'filing_beizi':result='备案号：****';break;
   case 'filing_labeled':result=(value.match(/^(备案号|备案编号|备案证号|备案文号|登记备案号|登记备案编号|登记号)/u)?.[1]??'备案号')+'：****';break;
   case 'land_cert':case 'housing_permit':case 'realty_unit':result='证号：****';break;
   case 'certificate_labeled':{const pattern=/(土地证号|土地证编号|土地权属证号|国有土地使用证(?:号|编号)?|集体土地使用证(?:号|编号)?|土地使用权证(?:号|编号)?|宗地编号|地块编号|不动产单元号|不动产权证号|不动产权证书号|不动产登记证明号|房地产权证号|房产证号|房屋所有权证(?:号|编号)?|房屋产权证号|建设用地规划许可(?:证号|证编号|编号)?|建设工程规划许可(?:证号|证编号|编号)?|规划许可证号|(?:建筑工程|建设工程)?施工许可(?:证号|证编号|编号)?|建设用地批准书(?:编号|号)?|用地批准书(?:编号|号)?)[：:\s]*(?:为|是)?[：:\s]*$/u;result=(text.slice(Math.max(0,mark.start-80),mark.start).match(pattern)?.[1]??'证号')+'：****';break;}
   case 'parcel':result=value.endsWith('宗地')?'****宗地':'****地块';break;
   case 'venue_labeled':result='****';break;
   default:if(source.startsWith('url-')||source==='url')result='****';else if(mark.kind==='地址')result=initialAddress(value);
  }
 }
 else if(codes.some(c=>c.startsWith('AMOUNT-')))result=amount(value);
 else if(scene){
  if(scene.startsWith('SCENE-form-')||scene==='SCENE-transaction-name'||scene==='SCENE-transaction-merchant'||scene==='SCENE-transaction-truncated-company')result=stars(value,4);
  else if(scene==='SCENE-social-insurance-name')result=stars(value,2);
  else if(scene==='SCENE-social-insurance-number')result=value.slice(0,3)+'***'+value.slice(6);
  else if(scene==='SCENE-social-insurance-company')result=value.slice(0,2)+'***'+value.slice(-2);
  else if(scene==='SCENE-receipt-wechat-pair')result=value.includes('*')?value:value.length>6?value.slice(0,2)+'*'.repeat(value.length-4)+value.slice(-2):name(value);
  else if(scene==='SCENE-receipt-standalone-wechat')result=value.includes('*')?value:value.startsWith('__')?value.slice(0,2)+'*'.repeat(value.length-4)+value.slice(-2):name(value);
  else if(scene==='SCENE-receipt-name-pair'||scene==='SCENE-receipt-timestamp-name')result=name(value);
  else if(scene==='SCENE-explicit-name')result=name(value);
  else if(scene==='SCENE-explicit-org')result=referenceLegacyOrganizationMask(value);
  else if(scene==='SCENE-visual-relation-diagram')result=stars(value);
 }
 if(codes.some(c=>c.startsWith('OFFICIAL-'))&&mark.kind==='机构')result=referenceLegacyOrganizationMask(value);
 if(codes.some(c=>c.startsWith('OFFICIAL-'))&&mark.kind==='姓名')result=referencePartialMask(value,mark.kind,'official-name');
 // An/Jn are source finalizers, including source form and general-explicit entities.
 const sourced=!!source||!!scene||table||codes.some(c=>c.startsWith('OFFICIAL-')||c==='NER-reference-postfilter'||propagationCodes.has(c));
 if((!initial&&sourced&&scene!=='SCENE-visual-relation-diagram'||codes.some(c=>propagationCodes.has(c)))&&mark.kind==='机构')result=referenceLegacyOrganizationMask(value);
 if(!initial&&sourced&&scene!=='SCENE-visual-relation-diagram'&&mark.kind==='地址')result=referenceLegacyAddressMask(value);
 if(initial&&result===undefined&&codes.includes('NER-reference-postfilter')&&(mark.kind==='机构'||mark.kind==='地址'))result='***';
 // INT explicitly computes Nt, as does source modern NER name; own candidates retain Nt fallback.
 result??=referencePartialMask(value,mark.kind);
 // Preserve our safety contract even when source receipt already-masked IDs return the unchanged original.
 if(!result.isWellFormed()||!result||result.includes(value))return referenceFullMask(value);
 return result;
}
