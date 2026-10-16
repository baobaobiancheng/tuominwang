import {test,expect} from 'vitest';
import {selectableOcrLines} from '../packages/core/selectable-ocr.ts';

test('temporary OCR has physical line and character boxes without publishing document offsets',()=>{
 const lines=selectableOcrLines({text:'甲😀\n乙',confidence:88,glyphs:[[0,1,2,4,8,10],[1,3,12,4,8,10],[4,5,3,25,8,10]]},100,100);
 expect(lines).toEqual([{text:'甲😀',confidence:88,bbox:{x:2,y:4,width:18,height:10},charBoxes:[{text:'甲',bbox:{x:2,y:4,width:8,height:10}},{text:'😀',bbox:{x:12,y:4,width:8,height:10}}]},{text:'乙',confidence:88,bbox:{x:3,y:25,width:8,height:10},charBoxes:[{text:'乙',bbox:{x:3,y:25,width:8,height:10}}]}]);
 expect(JSON.stringify(lines)).not.toMatch(/start|end|canonical/);
 expect(selectableOcrLines({text:'A B',confidence:90,glyphs:[[0,1,2,4,8,10],[1,2,10,4,4,0],[2,3,15,4,8,10]]},100,100)[0].charBoxes.map(box=>box.text)).toEqual(['A','B']);
 expect(()=>selectableOcrLines({text:'甲',confidence:88,glyphs:[[0,1,99,0,2,10]]},100,100)).toThrow('OCR_SELECTION_INVALID');
});
