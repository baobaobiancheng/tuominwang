import type{RegionBox}from'./repeated-regions.ts';
export const regionResizeHandles=['nw','n','ne','e','se','s','sw','w']as const;
export type RegionResizeHandle=typeof regionResizeHandles[number];
/** Source gr2/yr2/wr2 display-space edit, expressed in the current authenticated
 * canonical raster. Six display pixels become canonical minimum dimensions.
 * Unlike source br2's oversized-box branch, clipping never escapes a page. */
export function editRegionBox(before:RegionBox,mode:'move'|'resize',handle:RegionResizeHandle,dx:number,dy:number,page:{width:number;height:number},displayScale={x:1,y:1}):RegionBox{
 if(![before.x,before.y,before.width,before.height,dx,dy,page.width,page.height,displayScale.x,displayScale.y].every(Number.isFinite)||page.width<=0||page.height<=0||displayScale.x<=0||displayScale.y<=0||before.x<0||before.y<0||before.width<=0||before.height<=0||before.x+before.width>page.width||before.y+before.height>page.height)throw Error('REGION_EDIT_INVALID');
 const minWidth=Math.min(page.width,6/displayScale.x),minHeight=Math.min(page.height,6/displayScale.y);let{x,y,width,height}=before;
 if(mode==='move'){x+=dx;y+=dy;}else{if(handle.includes('e'))width=Math.max(minWidth,width+dx);if(handle.includes('s'))height=Math.max(minHeight,height+dy);if(handle.includes('w')){width=Math.max(minWidth,before.width-dx);x=before.x+before.width-width;}if(handle.includes('n')){height=Math.max(minHeight,before.height-dy);y=before.y+before.height-height;}}
 width=Math.min(page.width,Math.max(minWidth,width));height=Math.min(page.height,Math.max(minHeight,height));x=Math.max(0,Math.min(x,page.width-width));y=Math.max(0,Math.min(y,page.height-height));return{...before,x,y,width,height};
}
export function regionHandlePosition(box:RegionBox,handle:RegionResizeHandle){return{x:box.x+(handle.includes('w')?0:handle.includes('e')?box.width:box.width/2),y:box.y+(handle.includes('n')?0:handle.includes('s')?box.height:box.height/2)};}
