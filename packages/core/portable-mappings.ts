import{MAX_MAPPING_ENTRIES}from'../contracts/mapping-limits.ts';
/** Native backups carry immutable history, so version rows do not consume new token slots. */
export function validatePortableMappingHistory(mappings:any[]){
 const fail=():never=>{throw new Error('PORTABLE_MAPPING_HISTORY_INVALID');};
 if(new Set(mappings.map(m=>m.id)).size!==mappings.length||new Set(mappings.map(m=>m.token)).size>MAX_MAPPING_ENTRIES)fail();
 const legacy=new Map<string,any>(),byLegacyToken=new Map<string,any>(),groups=new Map<string,any[]>();
 for(const m of mappings){if(m.version===1){if(m.groupId||byLegacyToken.has(m.token))fail();legacy.set(m.id,m);byLegacyToken.set(m.token,m);}else{if(!m.groupId||typeof m.active!=='boolean')fail();const items=groups.get(m.groupId)??[];items.push(m);groups.set(m.groupId,items);}}
 const occupied=new Map<number,string>();for(const m of legacy.values()){if(occupied.has(m.ordinal))fail();occupied.set(m.ordinal,m.token);}
 const groupTokens=new Set<string>();for(const items of groups.values()){const first=items[0];if(groupTokens.has(first.token)||items.filter(m=>m.active).length!==1||new Set(items.map(m=>m.version)).size!==items.length)fail();groupTokens.add(first.token);if(items.some(m=>m.token!==first.token||m.ordinal!==first.ordinal||m.adoptedLegacyMappingId!==first.adoptedLegacyMappingId))fail();const prior=byLegacyToken.get(first.token);if(first.adoptedLegacyMappingId){const adopted=legacy.get(first.adoptedLegacyMappingId);if(!adopted||adopted!==prior||adopted.ordinal!==first.ordinal)fail();}else if(prior)fail();const priorToken=occupied.get(first.ordinal);if(priorToken&&priorToken!==first.token)fail();occupied.set(first.ordinal,first.token);}
 return mappings;
}
export function currentPortableMappings(mappings:any[]){const adopted=new Set(mappings.filter(m=>m.groupId).map(m=>m.adoptedLegacyMappingId));return mappings.filter(m=>m.groupId?m.active===true:!adopted.has(m.id));}
