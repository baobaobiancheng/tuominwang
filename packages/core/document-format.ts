/** Browser-safe format taxonomy. Original user extension is never overwritten in storage. */
export function isLegacyWordFormat(format:unknown):format is 'doc'|'wps'{return format==='doc'||format==='wps';}
export function isWordFormat(format:unknown){return format==='docx'||isLegacyWordFormat(format);}
export function originalDocumentFormat(d:{source_format?:string;original_source_format?:string}){return d.original_source_format??d.source_format??'txt';}
export function documentProcessingFormat(d:{source_format?:string;original_source_format?:string}){const format=originalDocumentFormat(d);return isLegacyWordFormat(format)?'docx':format;}
export function processingDocument<T extends{source_format?:string;original_source_format?:string}>(d:T):T{const format=originalDocumentFormat(d);return isLegacyWordFormat(format)?{...d,original_source_format:format,source_format:'docx'}:d;}
export function isBinaryFormat(format:string){return ['doc','wps','docx','xlsx','pdf','png','jpg','jpeg'].includes(format);}
