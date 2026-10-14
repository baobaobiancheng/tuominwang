import{createHash}from'node:crypto';
export const MANUAL_MARKDOWN_WARNING='> ⚠️ 本文件未通过自动脱敏安全检查，可能仍有敏感信息。\n> 请逐项检查并完成替换后再使用，不要直接发送或交付。\n';
export type MarkdownDraftBasis={kind:'original-markdown'|'markdown-output'|'converted-text';hash:string;artifactId?:string};
export function prepareManualMarkdownDraft(content:string,fileName:string){if(!content.isWellFormed()||!content.trim())throw new Error('MARKDOWN_DRAFT_EMPTY');if(!fileName.isWellFormed()||!fileName.trim()||fileName.length>1000||/[\/\\\0\r\n]/u.test(fileName)||!/^.+\.md$/iu.test(fileName.trim()))throw new Error('MARKDOWN_DRAFT_FILENAME');const base=fileName.trim().slice(0,-3).replace(/_待人工处理稿$/u,''),outputName=base+'_待人工处理稿.md',output=MANUAL_MARKDOWN_WARNING+content;return{fileName:outputName,output,editedHash:createHash('sha256').update(content).digest('hex'),outputHash:createHash('sha256').update(output).digest('hex')};}
export function markdownDraftFileName(sourceName:string){const name=sourceName.replaceAll('\\','/').split('/').at(-1)?.replace(/[\0\r\n]/gu,'')??'材料';return(name.replace(/\.[^.]*$/u,'')||'材料')+'.md';}
/** A fallback canonical draft is plain text made literal Markdown; it is never claimed as layout-preserving conversion. */
export function canonicalMarkdownDraft(text:string){if(!text.isWellFormed())throw new Error('INVALID_TEXT');return text.replace(/([\\`*_{}\[\]()#+.!|<>~-])/gu,'\\$1');}
