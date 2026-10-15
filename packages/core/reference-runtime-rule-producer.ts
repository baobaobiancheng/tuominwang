import type {ReviewFeedbackEntity,ReviewFeedbackProducer} from './reference-review-feedback.ts';
export type RuntimeRuleScope='file'|'project'|'spot';
export type AutomaticRuntimeRule={entityType:string;pattern:string};
export type AutomaticRuntimeRuleInput={producer:ReviewFeedbackProducer;before:readonly ReviewFeedbackEntity[];after:readonly ReviewFeedbackEntity[];scope?:RuntimeRuleScope};
const key=(e:ReviewFeedbackEntity)=>JSON.stringify([e.rawEntityType??e.type,e.startOffset,e.endOffset]);
/** Visible Word/PDF/image manual-add producers call updateRuntimeRules only
 * after actual additions. Source spot is local-only. A decision/replacement
 * edit and a type-hidden/deleted entity never become learned whitelist input. */
export function automaticRuntimeRules(input:AutomaticRuntimeRuleInput):AutomaticRuntimeRule[]{
 if(!['manual-add','audit-add','one-click-add'].includes(input.producer)||input.scope==='spot')return[];
 const occupied=new Set(input.before.filter(e=>!e.deleted).map(key)),oldIds=new Set(input.before.filter(e=>!e.deleted).map(e=>e.id)),seen=new Set<string>(),rules:AutomaticRuntimeRule[]=[];
 for(const entity of input.after){if(entity.deleted||oldIds.has(entity.id)||occupied.has(key(entity)))continue;occupied.add(key(entity));const entityType=(entity.rawEntityType??entity.type).trim(),pattern=entity.text.trim();if(!entityType||!pattern)continue;if(!entityType.isWellFormed()||!pattern.isWellFormed()||entityType.includes('\0')||pattern.includes('\0'))throw new Error('RUNTIME_RULE_INVALID');const identity=JSON.stringify([entityType,pattern]);if(seen.has(identity))continue;seen.add(identity);rules.push({entityType,pattern});}
 return rules;
}
