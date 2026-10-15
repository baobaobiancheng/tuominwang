import{pageRotationStateSchema,emptyPageRotationState,type PageRotationState}from'../contracts/page-rotation.ts';import{seal,unseal}from'./storage.ts';
const aad=(d:any)=>`${d.tenant_id}:${d.project_id}:${d.id}:${d.source_hash}:page-rotation-state`;
export function readPageRotationState(d:any):PageRotationState{if(!d.page_rotation_state)return emptyPageRotationState();try{return pageRotationStateSchema.parse(JSON.parse(unseal(d.page_rotation_state,aad(d))));}catch{throw Error('PAGE_ROTATION_STATE_INVALID');}}
export function sealPageRotationState(d:any,state:PageRotationState){return seal(JSON.stringify(pageRotationStateSchema.parse(state)),aad(d));}
export function validateRotationPages(state:PageRotationState,pages:{index:number}[]){const valid=new Set(pages.map(p=>p.index));if([...Object.keys(state.rotations).map(Number),...state.manualOnlyPages].some(p=>!valid.has(p)))throw Error('PAGE_ROTATION_PAGE_INVALID');}
