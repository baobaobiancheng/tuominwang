export function sourceDictionaryRows(bytes: Buffer): Array<{number: number; columns: Map<number, string>}> | null;
export function sourceDictionaryZip(parts: Record<string, string | Buffer>): Buffer;
