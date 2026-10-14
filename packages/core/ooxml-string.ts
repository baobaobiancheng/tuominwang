/** ECMA ST_Xstring encoding. Decode only once: _x005F_x0001_ is literal _x0001_.
 * Microsoft MS-OE376 2.18.96: invalid XML1.0 characters are Xstring encoded;
 * an underscore is encoded only when it begins a literal _xHHHH_ escape.
 * https://learn.microsoft.com/en-us/openspecs/office_standards/ms-oe376/bd0aa042-434a-4ca7-b25f-4e1fd25a954d */
export function encodeXlsxText(value:string):string{
 const literal=value.replace(/_(?=x[0-9a-f]{4}_)/giu,()=> '_x005F_');
 return literal.replace(/[\x00-\x08\x0b\x0c\x0d\x0e-\x1f\ud800-\udfff\ufffe\uffff]/gu,c=>`_x${c.charCodeAt(0).toString(16).padStart(4,'0').toUpperCase()}_`);
}
/** Produces serialized XML text, not a DOM textContent value. */
export function encodeXlsxString(value:string):string{return encodeXlsxText(value).replace(/[&<>"']/gu,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));}
/** Input is already XML-entity decoded, e.g. DOM textContent. */
export function decodeXlsxString(value:string):string{return value.replace(/_x([0-9a-f]{4})_/giu,(_,code:string)=>String.fromCharCode(Number.parseInt(code,16)));}
