export function extractSourceReviewProfile(snapshot:Record<string,any>,fileName:string,format:string):{filePath:string;sourceName:string;sourceWorkspaceId:string;format:string;corrections:Record<string,any>[];pseudonyms:{schemaVersion:number;entries:{key:string;token:string;canonicalKey:string}[];reservedTokens:string[]};conflicts:{key:string;choices:string[];reason:string}[]};
export function normalizeReviewPattern(value:string):string;
export function normalizeSourcePseudonymKey(value:string):string;
