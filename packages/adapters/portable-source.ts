import{createHmac,timingSafeEqual}from'node:crypto';
export type PortableSourceWitness={version:1;originalHash:string;derivedHash:string;format:'docx'|'xlsx'|'pdf';mac:string};
const domain='tuominwang:portable:authenticated-unlocked-source:v1';
function key(){const value=process.env.DATA_KEY??'';if(!/^[a-f0-9]{64}$/iu.test(value))throw new Error('DATA_KEY_REQUIRED');return createHmac('sha256',Buffer.from(value,'hex')).update(domain).digest();}
const tuple=(v:Omit<PortableSourceWitness,'mac'>)=>JSON.stringify([domain,v.version,v.originalHash,v.derivedHash,v.format]);
function valid(v:any):v is PortableSourceWitness{return v?.version===1&&/^[a-f0-9]{64}$/u.test(v.originalHash??'')&&/^[a-f0-9]{64}$/u.test(v.derivedHash??'')&&['docx','xlsx','pdf'].includes(v.format)&&/^[a-f0-9]{64}$/u.test(v.mac??'');}
export function attestPortableSource(originalHash:string,derivedHash:string,format:PortableSourceWitness['format']):PortableSourceWitness{const value={version:1 as const,originalHash,derivedHash,format},mac=createHmac('sha256',key()).update(tuple(value)).digest('hex');const result={...value,mac};if(!valid(result))throw new Error('PORTABLE_UNLOCK_WITNESS_INVALID');return result;}
export function verifyPortableSource(value:unknown,originalHash:string,derivedHash:string,format:string):boolean{if(!valid(value)||value.originalHash!==originalHash||value.derivedHash!==derivedHash||value.format!==format)return false;const expected=createHmac('sha256',key()).update(tuple(value)).digest();return timingSafeEqual(Buffer.from(value.mac,'hex'),expected);}
