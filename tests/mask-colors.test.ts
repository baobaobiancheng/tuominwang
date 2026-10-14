import {it,expect} from 'vitest';
import sharp from 'sharp';
import {clearPixels,MASK_COLORS} from '../packages/core/page-redaction.ts';
it('clears every selected pixel in all four mask styles and only outlines inside the white union',async()=>{
  const input=await sharp({create:{width:20,height:20,channels:3,background:'#aabbcc'}}).png().toBuffer();
  const page={index:0,width:20,height:20},boxes=[{x:2,y:2,width:8,height:8},{x:6,y:6,width:8,height:8}];
  for(const style of Object.keys(MASK_COLORS) as (keyof typeof MASK_COLORS)[]){
    const {rgb}=await clearPixels(input,page,boxes,style);
    for(let y=0;y<20;y++)for(let x=0;x<20;x++){
      const pixel=[...rgb.subarray((y*20+x)*3,(y*20+x)*3+3)],inside=boxes.some(b=>x>=b.x&&x<b.x+b.width&&y>=b.y&&y<b.y+b.height);
      if(!inside)expect(pixel).toEqual([170,187,204]);
      else if(style==='white')expect([[255,255,255],[51,51,51]]).toContainEqual(pixel);
      else expect(pixel).toEqual([...MASK_COLORS[style]]);
    }
    expect([...rgb.subarray((7*20+7)*3,(7*20+7)*3+3)]).toEqual([...MASK_COLORS[style]]);
  }
});
