export function sourceDocxReview(input:any):any;
export function sourceDocxWorkspace(input:any):any;
export function sourcePdfReview(input:any):any;
export function sourceImageReview(input:any):any;
export function sourceVisualWorkspace(input:any):any;
export function sourceMarkdownReview(input:any):any;
export function sourceMarkdownDocument(input:any):any;
export function sourceOcrCacheSignature(input:any):string;
export function sourceMarkdownConsistent(input:any):boolean;
export function sourceApplyMarkdownExport(input:any,exportState:any):boolean;

export function sourceWorkspaceDecisions(workspaceId:string,document:any,existing:any[],now?:string):any[];
export function sourceWorkspaceCorrections(snapshot:any,now?:string):any[];

export function sourceSelectiveEntityType(type:string):string;
export function sourcePseudonymActionResult(action:'mask'|'pseudonym'|'partial_star'|'full_star',type:string,value:string,currentValue?:string):string|null;
