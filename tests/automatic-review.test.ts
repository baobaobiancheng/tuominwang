import {test} from 'vitest';
import {strict as assert} from 'node:assert';
import {automaticReviewMarks} from '../packages/core/automatic-review.ts';
import {parseFile} from '../packages/core/files.ts';
import {detectComplete} from '../packages/core/recognition-pipeline.ts';
import {mergeCandidates} from '../packages/core/redaction.ts';
import {documentTableMarks} from '../packages/adapters/reference-table.ts';
import {assertSignatureGroups} from '../packages/core/review-groups.ts';

test('automatic source decisions, low confidence, overlaps, and source guards',()=>{
const detection = {start: 0, end: 4, kind: '姓名', decision: 'pending',
  sources: [{layer: 'rules', code: 'name-rule', score: .35}]};
const lowConfidenceFrame={recognition:{lowConfidenceCount:1},marks:[detection]};
const outcome = automaticReviewMarks(lowConfidenceFrame.marks as any);
assert.equal(lowConfidenceFrame.recognition.lowConfidenceCount,1);
assert.equal(outcome.marks.length,lowConfidenceFrame.marks.length);
assert.deepEqual(outcome.suppressed,[]);
assert.equal(outcome.marks[0].decision, 'redact');
assert.equal((outcome.marks[0].sources as any)[0].score, .35); // Low confidence is visible, not a hard gate.
assert.equal(lowConfidenceFrame.marks[0].decision, 'pending'); // The detected snapshot is never rewritten.
assert.equal(automaticReviewMarks([{...detection, sources: [{layer: 'rules', code: 'project-whitelist'}]}] as any).marks[0].decision, 'ignore');
const overlap=automaticReviewMarks([detection,{...detection,end:6,kind:'身份证号'}] as any);
assert.deepEqual(overlap.marks.map(m=>m.decision),['ignore','redact']);
assert.deepEqual(overlap.suppressed.map(s=>[s.loser,s.winner,s.reason]),[[0,1,'source-priority']]);
const orgText='某某公司业务',org=automaticReviewMarks([
  {...detection,start:0,end:6,kind:'机构'},
  {...detection,start:0,end:4,kind:'机构'},
] as any,orgText);
assert.deepEqual(org.marks.map(m=>m.decision),['ignore','redact']);
assert.equal(org.suppressed[0].reason,'organization-specificity');
const card=automaticReviewMarks([
  {...detection,start:0,end:4,kind:'身份证号'},
  {...detection,start:0,end:5,kind:'身份证号'},
] as any);
assert.deepEqual(card.marks.map(m=>m.decision),['ignore','redact']);
assert.equal(card.suppressed[0].reason,'same-kind-length');
assert.throws(()=>automaticReviewMarks([detection,{...detection,end:6,kind:'身份证号',signatureGroup:'g'}] as any),/SIGNATURE_GROUP_INVALID/);
for (const input of [
  {...detection, sources: []},
  {...detection, sources: [{layer: 'manual', code: 'user'}]},
  {...detection, decision: 'redact'},
  {...detection, userAdded: true},
  {...detection, replacementOrigin: 'manual'},
]) assert.throws(() => automaticReviewMarks([input] as any));


});

test('reconstructed signature name competes once, then writes one decision to every physical member',async()=>{
  const bytes=Buffer.from('签名,签名\n张,三\n'),parsed=parseFile(bytes,'csv');
  const table=await documentTableMarks(bytes,parsed.text,parsed.anchors,'csv');
  const dictionary=detectComplete(parsed.text,parsed.anchors,[{value:'张',kind:'自定义',action:'include'}]);
  const marks=mergeCandidates(parsed.text,dictionary.marks,table.marks);
  const group=marks.filter(m=>m.signatureGroup);
  assert.equal(group.length,2);
  const decided=automaticReviewMarks(marks,parsed.text);
  const members=decided.marks.filter(m=>m.signatureGroup);
  assert.deepEqual(members.map(m=>m.decision),['redact','redact']);
  assert.equal(decided.marks.find(m=>m.kind==='自定义')?.decision,'ignore');
  assert.equal(decided.suppressed.find(s=>s.loser===marks.findIndex(m=>m.kind==='自定义'))?.winnerGroup,group[0].signatureGroup!.id);
  assertSignatureGroups(decided.marks);

  const forced=marks.map(m=>m.kind==='自定义'?{...m,sources:[{layer:'rules' as const,code:'ruleset-force-detect:fixture',score:1}]}:m);
  const override=automaticReviewMarks(forced,parsed.text);
  assert.deepEqual(override.marks.filter(m=>m.signatureGroup).map(m=>m.decision),['ignore','ignore']);
  assert.equal(override.marks.find(m=>m.kind==='自定义')?.decision,'redact');
  assert.deepEqual(override.suppressed.filter(s=>s.loserGroup===group[0].signatureGroup!.id).map(s=>s.loser).sort(),
    marks.map((m,i)=>m.signatureGroup?i:-1).filter(i=>i>=0).sort());
  assertSignatureGroups(override.marks);

  const mixed=marks.map((m,i)=>i===marks.findIndex(x=>x.signatureGroup)?{...m,sources:[{layer:'rules' as const,code:'project-whitelist'}]}:m);
  assert.throws(()=>automaticReviewMarks(mixed,parsed.text),/AUTOMATIC_SIGNATURE_MIXED_WHITELIST/);
  const first=group[0],last=group[1];
  assert.equal(parsed.text.slice(first.end,last.start),'\n');
  const contaminated=parsed.text.slice(0,first.end)+'X'+parsed.text.slice(last.start);
  assert.throws(()=>automaticReviewMarks(marks,contaminated),/AUTOMATIC_SIGNATURE_LOGICAL_SPAN_UNPROVEN/);
  assert.throws(()=>automaticReviewMarks(marks.filter(m=>m.signatureGroup?.memberIndex!==1),parsed.text),/SIGNATURE_GROUP_INVALID/);
});
