import{rows,sql,type DB}from'./db.ts';
import{seal,unseal}from'./storage.ts';
import{nativeToReference,workspaceReviewProfile}from'../core/workspace-compat.ts';
import type{NativePortable}from'../core/native-portable.ts';
type Actor={id:string;tenant_id:string};
const aad=(user:Actor,project:string)=>`${user.tenant_id}:${user.id}:${project}:workspace-recent`;
export function portableReusableCounts(snapshot:NativePortable,sources:Map<string,Buffer>,project:string){
 try{const projected=nativeToReference(snapshot,sources,project),profile=workspaceReviewProfile({snapshot:projected.snapshot,sources:projected.sources,format:'legacy-zip'} as any);return{reusableContentKnown:true,reusableCorrectionCount:profile.corrections.length,reusablePseudonymCount:profile.pseudonyms.entries.length};}catch{return{reusableContentKnown:false};}
}
export async function rememberWorkspaceRecent(db:DB,user:Actor,project:string,input:{documentId?:string|null;saved?:boolean;snapshot?:NativePortable;sources?:Map<string,Buffer>;reusable?:{reusableContentKnown:boolean;reusableCorrectionCount?:number;reusablePseudonymCount?:number}}={}){
 const[p]=await rows(db,sql`SELECT name FROM projects WHERE id=${project}`),docs=await rows(db,sql`SELECT id,source_name,source_format FROM documents WHERE project_id=${project} ORDER BY id`),first=docs[0],firstName=first?.source_name?unseal(first.source_name,`${user.tenant_id}:${project}:${first.id}:name`):null;
 const displayName=docs.length>1?(firstName?`${firstName} 等 ${docs.length} 份文档`:`批量审查（${docs.length}份文档）`):firstName||p.name;
 const[previous]=await rows(db,sql`SELECT metadata FROM workspace_recents WHERE project_id=${project} AND user_id=${user.id}`),old=previous?.metadata?JSON.parse(unseal(previous.metadata,aad(user,project))):{};
 const counts=input.reusable??(input.snapshot&&input.sources?portableReusableCounts(input.snapshot,input.sources,project):{reusableContentKnown:false});
 const metadata={displayName,documentCount:docs.length,...old,...counts};metadata.displayName=displayName;metadata.documentCount=docs.length;
 if(!counts.reusableContentKnown){delete metadata.reusableCorrectionCount;delete metadata.reusablePseudonymCount;}
 await rows(db,sql`INSERT INTO workspace_recents(tenant_id,project_id,user_id,document_id,saved_at,metadata) VALUES(${user.tenant_id},${project},${user.id},${input.documentId??null},${input.saved?new Date():null},${seal(JSON.stringify(metadata),aad(user,project))}) ON CONFLICT(project_id,user_id) DO UPDATE SET document_id=excluded.document_id,opened_at=now(),saved_at=coalesce(excluded.saved_at,workspace_recents.saved_at),metadata=excluded.metadata`);
 // Source _g.remember keeps20 MRU entries. This evicts only the recent index, never material or issued files.
 await rows(db,sql`DELETE FROM workspace_recents WHERE user_id=${user.id} AND project_id IN(SELECT project_id FROM workspace_recents WHERE user_id=${user.id} ORDER BY opened_at DESC,project_id DESC OFFSET 20)`);
}
export function openWorkspaceRecent(user:Actor,row:any){const metadata=row.metadata?JSON.parse(unseal(row.metadata,aad(user,row.projectId))):{displayName:row.name,documentCount:null,reusableContentKnown:false};return{projectId:row.projectId,documentId:row.documentId,name:row.name,openedAt:row.openedAt,lastOpenedAt:row.openedAt,lastSavedAt:row.saved_at??null,...metadata,filePath:null,fileExists:null,location:'cloud-project'};}
