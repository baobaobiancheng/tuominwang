import {test,expect} from 'vitest';
import type {Mark} from '../packages/contracts/index.ts';
import {deriveReviewProvenance,transitionReviewProvenance,assertReviewProvenance,referenceReviewMetadata} from '../packages/core/review-provenance.ts';
const ctx={documentId:'synthetic-doc',contentHash:'a'.repeat(64),revision:0},actor='actual-server-actor',now='2026-10-15T04:00:00.000Z';
const mark:Mark={start:0,end:11,kind:'手机号',decision:'pending',sources:[{layer:'rules',code:'cn-mobile',score:.95}]};
test('current state does not invent historical actors; real transitions retain ids, server actor/time and removed entities',()=>{
 const first=deriveReviewProvenance(ctx,[mark]),before=structuredClone(first);expect(first.earlierHistoryKnown).toBe(false);expect(first.entries[0].meta.reviewState.actorId).toBeUndefined();
 const next=transitionReviewProvenance(first,{...ctx,revision:1},[mark],[{...mark,decision:'redact'}],actor,now);expect(first).toEqual(before);expect(next.entries[0].id).toBe(first.entries[0].id);expect(next.entries[0].meta.reviewState).toMatchObject({status:'confirmed',actorId:actor,updatedAt:now});expect(referenceReviewMetadata(next.entries[0],'13800138000').reviewState.editedText).toBe('13800138000');
 const removed=transitionReviewProvenance(next,{...ctx,revision:2},[{...mark,decision:'redact'}],[],actor,now);expect(removed.entries[0].active).toBe(false);expect(removed.entries[0].meta.reviewState.status).toBe('rejected');
 const restored=transitionReviewProvenance(removed,{...ctx,revision:3},[],[mark],actor,now);expect(restored.entries[0].id).toBe(first.entries[0].id);expect(restored.entries[0].active).toBe(true);expect(restored.entries[0].meta.sourceChain.map(e=>e.action)).toEqual(['observed-current-state','entity-confirmed','entity-removed','entity-added']);
});
test('duplicate spans and exact raw identities remain independently identifiable and ordered',()=>{
 const raw:Mark={...mark,kind:'自定义',rawEntityType:' Phone '},marks=[mark,{...mark,decision:'ignore' as const},raw],frame=deriveReviewProvenance(ctx,marks);expect(new Set(frame.entries.map(e=>e.id)).size).toBe(3);expect(frame.entries.map(e=>e.markIndex)).toEqual([0,1,2]);expect(()=>assertReviewProvenance(frame,ctx)).not.toThrow();
 const after=transitionReviewProvenance(frame,{...ctx,revision:1},marks,[mark,{...mark,decision:'redact'},raw],actor,now);expect(after.entries.map(e=>e.id)).toEqual(frame.entries.map(e=>e.id));expect(after.entries[1].meta.reviewState.status).toBe('confirmed');expect(after.entries[0].meta.reviewState.actorId).toBeUndefined();expect(after.entries[2].meta.reviewState.editedType).toBe(' Phone ');
});
test('server provenance retains every recorded event while revision/content/range tampering fails closed',()=>{
 let old=mark,frame=deriveReviewProvenance(ctx,[old]);for(let revision=1;revision<=20;revision++){const next:Mark={...old,decision:revision%2?'redact':'ignore'};frame=transitionReviewProvenance(frame,{...ctx,revision},[old],[next],actor,now);old=next;}expect(frame.entries[0].meta.sourceChain).toHaveLength(21);expect(frame.entries[0].meta.sourceChain.at(-1)?.action).toBe('entity-rejected');
 expect(()=>assertReviewProvenance(frame,{...ctx,revision:19})).toThrow('REVIEW_PROVENANCE_INVALID');expect(()=>assertReviewProvenance(frame,{...ctx,revision:20,contentHash:'b'.repeat(64)})).toThrow('REVIEW_PROVENANCE_INVALID');const bad=structuredClone(frame);bad.entries[0].meta.reviewState.editedRange.end++;expect(()=>assertReviewProvenance(bad,{...ctx,revision:20})).toThrow('REVIEW_PROVENANCE_INVALID');
});
