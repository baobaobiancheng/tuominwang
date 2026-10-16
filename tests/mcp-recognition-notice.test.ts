import {test} from 'vitest';
import assert from 'node:assert/strict';
import {recognitionNotice,reviewDeliveryProjection} from '../packages/core/mcp-tools.ts';

test('source 0.8 threshold, unknown confidence, and fragmented name are counted as logical entities',()=>{
 const sig={id:'sig_11111111111111111111111111111111'};
 const notice=recognitionNotice([[{signatureGroup:sig,sources:[{score:.35}]},{signatureGroup:sig,sources:[{score:.72}]},{sources:[{score:.8}]},{sources:[]}],[{signatureGroup:sig,sources:[{score:.9}]}]],false,'automatic','sanitized_artifact_ready');
 assert.deepEqual(notice.statistics,{documentCount:2,entityCount:4,totalDocumentCount:2,failedDocumentCount:0,lowConfidenceCount:1,unknownConfidenceCount:1,humanReviewed:false});
 assert.match(notice.userMessage,/1 处低置信实体/);
 assert.match(notice.userMessage,/自动流程无需等待人工确认/);
 assert.equal(notice.humanReviewRecommended,true);
});
test('real human review wording differs from automatic and does not invent a TMM opening event',()=>{
 const reviewed=recognitionNotice([[{sources:[{score:.9}]}]],true,'automatic','sanitized_artifact_ready');
 assert.match(reviewed.userMessage,/您已完成人工复核/);
 const manual=recognitionNotice([[{sources:[{score:.9}]}]],false,'human_review','waiting_for_human_review');
 assert.match(manual.userMessage,/尚未完成人工复核/);
 assert.doesNotMatch(manual.userMessage,/已打开/);
});

test('ready manual and automatic terminal messages do not claim further recognition is pending',()=>{
 const mark={sources:[{score:.9}]};
 const manual=recognitionNotice([[mark]],true,'human_review','sanitized_artifact_ready');
 assert.match(manual.userMessage,/已完成可交付材料/);assert.doesNotMatch(manual.userMessage,/继续等待/);
 const automatic=recognitionNotice([[mark]],false,'automatic','round_completed');
 assert.match(automatic.userMessage,/已完成可交付材料/);assert.doesNotMatch(automatic.userMessage,/正在处理/);
});
test('partial batch states state scoped counts and conservative fragment confidence',()=>{
 const sig={id:'sig_11111111111111111111111111111111'};
 const notice=recognitionNotice([[{signatureGroup:sig,sources:[{score:.9}]},{signatureGroup:sig,sources:[{score:.3}]}]],false,'automatic','waiting_for_human_review',3,1);
 assert.deepEqual(notice.statistics,{documentCount:1,totalDocumentCount:3,failedDocumentCount:1,entityCount:1,lowConfidenceCount:1,unknownConfidenceCount:0,humanReviewed:false});
 assert.match(notice.userMessage,/已完成 1\/3 份/);assert.match(notice.userMessage,/1 份失败，1 份仍在处理/);
 const unknown=recognitionNotice([[{signatureGroup:sig,sources:[{score:.9}]},{signatureGroup:sig,sources:[]}]],false,'automatic','round_completed');
 assert.equal(unknown.statistics.unknownConfidenceCount,1);assert.equal(unknown.statistics.lowConfidenceCount,0);
});

test('completed and failed terminal states never instruct further recognition or review waiting',()=>{
 const mark={sources:[{score:.9}]};
 for(const mode of ['automatic','human_review'] as const)for(const status of ['completed','failed','cancelled_by_user','restore_failed','ai_result_rejected']){
  const notice=recognitionNotice([[mark]],true,mode,status);
  assert.doesNotMatch(notice.userMessage,/正在处理|仍在处理|继续等待|正在继续后台/);
 }
 const restoring=recognitionNotice([[mark]],false,'automatic','restoring');
 assert.match(restoring.userMessage,/正在执行还原流程/);assert.doesNotMatch(restoring.userMessage,/正在处理尚未完成的材料/);
});

test('wait projection reports failure even before recognition statistics exist',()=>{
 const result=reviewDeliveryProjection({state:'failed',executionMode:'automatic',timedOut:true});
 assert.equal(result.nextAction,'report_failed_documents');assert.deepEqual(result.wait,{timedOut:false,retry:false});
 assert.equal(result.failedDocumentCount,1);assert.match(result.userMessage!,/失败文档未交付/);assert.match(result.instructions!,/不要继续轮询/);
});
test('human wait, automatic ready, and verified visual fallback keep distinct actions',()=>{
 const human=reviewDeliveryProjection({state:'waiting_for_human_review',executionMode:'human_review',timedOut:true,documents:[{status:'pending'}]});
 assert.equal(human.nextAction,'wait_for_user_review_in_lawbot');assert.deepEqual(human.wait,{timedOut:true,retry:true});
 const ready=reviewDeliveryProjection({state:'sanitized_artifact_ready',executionMode:'automatic',timedOut:false,documents:[{status:'succeeded',visualFallback:true},{status:'failed'}],statistics:{documentCount:1,failedDocumentCount:1}});
 assert.equal(ready.nextAction,'continue_automatically');assert.equal(ready.failedDocumentCount,1);assert.equal(ready.visualFallbackCount,1);assert.equal(ready.wait,undefined);
 const notice=reviewDeliveryProjection({state:'sanitized_artifact_ready',executionMode:'automatic',timedOut:false,documents:[{status:'succeeded',visualFallback:true}],userMessage:'识别完成。'});
 assert.equal(notice.visualFallbackCount,1);assert.match(notice.userMessage!,/其中 1 份 Markdown 未能交付，已改用校验通过的假名 PDF\/图片继续审查/);
 const ordinary=reviewDeliveryProjection({state:'sanitized_artifact_ready',executionMode:'automatic',timedOut:false,documents:[{status:'succeeded'}],userMessage:'识别完成。'});
 assert.equal(ordinary.visualFallbackCount,0);assert.equal(ordinary.userMessage,'识别完成。');
 const cancelled=reviewDeliveryProjection({state:'cancelled_by_user',executionMode:'automatic',timedOut:false,documents:[{status:'cancelled_by_user'}]});assert.equal(cancelled.failedDocumentCount,0);assert.equal(cancelled.nextAction,'report_failed_documents');
});
