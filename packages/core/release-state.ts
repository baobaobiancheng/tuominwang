export type UpdatePreferences = {setupCompleted:boolean;checkAutomatically:boolean;downloadAutomatically:boolean;installAutomatically:boolean};
/** Source $I uses strict true, not truthiness, and replaces all four flags. */
export function updatePreferences(input:unknown):UpdatePreferences {
 const value=input as Partial<Record<keyof UpdatePreferences,unknown>>|null;
 return {setupCompleted:value?.setupCompleted===true,checkAutomatically:value?.checkAutomatically===true,downloadAutomatically:value?.downloadAutomatically===true,installAutomatically:value?.installAutomatically===true};
}
export function releaseIdentity(){
 const valid=(value:string|undefined)=>value&&/^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/u.test(value)?value:null;
 return {version:valid(process.env.RELEASE_VERSION)??'development',releaseId:valid(process.env.RELEASE_ID)};
}
