import{it,expect}from'vitest';
import{workspaceSnapshotMetadata}from'../packages/core/workspace-snapshot-metadata.ts';

it('maps imported active document, honors a newer selection, and retains the original creation time',()=>{
 const imported={importedSnapshot:{createdAt:'2020-01-01T00:00:00Z',activeDocumentId:'old-b'},documentIdMap:{'old-a':'new-a','old-b':'new-b'}};
 expect(workspaceSnapshotMetadata('2026-10-17T00:00:00Z',['new-a','new-b'],imported)).toEqual({createdAt:'2020-01-01T00:00:00Z',activeDocumentId:'new-b'});
 expect(workspaceSnapshotMetadata('2026-10-17T00:00:00Z',['new-a','new-b'],imported,'new-a')).toEqual({createdAt:'2020-01-01T00:00:00Z',activeDocumentId:'new-a'});
 expect(()=>workspaceSnapshotMetadata('2026-10-17T00:00:00Z',['new-a','new-b'],imported,'other-project-doc')).toThrow('PORTABLE_ACTIVE_DOCUMENT_INVALID');
 expect(workspaceSnapshotMetadata('2026-10-17T00:00:00Z',['new-a','new-b'],null)).toEqual({createdAt:'2026-10-17T00:00:00Z',activeDocumentId:'new-a'});
});

it('keeps an explicitly unselected imported workspace empty without granting old review state',()=>{
 const imported={importedSnapshot:{createdAt:'2020-01-01',activeDocumentId:null,reviewDecisionEvents:[{actor:'historical'}]},documentIdMap:{}};
 expect(workspaceSnapshotMetadata('2026-10-17',['new-a'],imported)).toEqual({createdAt:'2020-01-01',activeDocumentId:null});
 expect(workspaceSnapshotMetadata('2026-10-17',['new-a'],{...imported,importedSnapshot:{...imported.importedSnapshot,activeDocumentId:'deleted'}})).toEqual({createdAt:'2020-01-01',activeDocumentId:'new-a'});
});
