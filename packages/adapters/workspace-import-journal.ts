import {createHash} from 'node:crypto';
import {z} from 'zod';
import {seal,unseal} from './storage.ts';

const uuid=z.string().uuid();
const owner=z.object({id:uuid,device:z.string().regex(/^\d+$/),inode:z.string().regex(/^\d+$/)}).strict();
const planned=z.array(uuid).max(10000).refine(ids=>new Set(ids).size===ids.length);
const v1=z.object({version:z.literal(1),id:uuid,tenant:uuid,user:uuid,project:uuid,planned,owners:z.array(owner).max(10000)}).strict()
 .refine(j=>new Set(j.owners.map(o=>o.id)).size===j.owners.length&&j.owners.every(o=>j.planned.includes(o.id)));
const header=z.object({version:z.literal(2),id:uuid,tenant:uuid,user:uuid,project:uuid,planned}).strict();
const claim=owner.extend({seq:z.number().int().nonnegative().max(9999)}).strict();
const ready=z.object({count:z.number().int().nonnegative().max(10000),transcript:z.string().regex(/^[a-f0-9]{64}$/)}).strict();
const abort=z.object({count:z.number().int().nonnegative().max(10000),pending:owner.optional(),unresolved:z.boolean()}).strict();
export type WorkspaceImportJournal=z.infer<typeof v1>;
export type OwnerClaim=z.infer<typeof owner>;
export type ParsedJournal={format:1|2,id:string,tenant:string,user:string,project:string,planned:string[],owners:OwnerClaim[],state:'ready'|'abort'|'incomplete',unresolved:boolean};
const magic='WIMP2\n';
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
const aad=(id:string,headerHash:string,kind:string,seq:number)=>`workspace-import:v2:${id}:${headerHash}:${kind}:${seq}`;
const validCipher=(value:string)=>/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)&&value.length>0;

export function validateWorkspaceImportJournal(value:WorkspaceImportJournal){return v1.parse(value);}
export function v2Header(value:WorkspaceImportJournal){
 const {owners:_owners,...identity}=value;
 const data=header.parse({...identity,version:2});
 const cipher=seal(JSON.stringify(data),`workspace-import:v2:${value.id}:header`);
 return {bytes:Buffer.from(`${magic}H ${cipher}\n`),headerHash:digest(cipher)};
}
export function v2Claim(id:string,headerHash:string,seq:number,binding:OwnerClaim){
 const data=claim.parse({...binding,seq});
 return `C ${seal(JSON.stringify(data),aad(id,headerHash,'claim',seq))}\n`;
}
export function v2Ready(id:string,headerHash:string,claimLines:string[]){
 const transcript=digest(claimLines.join(''));
 return `R ${seal(JSON.stringify(ready.parse({count:claimLines.length,transcript})),aad(id,headerHash,'ready',claimLines.length))}\n`;
}
export function v2Abort(id:string,headerHash:string,claimLines:string[],pending?:OwnerClaim,unresolved=false){
 const data=abort.parse({count:claimLines.length,...pending?{pending}:{},unresolved});
 return `A ${seal(JSON.stringify(data),aad(id,headerHash,'abort',claimLines.length))}\n`;
}
function decodeText(bytes:Buffer){return new TextDecoder('utf8',{fatal:true}).decode(bytes);}
function decodeHeaderLine(line:string,id:string){
 if(!line.startsWith('H ')||!validCipher(line.slice(2)))throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
 const cipher=line.slice(2),data=header.parse(JSON.parse(unseal(cipher,`workspace-import:v2:${id}:header`)));
 if(data.id!==id)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
 return {data,headerHash:digest(cipher)};
}
export function readJournalIdentity(bytes:Buffer,id:string){
 uuid.parse(id);
 if(bytes.subarray(0,magic.length).toString('ascii')!==magic){
  const data=v1.parse(JSON.parse(unseal(decodeText(bytes),`workspace-import:${id}`)));
  if(data.id!==id)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
  return {id:data.id,user:data.user,tenant:data.tenant};
 }
 const text=decodeText(bytes),end=text.indexOf('\n',magic.length);
 if(end<0)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
 const {data}=decodeHeaderLine(text.slice(magic.length,end),id);
 return {id:data.id,user:data.user,tenant:data.tenant};
}
export function parseWorkspaceImportJournal(bytes:Buffer,id:string):ParsedJournal{
 uuid.parse(id);
 if(bytes.subarray(0,magic.length).toString('ascii')!==magic){
  const data=v1.parse(JSON.parse(unseal(decodeText(bytes),`workspace-import:${id}`)));
  if(data.id!==id)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
  return {...data,format:1,state:'ready',unresolved:false};
 }
 const text=decodeText(bytes),parts=text.split('\n');
 if(parts[0]!=='WIMP2'||parts.length<3)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
 const {data,headerHash}=decodeHeaderLine(parts[1],id);
 const complete=parts.at(-1)==='',lines=parts.slice(2,complete?-1:-1);
 const owners:OwnerClaim[]=[],claimLines:string[]=[];let state:ParsedJournal['state']='incomplete',unresolved=true;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],kind=line.slice(0,2),cipher=line.slice(2);
  if(!validCipher(cipher)||!['C ','R ','A '].includes(kind))throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
  if(state!=='incomplete')throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
  if(kind==='C '){
   const item=claim.parse(JSON.parse(unseal(cipher,aad(id,headerHash,'claim',owners.length))));
   if(item.seq!==owners.length||item.id!==data.planned[owners.length])throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
   owners.push({id:item.id,device:item.device,inode:item.inode});claimLines.push(`${line}\n`);
  }else if(kind==='R '){
   const terminal=ready.parse(JSON.parse(unseal(cipher,aad(id,headerHash,'ready',owners.length))));
   if(terminal.count!==data.planned.length||owners.length!==data.planned.length||terminal.transcript!==digest(claimLines.join('')))
    throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
   state='ready';unresolved=false;
  }else{
   const terminal=abort.parse(JSON.parse(unseal(cipher,aad(id,headerHash,'abort',owners.length))));
   if(terminal.count!==owners.length||terminal.pending&&terminal.pending.id!==data.planned[owners.length])throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
   if(terminal.pending)owners.push(terminal.pending);
   state='abort';unresolved=terminal.unresolved;
  }
 }
 if(!complete&&state!=='incomplete')throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
 if(state==='ready'&&!complete)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
 if(state==='abort'&&!complete)throw Error('WORKSPACE_IMPORT_JOURNAL_INVALID');
 return {format:2,id:data.id,tenant:data.tenant,user:data.user,project:data.project,planned:data.planned,owners,state,unresolved};
}
