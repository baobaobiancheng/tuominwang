import {test,expect} from 'vitest';
import {openPageReview,sealPageReview} from '../packages/adapters/page-review-storage.ts';
process.env.DATA_KEY='a'.repeat(64);
const doc={id:'doc-synthetic',tenant_id:'tenant-synthetic',project_id:'project-synthetic',revision:4,source_hash:'original-hash',content_hash:'canonical-hash'};
const review={mode:'raster' as const,regions:[{id:'1abc1234-1234-4123-8123-123456789abc',page:0,x:2,y:3,width:7,height:9,shape:'circle' as const,reason:'敏感区域' as const,entityType:'客户私有类型',text:'合成私人原文',meta:{raw:'合成meta原文',nested:{tokens:['保留字段',3]}}}],deletedPages:[],maskStyle:'white' as const};
test('region private metadata is AEAD sealed without losing any circle/text/meta fields; snapshots rebind revision',()=>{
 const stored=sealPageReview(doc,review,5),json=JSON.stringify(stored);expect(json).not.toContain('合成私人原文');expect(json).not.toContain('合成meta原文');expect(json).not.toContain('客户私有类型');expect(stored.regions[0].shape).toBe('circle');expect(openPageReview({...doc,revision:5},stored)).toEqual(review);expect(()=>openPageReview(doc,stored)).toThrow('PAGE_REVIEW_STORAGE_INVALID');
 const storedAgain=sealPageReview({...doc,revision:5},openPageReview({...doc,revision:5},stored),6);expect(openPageReview({...doc,revision:6},storedAgain)).toEqual(review);expect(storedAgain.regions[0].privateMetadata.ciphertext).not.toBe(stored.regions[0].privateMetadata.ciphertext);
});
test('region storage refuses cross-document/project/source/content/geometry transplant and mixed plaintext envelopes',()=>{
 const stored=sealPageReview(doc,review);for(const patch of[{id:'other'},{tenant_id:'other'},{project_id:'other'},{source_hash:'other'},{content_hash:'other'}])expect(()=>openPageReview({...doc,...patch},stored)).toThrow('PAGE_REVIEW_STORAGE_INVALID');
 for(const patch of[{x:3},{shape:'rect'},{reason:'签名'},{id:'other'},{text:'forged'},{meta:{}}]){const changed=structuredClone(stored);Object.assign(changed.regions[0],patch);expect(()=>openPageReview(doc,changed)).toThrow('PAGE_REVIEW_STORAGE_INVALID');}
});
test('legacy geometry stays identical; legacy metadata is accepted only for migration and is sealed on next write',()=>{
 const geometry={mode:'unselected',regions:[{id:'2abc1234-1234-4123-8123-123456789abc',page:0,x:0,y:0,width:1,height:1,reason:'敏感区域'}],deletedPages:[]};expect(sealPageReview(doc,geometry)).toEqual(geometry);expect(openPageReview(doc,geometry)).toEqual(geometry);expect(openPageReview(doc,sealPageReview(doc,review))).toEqual(review);expect(openPageReview(doc,null)).toBeNull();
});
