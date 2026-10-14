/** Source inherited aliases may be numbered wrappers or user-defined plain strings.
 * A replacement still requires an authorized immutable mapping reference at review/export. */
export function validAliasToken(token:string){return typeof token==='string'&&!!token.trim()&&token===token.trim()&&token.isWellFormed()&&!/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/u.test(token)&&(!/[【】]/u.test(token)||/^【[^【】]+】$/u.test(token));}
