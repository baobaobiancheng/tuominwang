import {markSchema,type Mark} from '../contracts/index.ts';
import {kindByEntityType} from '../contracts/entity-types.ts';
export function canonicalRuleEntityType(value:string){const kind=Object.hasOwn(kindByEntityType,value)?kindByEntityType[value]:value;return Object.keys(kindByEntityType).find(k=>kindByEntityType[k]===kind)??value;}
export type EntityIdentity={kind:Mark['kind'];rawEntityType?:string};
export function validRawEntityType(value:string){return typeof value==='string'&&value.length>0&&value.isWellFormed()&&!value.includes('\0');}
/** Legacy identities are unchanged. JSON quoting makes every unknown name unambiguous. */
export function entityIdentity(entity:EntityIdentity):string{if(entity.rawEntityType===undefined)return entity.kind;if(entity.kind!=='自定义'||!validRawEntityType(entity.rawEntityType))throw new Error('INVALID_ENTITY_TYPE');return`raw:${JSON.stringify(entity.rawEntityType)}`;}
export function sameEntity(a:EntityIdentity,b:EntityIdentity){return entityIdentity(a)===entityIdentity(b);}
export function entityLabel(entity:EntityIdentity){entityIdentity(entity);return entity.rawEntityType??entity.kind;}
export function entitySpanKey(mark:EntityIdentity&{start:number;end:number}){return JSON.stringify([mark.start,mark.end,entityIdentity(mark)]);}
export function entityValueKey(entity:EntityIdentity,value:string){return JSON.stringify([entityIdentity(entity),value]);}
/** Literal source tags retain their exact identity; visual literals are separate from visual boxes. */
export function sourceEntityMark(entityType:string,pattern=''):EntityIdentity{
 if(!validRawEntityType(entityType))throw new Error('INVALID_ENTITY_TYPE');
 if(['face','seal','signature'].includes(entityType))return{kind:'自定义',rawEntityType:entityType};
 if(entityType==='phone')return{kind:/^1[3-9]\d{9}$/u.test(pattern.replace(/\D/gu,''))?'手机号':'固定电话'};
 const aliases:Record<string,Mark['kind']>={name:'姓名',mobile:'手机号',landline:'固定电话',bank_account:'银行账号',passport:'护照号',tax_id:'税号',social_security_number:'社保号',admin_doc_number:'公文编号',uscc_old:'信用代码',url:'网址'};
 const direct=markSchema.shape.kind.safeParse(entityType),known=(Object.hasOwn(kindByEntityType,entityType)?kindByEntityType[entityType]:undefined)??(Object.hasOwn(aliases,entityType)?aliases[entityType]:undefined)??(direct.success?direct.data:undefined);
 return known?{kind:known}:{kind:'自定义',rawEntityType:entityType};
}
