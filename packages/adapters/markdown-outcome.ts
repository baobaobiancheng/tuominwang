import {profileForFormat} from '../core/presets.ts';
export function expectsMarkdownExport(d:any){
 if(d.source_format==='md'||d.documentPolicy?.configuration.outputFormats?.includes('md'))return true;
 const profile=d.presetPolicy?.profile?.settings;
 return !!profile&&!!(profileForFormat(profile,d.source_format,d.batchMode) as {exportMarkdown?:boolean}).exportMarkdown;
}
export function markdownSourceKind(format:string){return format==='md'?'markdown':['png','jpg','jpeg'].includes(format)?'image':format==='docx'?'docx':format==='pdf'?'pdf':'unknown';}
