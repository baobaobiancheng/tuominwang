import data from './reference/rule-data.json' with {type:'json'};
import {referencePartialMask} from './reference-mask.ts';
export type ReferenceOrganizationMaskOptions={enableFallbackPrefix?:boolean;fallbackPrefixLength?:number;minOrgNameLength?:number};
/** Independent An implementation (main.js:2242-2268), used only by an explicitly chosen legacy strategy. This does not change the normal Nt policy. */
export function referenceLegacyOrganizationMask(value:string,options:ReferenceOrganizationMaskOptions={}){
 if(!value.isWellFormed())throw new Error('INVALID_REPLACEMENT');const length=options.fallbackPrefixLength??2,minimum=options.minOrgNameLength??2;if(!Number.isSafeInteger(length)||length<0||!Number.isSafeInteger(minimum)||minimum<0)throw new Error('INVALID_REPLACEMENT');
 if(!value||value.length<minimum)return '**';const suffix=data.literals.Mn.find(s=>value.endsWith(s))??'';let prefix='';
 for(const pattern of [/^(北京|上海|天津|重庆)(市)?/u,/^[\u4e00-\u9fa5]{2,4}(省|市|自治区|特别行政区)/u,/^[\u4e00-\u9fa5]{2,6}(市|地区|盟|州)/u,/^[\u4e00-\u9fa5]{2,6}(区|县|旗)/u,/^(中国|中华人民共和国)/u]){const match=value.match(pattern);if(match){prefix=match[0];break;}}
 if(!prefix)prefix=data.literals.En.find(s=>value.startsWith(s))??'';
 if(options.enableFallbackPrefix!==false&&!prefix&&suffix&&value.length>suffix.length+length){prefix=value.slice(0,Math.min(length,value.length-suffix.length));if(!prefix.isWellFormed())prefix=prefix.slice(0,-1);}
 return prefix&&suffix?prefix+'**'+suffix:suffix?'**'+suffix:prefix?prefix+'**':'**';
}
/** Independent Jn behavior is identical to the normal address family. */
export const referenceLegacyAddressMask=(value:string)=>referencePartialMask(value,'地址');
