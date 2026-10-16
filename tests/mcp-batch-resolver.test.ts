import {test,expect} from 'vitest';
import {resolveReceivableJob} from '../packages/core/reference/batch-delivery.js';
import {mcpDispatch} from '../packages/core/mcp-tools.js';

test('original batch selector accepts only one current receivable child or the exact parent artifact',()=>{
 const status={status:'sanitized_artifact_ready',redactionOptions:{executionMode:'automatic'},documents:[
  {jobId:'lbj_first',status:'sanitized_artifact_ready',sanitizedArtifact:{artifactId:'lba_first'}},
  {jobId:'lbj_second',status:'analyzing_by_ai',sanitizedArtifact:{artifactId:'lba_second'}}
 ]};
 expect(resolveReceivableJob(status,'lbj_parent','lba_second')).toBe('lbj_second');
 expect(()=>resolveReceivableJob(status,'lbj_parent')).toThrow(/documents/u);
 expect(()=>resolveReceivableJob(status,'lbj_parent','lba_stale')).toThrow(/批量父任务/u);
 expect(()=>resolveReceivableJob({...status,documents:[status.documents[0],{...status.documents[1],sanitizedArtifact:{artifactId:'lba_first'}}]},'lbj_parent','lba_first')).toThrow(/批量父任务/u);
 expect(()=>resolveReceivableJob({...status,documents:[{...status.documents[0],status:'completed'}]},'lbj_parent','lba_first')).toThrow(/批量父任务/u);
 expect(resolveReceivableJob({...status,sanitizedArtifact:{artifactId:'lba_parent'}},'lbj_parent','lba_parent')).toBe('lbj_parent');
});

test('known original batch guidance survives the MCP error boundary',async()=>{
 const session={caller:{sessionId:'test',adapterId:'test',displayName:'test'},initialized:true,protocol:'2025-11-25'};
 const result=await mcpDispatch({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'receive_sanitized_document',arguments:{job_id:`lbj_${'a'.repeat(32)}`}}},session,async()=>{throw new Error('BATCH_CHILD_JOB_REQUIRED');});
 expect(result.result.isError).toBe(true);
 expect(result.result.structuredContent.error).toBe('BATCH_CHILD_JOB_REQUIRED');
 expect(result.result.structuredContent.instructions).toContain('check_document_delivery');
 expect(result.result.content[0].text).toContain('sanitizedArtifact.artifactId');
});
