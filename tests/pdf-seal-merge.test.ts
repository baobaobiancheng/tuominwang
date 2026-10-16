import {expect,test} from 'vitest';
import {mergePdfSealCandidates} from '../apps/api/pdf-seals.ts';

test('incremental PDF seal merge keeps one hit for the same type, page, and box',()=>{
 const previous={reason:'印章',page:2,x:10,y:20,width:30,height:40,score:0.91,detector:'old'};
 const sameBox={detector:'new',score:0.62,height:40,width:30,y:20,x:10,page:2,reason:'印章'};
 const otherPage={...sameBox,page:3},otherBox={...sameBox,x:11};
 const merged=mergePdfSealCandidates([previous],[sameBox,otherPage,otherBox]);
 expect(merged).toHaveLength(3);
 expect(merged[0]).toBe(previous);
 expect(merged[1]).toBe(otherPage);
 expect(merged[2]).toBe(otherBox);
});
