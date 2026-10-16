import {it,expect} from 'vitest';
import {readZip} from '../packages/core/office-zip.ts';
import {aiDiagnosticZip,cleanAiDiagnosticEvent,safeAiDiagnosticCode,aiDiagnosticToolOutcome} from '../packages/core/ai-diagnostics.ts';

it('uses the original fixed diagnostic fields and packages no private input',async()=>{
 const jobId='lbj_'+'a'.repeat(32),secret='client-secret-source-path-and-document-text';
 expect(safeAiDiagnosticCode(secret)).toBe('INTERNAL_ERROR');
 const event=cleanAiDiagnosticEvent({jobId,at:'2026-10-16T00:00:00Z',adapter:'dsh',stage:'tool',outcome:'failed',tool:'check_document_delivery',durationMs:12.5,code:secret,...{path:secret,stack:secret}});
 expect(event).toMatchObject({jobId,stage:'tool',outcome:'failed',code:'INTERNAL_ERROR',durationMs:13});
 expect(JSON.stringify(event)).not.toContain(secret);
 const task={jobId,state:'failed',failureCode:secret,updatedAt:'2026-10-16T00:00:00Z',caller:{adapterId:'dsh',displayName:secret},options:{task_mode:'ai_process',output_formats:['docx',secret],source_path:secret},intent:{goals:['summary',secret],outputKinds:['risk_report'],outputFormat:'docx',customInstruction:secret},sources:[{name:secret}]};
 const zip=await aiDiagnosticZip(task,[event],true),files=await readZip(zip);
 expect([...files.keys()].sort()).toEqual(['协作过程.jsonl','环境信息.json','问题摘要.txt'].sort());
 const text=[...files.values()].map(x=>x.toString()).join('\n');
 expect(text).not.toContain(secret);expect(text).not.toContain('source_path');
 expect(text).toContain('historyLimited');expect(text).toContain('INTERNAL_ERROR');
 expect(text).toContain('check_document_delivery');
});

it('classifies original retry and active cloud delivery states as waiting',()=>{
 expect(aiDiagnosticToolOutcome({status:'building_sanitized_artifact'})).toBe('waiting');
 expect(aiDiagnosticToolOutcome({status:'analyzing_by_ai',wait:{retry:true}})).toBe('waiting');
 expect(aiDiagnosticToolOutcome({status:'waiting_for_session_authorization'})).toBe('waiting');
 expect(aiDiagnosticToolOutcome({status:'completed',wait:{retry:false}})).toBe('succeeded');
});
