import {createHash} from 'node:crypto';
export const LARGE_MAPPING_SEED='tuominwang/restoration-capacity/20261014/v1';
/** All owned synthetic bytes; fixed SHA-derived identifiers, no customer data. */
export function largePlainMappings(count=100000){
 const mappings=Object.fromEntries(Array.from({length:count},(_,i)=>{const hex=createHash('sha256').update(`${LARGE_MAPPING_SEED}:${i}`).digest('hex');return['ALIAS'+hex.repeat(4).slice(0,200),`合成客户${i+1}`];}));
 const bytes=Buffer.from(JSON.stringify({_meta:{version:'0.6'},mappings}));
 return{mappings,bytes,lastToken:Object.keys(mappings).at(-1)!,sha256:createHash('sha256').update(bytes).digest('hex'),seed:LARGE_MAPPING_SEED};
}
