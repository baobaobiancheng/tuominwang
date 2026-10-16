import type { Transform } from 'node:stream';
export function originalV3JsonParser(): Transform;
export class OriginalV3Assembler { current: unknown; consume(token: {name:string;value?:unknown}): this; depth: number; }
