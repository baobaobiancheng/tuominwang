import sharp from 'sharp';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {writeZip} from '../packages/core/office-zip.ts';
import {normalizeOfficeMedia} from '../packages/core/office-media.ts';
import {detectOfficeImageFaces} from '../packages/adapters/office-visual.ts';
import type {ParsedPage} from '../packages/contracts/index.ts';
const hash=(b:Buffer)=>createHash('sha256').update(b).digest('hex'),source=await readFile('.data/evals/visual/opencv-messi5.jpg'),first=await sharp(source).removeAlpha().raw().toBuffer({resolveWithObject:true}),second=await sharp(source).flop().removeAlpha().raw().toBuffer(),results=[];
for(const format of ['gif','tiff'] as const){const image=sharp(Buffer.concat([first.data,second]),{raw:{width:first.info.width,height:first.info.height*2,channels:3,pageHeight:first.info.height}}),bytes=await(format==='gif'?image.gif():image.tiff({compression:'none'})).toBuffer(),media=await normalizeOfficeMedia(bytes),part=`word/media/publicface.${format}`,zip=await writeZip(new Map([[part,bytes]])),page:ParsedPage={index:0,width:media.width,height:media.height,previewId:'public',previewHash:hash(media.png),mapId:'unused',mapHash:'unused',confidence:0,rotation:0,part},detected=await detectOfficeImageFaces(zip,[page],async()=>media.png),frameCounts=media.frames.map(frame=>detected.candidates.filter(c=>c.y>=frame.y&&c.y+c.height<=frame.y+frame.height).length);if(frameCounts.some(c=>c<1))throw new Error('MULTIFRAME_FACE_SMOKE_FAILED');results.push({format,frames:media.frames,frameCounts,candidates:detected.candidates,faceVersion:detected.faceVersion});}
await writeFile('.data/research/lawbot-2026-10-14/iteration022/office-media-face-smoke.json',JSON.stringify({source:'.data/evals/visual/opencv-messi5.jpg',sourceHash:hash(source),scope:'public OpenCV image+mirrored second frame smoke; not independent real-corpus accuracy',results},null,2)+'\n');
