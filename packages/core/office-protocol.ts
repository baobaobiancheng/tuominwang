import type {Anchor} from '../contracts/index.ts';
/** Fixed format identifiers in their structural attributes, never a global URL whitelist. */
export function isOfficeProtocolAttribute(text:string,anchor:Anchor){
 if(anchor.kind!=='object'||!/^word\/.+\.xml$/u.test(anchor.part??'')||!/^attribute:\d+:(?:[^:]+:)?uri$/u.test(anchor.object??''))return false;
 const value=text.slice(anchor.start,anchor.end);
 return value==='http://schemas.openxmlformats.org/drawingml/2006/picture'||anchor.part==='word/settings.xml'&&value==='http://schemas.microsoft.com/office/word';
}
