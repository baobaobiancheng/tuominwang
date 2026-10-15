/** Source inherited aliases may be numbered wrappers or user-defined plain strings.
 * A replacement still requires an authorized immutable mapping reference at review/export. */
export function validAliasToken(token:string){
 if(typeof token!=='string'||!token.trim()||!token.isWellFormed()||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(token))return false;
 let open=-1;
 for(let i=0;i<token.length;i++){if(token[i]==='【'){if(open!==-1)return false;open=i;}else if(token[i]==='】'){if(open===-1||i===open+1)return false;open=-1;}}
 return open===-1;
}
/** Word permits whitespace/zero-width repair inside a wrapper or between two
 * adjacent wrappers. Literal portions of mixed source aliases remain exact. */
export function normalizedWordAlias(token:string){return token.replace(/【[^【】]+】/gu,part=>part.replace(/[\s\u200B-\u200D\uFEFF]/gu,'')).replace(/(?<=】)[\s\u200B-\u200D\uFEFF]+(?=【)/gu,'');}
