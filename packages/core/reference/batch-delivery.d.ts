export type ReceivableStatus = { status?:string; redactionOptions?:{executionMode?:string}; sanitizedArtifact?:{artifactId?:string}; documents?:Array<{jobId?:string;status?:string;sanitizedArtifact?:{artifactId?:string}}> };
export function resolveReceivableJob(status:ReceivableStatus,requestedJobId:string,artifactId?:string):string;
