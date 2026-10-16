export const DIAGNOSTICS_VERSION: string;
export function safeErrorCode(error: unknown): string;
export function clientMetadata(input?: Record<string, unknown>): Record<string, unknown>;
export class AiDiagnostics {
 constructor(userDataPath: string, options: {side: 'connector' | 'lawbot'; appVersion?: string; buildId?: string; development?: boolean; retentionDays?: number; maxBytes?: number});
 record(input: Record<string, unknown>): Promise<void>;
 flush(): Promise<void>;
}
