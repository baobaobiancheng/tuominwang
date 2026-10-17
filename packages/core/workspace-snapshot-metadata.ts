/** The imported archive remains historical evidence; only document selection is mapped into this project. */
export function workspaceSnapshotMetadata(projectCreatedAt:string,documentIds:string[],imported:unknown,selectedDocumentId?:string){
 const saved=imported&&typeof imported==='object'?imported as {importedSnapshot?:{createdAt?:unknown;activeDocumentId?:unknown;project?:{createdAt?:unknown;activeDocumentId?:unknown}};documentIdMap?:Record<string,string>}:null;
 const original=saved?.importedSnapshot;
 const createdAt=typeof original?.createdAt==='string'?original.createdAt:typeof original?.project?.createdAt==='string'?original.project.createdAt:projectCreatedAt;
 const ids=new Set(documentIds);
 if(selectedDocumentId!==undefined&&!ids.has(selectedDocumentId))throw Error('PORTABLE_ACTIVE_DOCUMENT_INVALID');
 const oldActive=original?.activeDocumentId===undefined?original?.project?.activeDocumentId:original.activeDocumentId;
 const mapped=oldActive===null?null:typeof oldActive==='string'?saved?.documentIdMap?.[oldActive]:undefined;
 const activeDocumentId=selectedDocumentId??(mapped===null||typeof mapped==='string'&&ids.has(mapped)?mapped:oldActive===null?null:documentIds[0]??null);
 return {createdAt,activeDocumentId};
}
