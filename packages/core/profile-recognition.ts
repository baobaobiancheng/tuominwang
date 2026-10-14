import type {Mark, DictionaryEntry, Anchor} from '../contracts/index.ts';
import type {Profile, ProjectPresetPolicy} from '../contracts/presets.ts';
import {kindByEntityType, sourceFamilyByKind, profileAllowsKind, profileForFormat} from './presets.ts';
import type {ReplacementPolicies, PolicyDirective} from '../contracts/policies.ts';
export function activeDictionary(dictionary:DictionaryEntry[],policy?:ProjectPresetPolicy) {
  return dictionary;
}
export function enabledProfileMarks(marks:Mark[], profile?:Profile) {
  if(!profile)return marks;
  return marks.filter(m=>profileAllowsKind(profile,m.kind)||m.sources?.some(s=>['project-dictionary','project-whitelist','runtime-whitelist'].includes(s.code)||s.code.startsWith('ruleset-force-detect:')));
}
export function profileActionForKind(profile:Profile,kind:Mark['kind']){
 const own=Object.keys(kindByEntityType).find(entity=>kindByEntityType[entity]===kind&&!['other','seal','face','signature'].includes(entity));
 const family=kind==='固定电话'?'phone':sourceFamilyByKind[kind];
 return (own?profile.pseudonymTypeActions[own as keyof Profile['pseudonymTypeActions']]:undefined)??(family?profile.pseudonymTypeActions[family]:undefined);
}
export function profileReplacementPolicies(profile:Profile,format:string,batch=false,explicitMode?:string):ReplacementPolicies {
  const settings=profileForFormat(profile,format,batch), mode=explicitMode??settings.defaultMode;
  const overall:PolicyDirective=mode==='full_star'?{mode:'full'}:(mode==='custom_pseudonym'||mode==='default_pseudonym'||mode==='selective_pseudonym')?{mode:'alias'}:{mode:'reference-mask',variant:['pdf','png','jpg','jpeg'].includes(format)?'detected-raster':'detected'};
  const types:ReplacementPolicies['types']=[];
  if(mode==='selective_pseudonym')for(const kind of new Set([...Object.entries(kindByEntityType).filter(([entity])=>!['other','face','seal','signature'].includes(entity)).map(([,kind])=>kind),'固定电话' as const])){
    const action=profileActionForKind(profile,kind);if(!action)continue;
    const rule:PolicyDirective=action==='pseudonym'?{mode:'alias'}:action==='full_star'?{mode:'full'}:action==='mask'?{mode:['pdf','png','jpg','jpeg'].includes(format)?'clear':'full'}:{mode:'reference-mask',variant:'default'};
    types.push({kind,rule});
  }
  return {overall,types,values:[],keepExplicit:true};
}
/** Source official-name masking and visual-only clear actions are selected per object. */
export function finalizeProfileReplacements(marks:Mark[],anchors:Anchor[],profile:Profile,format:string,batch=false,explicitMode?:string):Mark[] {
 const mode=explicitMode??profileForFormat(profile,format,batch).defaultMode;
 return marks.map(mark=>{
  if(!mark.replacementOrigin||mark.replacementOrigin==='manual')return mark;
  let next={...mark};
  const visual=anchors.some(a=>a.start<=mark.start&&a.end>=mark.end&&(a.kind==='page'||a.object==='image-text'));
  if(mark.replacementOrigin==='overall' && mark.replacement?.mode==='reference-mask' && ['detected','detected-raster'].includes(mark.replacement.variant) && mark.kind==='姓名' && mark.sources?.some(s=>s.code.startsWith('OFFICIAL-')))next={...next,replacement:{mode:'reference-mask',variant:'official-name'}};
  else if(visual&&mark.replacement?.mode==='reference-mask'&&mark.replacement.variant==='detected')next={...next,replacement:{mode:'reference-mask',variant:'detected-raster'}};
  if(mode==='selective_pseudonym'&&visual&&mark.replacementOrigin==='type'&&profileActionForKind(profile,mark.kind)==='mask')next={...next,replacement:{mode:'clear'}};
  // Source image/PDF/Word-image writers draw only source pseudonyms. A
  // computed default/full text mask is not itself a raster drawing request.
  if(visual)next={...next,rasterReplacement:next.replacement?.mode!=='clear'&& !['default_star','full_star'].includes(mode)};
  return next;
 });
}
