import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { deflateRawSync } from 'node:zlib';
export const DIAGNOSTICS_VERSION = '1.0.0';
export const TASK_GOALS = ['contract_review', 'document_comparison', 'proofreading', 'summary', 'clause_revision', 'relation_extraction', 'timeline', 'redaction', 'restoration', 'other'];
const ADAPTERS = ['dsh', 'qwenwork', 'workbuddy', 'unknown'];
const STATES = ['waiting_for_session_authorization', 'waiting_for_user_file_selection', 'waiting_for_human_review', 'building_sanitized_artifact', 'waiting_for_task_selection', 'sanitized_artifact_ready', 'analyzing_by_ai', 'validating_ai_result', 'ai_result_rejected', 'waiting_for_restore_approval', 'restoring', 'restore_failed', 'round_completed', 'completed', 'cancelled_by_user', 'client_disconnected', 'failed'];
const FORMATS = ['docx', 'doc', 'wps', 'md', 'markdown', 'pdf', 'png', 'jpg', 'jpeg', 'original', 'unknown'];
const METHODS = ['gateway_ping', 'get_configuration_catalog', 'start_secure_review', 'resume_secure_review', 'start_local_restore', 'get_review_status', 'wait_review_delivery', 'get_sanitized_artifact', 'allocate_result_slot', 'submit_pseudonymized_result', 'request_local_restore', 'continue_review', 'get_completion_status', 'wait_restore_completion'];
const TOOLS = ['start_lawbot_redaction', 'start_lawbot_redaction_for_user_manual_review', 'start_lawbot_restoration', 'check_document_delivery', 'receive_sanitized_document', 'submit_reviewed_document', 'submit_workspace_result', 'check_restore_completion', 'resume_lawbot_task', 'get_lawbot_capabilities', 'list_lawbot_saved_settings', 'open_lawbot_restore', 'continue_current_document_review'];
const STAGES = ['tool', 'transport', 'gateway', 'task_state', 'export', 'recognition', 'restoration', 'connector', 'request'];
const OUTCOMES = ['started', 'succeeded', 'failed', 'waiting', 'cancelled', 'retry', 'fallback', 'recovered'];
const MODES = ['redact_only', 'ai_process', 'ai_process_restore'];
const OUTPUTS = ['redline', 'comments', 'risk_report', 'negotiation_notes', 'structured_data', 'clean_copy', 'summary', 'comparison'];
const uuid = (value) => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value) ? value : undefined;
const jobId = (value) => typeof value === 'string' && /^lbj_[a-f0-9]{32}$/.test(value) ? value : undefined;
const choice = (value, values) => typeof value === 'string' && values.includes(value) ? value : undefined;
const choices = (value, values) => Array.isArray(value) ? [...new Set(value.filter(item => choice(item, values)))].slice(0, 12) : undefined;
const count = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(Math.round(value), 1_000_000_000) : undefined;
const version = (value) => typeof value === 'string' && /^v?\d{1,5}(?:\.\d{1,8}){0,5}(?:[-+][a-zA-Z0-9.]{1,32})?$/.test(value) ? value : 'unknown';
const model = (value) => typeof value === 'string' && /^(?:gpt|o[134]|claude|gemini|deepseek|qwen|kimi|glm|minimax|doubao|llama)[a-zA-Z0-9._:+-]{0,72}$/i.test(value) ? value : 'unknown';
const bool = (value) => typeof value === 'boolean' ? value : undefined;
export function safeErrorCode(error) {
    const value = typeof error === 'string' ? error : error?.code;
    // Product/system error codes only; never persist arbitrary messages, paths or stacks.
    return typeof value === 'string' && ERROR_CODES.has(value) ? value : 'INTERNAL_ERROR';
}
const ERROR_CODES = new Set(`AMBIGUOUS_RESTORE_TASK ARTIFACT_NOT_AVAILABLE BATCH_EXPORT_INCOMPLETE BATCH_REPORT_NOT_READY COMBINED_EXPORT_INCOMPLETE COMBINED_REQUIRES_UNIFIED COMBINED_TOO_LARGE CONFLICTING_PSEUDONYM_RULES DIRECTORY_TOO_DEEP DIRECTORY_TOO_LARGE EMPTY_FILE FILE_SETTINGS_OUT_OF_SCOPE FILE_TOO_LARGE HASH_MISMATCH INVALID_ARGUMENTS INVALID_ARTIFACT INVALID_MAPPING INVALID_OUTPUT_DIRECTORY INVALID_REVIEW_INTENT INVALID_STATE INVALID_TOKEN_CHANGES IRREVERSIBLE_MASK JOB_NOT_AVAILABLE MANUAL_REVIEW_REQUIRED NO_PSEUDONYM_TOKENS NO_RESTORABLE_MAPPING OUTPUT_DIRECTORY_OVERRIDE_NOT_AUTHORIZED OUTPUT_FORMAT_ALREADY_BOUND PARTIALLY_IRREVERSIBLE_MASK PATH_PERMISSION_REQUIRED RESTORE_BUSY RESTORE_INPUT_NOT_SAVED RESTORE_NOT_APPROVED RESULT_KIND_ALREADY_BOUND RESULT_MISSING RESULT_NOT_VALID RESUME_NOT_AVAILABLE SANITIZED_ARCHIVE_FAILED SANITIZED_EXPORT_INCOMPLETE SINGLE_RESTORE_ONLY SLOT_NOT_AVAILABLE SLOT_REPLACEMENT_NOT_ALLOWED SOURCE_NOT_FOUND STALE_ARTIFACT SYMLINK_NOT_ALLOWED TOO_MANY_FILES UNCONTROLLED_EXPORT_PATH UNIFIED_RULE_CONFLICT UNSAFE_NAME UNSUPPORTED_FORMAT UNVERIFIED_EXPORT VISUAL_REPORT_REQUIRED INTERNAL_ERROR INVALID_ARGUMENTS INVALID_STATE INVALID_CALLER UNAUTHORIZED METHOD_NOT_ALLOWED INVALID_JSON JOB_NOT_AVAILABLE ARTIFACT_NOT_AVAILABLE SOURCE_NOT_FOUND SYMLINK_NOT_ALLOWED UNSUPPORTED_FORMAT FILE_TOO_LARGE EMPTY_FILE INVALID_MAPPING HASH_MISMATCH UNCONTROLLED_EXPORT_PATH UNVERIFIED_EXPORT SANITIZED_EXPORT_INCOMPLETE RECOGNITION_INCOMPLETE NO_PSEUDONYM_TOKENS UNSAFE_NAME RESTORE_FAILED RESULT_REJECTED CLIENT_NOT_RUNNING GATEWAY_TIMEOUT GATEWAY_UNAVAILABLE INVALID_RESPONSE CONNECTOR_MISMATCH TOOL_FAILED INVALID_TOOL_ARGUMENTS IRREVERSIBLE_MASK MANUAL_REVIEW_REQUIRED COMBINED_REQUIRES_UNIFIED COMBINED_EXPORT_INCOMPLETE COMBINED_TOO_LARGE VISUAL_REPORT_REQUIRED MCP_CONNECTOR_NOT_CONFIGURED DEVELOPMENT_ONLY SESSION_AUTHORIZATION_REQUIRED RESTORE_NOT_ALLOWED RESULT_NOT_AVAILABLE ROUND_NOT_AVAILABLE SLOT_NOT_AVAILABLE SLOT_NOT_MATCHED MAPPING_NOT_FOUND RESTORE_NOT_AUTHORIZED TASK_CANCELLED TASK_CANCELED ABORT_ERR EACCES EPERM ENOENT ENOSPC EIO ETIMEDOUT ECONNREFUSED ECONNRESET EPIPE OCR_UNAVAILABLE OCR_INIT_FAILED APPLY_RESULT_UNCONFIRMED MARKDOWN_UNAVAILABLE`.split(' '));
export function diagnosticDetails(input = {}) {
    const options = input.redactionOptions || input;
    const intent = input.task_summary || input.taskSummary || input.reviewIntent || input;
    const paths = input.sourcePaths || input.source_paths || (input.sourcePath || input.source_path ? [input.sourcePath || input.source_path] : undefined);
    const formats = Array.isArray(paths) ? paths.slice(0, 100).map(p => typeof p === 'string' ? choice(path.extname(p).slice(1).toLowerCase(), FORMATS) || 'unknown' : 'unknown') : undefined;
    const last = input.rounds?.at?.(-1) || {};
    const stats = input.statistics || input;
    const validation = input.validation || last.validation || input;
    const out = {
        purpose: choice(input.purpose, ['contract_review', 'general_analysis']),
        goals: choices(intent.goals || [intent.taskType], TASK_GOALS),
        perspective: choice(intent.perspective, ['party_a', 'party_b', 'neutral']),
        outputKinds: choices(intent.outputKinds || intent.outputModes, OUTPUTS),
        requestedResultFormat: choice(intent.outputFormat, ['docx', 'md']),
        restorationRequested: bool(intent.restorationRequested),
        taskMode: choice(options.taskMode || options.task_mode, MODES),
        executionMode: choice(options.executionMode || options.execution_mode, ['automatic', 'human_review']),
        batchResultMode: choice(options.batchResultMode || options.batch_result_mode, ['individual', 'combined']),
        maskingMode: choice(options.maskingMode || options.masking_mode, ['pseudonym', 'default_mask', 'full_star', 'purple_overlay']),
        unifiedPseudonyms: bool(options.unifiedPseudonyms ?? options.unified_pseudonyms),
        outputFormats: choices(options.outputFormats || options.output_formats, FORMATS),
        inputFormats: formats || choices(input.inputFormats || [input.sourceFormat?.replace(/^\./, '')], FORMATS),
        fileCount: count(input.childJobIds?.length || paths?.length || stats.documentCount || input.fileCount),
        entityCount: count(stats.entityCount), lowConfidenceCount: count(stats.lowConfidenceCount),
        humanReviewed: bool(stats.humanReviewed), mappingAvailable: input.mappingPath !== undefined ? !!input.mappingPath : bool(input.mappingAvailable),
        artifactFormat: choice(input.artifact?.format || input.sanitizedArtifact?.format || input.artifactFormat, FORMATS),
        visualFallback: input.artifact?.fallbackReason === 'markdown_unavailable' || bool(input.visualFallback),
        attachmentCount: count(input.artifact?.attachments?.length || input.sanitizedArtifact?.attachments?.length || input.attachmentCount),
        valid: bool(validation.valid), missingTokenCount: count(validation.missingTokenCount),
        unknownTokenCount: count(validation.unknownTokenCount), malformedTokenCount: count(validation.malformedTokenCount),
        replacementCount: count(last.replacementCount ?? input.replacementCount), residualTokenCount: count(last.residualTokenCount ?? input.residualTokenCount),
        resultKind: choice(last.resultKind || input.resultKind || input.result_kind, ['reviewed_document', 'derived_report']),
        resultFormat: choice(last.outputFormat || input.outputFormat || input.output_format, ['docx', 'md']),
        artifactBytes: count(input.artifact?.sizeBytes || input.artifactBytes),
        attempt: count(input.attempt), timeoutMs: count(input.timeoutMs),
        ocrAvailable: bool(input.ocrAvailable), exportConfirmed: bool(input.exportConfirmed),
        customRequirementsPresent: bool(input.customRequirementsPresent) ?? (typeof intent.customInstruction === 'string' ? !!intent.customInstruction : undefined),
    };
    for (const key of ['allowRedactionPath', 'allowRestorePath', 'allowSanitizedDelivery', 'autoRestoreAfterValidation'])
        out[key] = bool(input.authorization?.[key] ?? input[key]);
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v !== undefined && (!Array.isArray(v) || v.length > 0)));
}
export function clientMetadata(input = {}) {
    return { clientVersion: version(input.clientVersion), installedClientVersion: version(input.installedClientVersion),
        clientVersionSource: choice(input.clientVersionSource, ['client_handshake', 'host_runtime', 'unknown']) || 'unknown',
        installedVersionSource: version(input.installedClientVersion) === 'unknown' ? 'unknown' : 'installed_package',
        connectorVersion: version(input.connectorVersion),
        protocolVersion: typeof input.protocolVersion === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.protocolVersion) ? input.protocolVersion : version(input.protocolVersion),
        modelName: model(input.modelName), modelVersion: version(input.modelVersion),
        modelSource: model(input.modelName) === 'unknown' ? 'unknown' : choice(input.modelSource, ['client_handshake', 'host_runtime', 'ai_declared']) || 'unknown' };
}
function cleanEvent(input, side, environment) {
    const frames = typeof input.error?.stack === 'string' ? input.error.stack.split('\n').slice(1, 12)
        .map((line) => line.match(/(?:[/\\])((?:AiCollabService|gatewayClient|protocol|registerAiCollab|tools|bridge|server|index|DashboardView)\.(?:ts|js|vue)):(\d{1,7}):(\d{1,7})\)?$/))
        .filter(Boolean).map((m) => `${m[1]}:${m[2]}:${m[3]}`) : [];
    return { schemaVersion: 1, at: new Date().toISOString(), eventId: crypto.randomUUID(), side,
        stage: choice(input.stage, STAGES) || 'request', outcome: choice(input.outcome, OUTCOMES) || 'failed',
        adapter: choice(input.adapter, ADAPTERS) || 'unknown',
        session: typeof input.sessionId === 'string' && /^[a-f0-9]{32}$/.test(input.sessionId) ? input.sessionId : undefined,
        traceId: uuid(input.traceId), requestId: uuid(input.requestId), jobId: jobId(input.jobId), parentJobId: jobId(input.parentJobId),
        roundId: typeof input.roundId === 'string' && /^lbr_\d{4}$/.test(input.roundId) ? input.roundId : undefined,
        method: choice(input.method, METHODS), tool: choice(input.tool, TOOLS), state: choice(input.state, STATES),
        durationMs: count(input.durationMs), code: input.code || input.error ? safeErrorCode(input.code || input.error) : undefined,
        details: diagnosticDetails(input.details), client: clientMetadata(input.client), environment, frames: frames.length ? frames
            : Array.isArray(input.frames) ? input.frames.filter((f) => typeof f === 'string' && /^(?:AiCollabService|gatewayClient|protocol|registerAiCollab|tools|bridge|server|index|DashboardView)\.(?:ts|js|vue):\d{1,7}:\d{1,7}$/.test(f)).slice(0, 10) : [] };
}
// A portable ZIP writer keeps the native DSH bundle independent of Electron/node_modules.
function zipFiles(files) {
    const local = [], central = [];
    let offset = 0;
    for (const [name, value] of Object.entries(files)) {
        const filename = Buffer.from(name), data = Buffer.from(value), compressed = deflateRawSync(data);
        let crc = 0xffffffff;
        for (const byte of data) {
            crc ^= byte;
            for (let i = 0; i < 8; i++)
                crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
        crc = (crc ^ 0xffffffff) >>> 0;
        const h = Buffer.alloc(30);
        h.writeUInt32LE(0x04034b50);
        h.writeUInt16LE(20, 4);
        h.writeUInt16LE(0x800, 6);
        h.writeUInt16LE(8, 8);
        h.writeUInt16LE(33, 12);
        h.writeUInt32LE(crc, 14);
        h.writeUInt32LE(compressed.length, 18);
        h.writeUInt32LE(data.length, 22);
        h.writeUInt16LE(filename.length, 26);
        const c = Buffer.alloc(46);
        c.writeUInt32LE(0x02014b50);
        c.writeUInt16LE(20, 4);
        h.copy(c, 6, 4, 30);
        c.writeUInt32LE(offset, 42);
        local.push(h, filename, compressed);
        central.push(c, filename);
        offset += h.length + filename.length + compressed.length;
    }
    const centralBytes = Buffer.concat(central), end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50);
    end.writeUInt16LE(central.length / 2, 8);
    end.writeUInt16LE(central.length / 2, 10);
    end.writeUInt32LE(centralBytes.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...local, centralBytes, end]);
}
export class AiDiagnostics {
    options;
    directory;
    writer = crypto.randomBytes(8).toString('hex');
    queue = Promise.resolve();
    recent = new Map();
    lastPrune = 0;
    environment;
    constructor(userDataPath, options) {
        this.options = options;
        this.directory = path.join(userDataPath, 'diagnostics', 'ai-collab');
        this.environment = { system: process.platform, architecture: process.arch, osVersion: os.release().replace(/[^0-9.]/g, '').slice(0, 40),
            nodeVersion: version(process.versions.node), appVersion: version(options.appVersion),
            buildId: typeof options.buildId === 'string' && /^[a-f0-9]{7,64}$/.test(options.buildId) ? options.buildId : 'unknown',
            development: options.development === true, diagnosticVersion: DIAGNOSTICS_VERSION, gatewayProtocolVersion: 1 };
    }
    record(input) {
        // Sanitize before the asynchronous queue: callers may mutate their task object later.
        let event;
        try {
            event = cleanEvent(input, this.options.side, this.environment);
        }
        catch {
            return Promise.resolve();
        }
        this.queue = this.queue.then(() => this.write(event)).catch(() => undefined);
        return this.queue;
    }
    flush() { return this.queue; }
    async ensureDirectory(directory) {
        await fs.mkdir(directory, { recursive: true });
        const stat = await fs.lstat(directory);
        if (!stat.isDirectory() || stat.isSymbolicLink())
            throw new Error('UNSAFE_DIAGNOSTIC_DIRECTORY');
    }
    async write(event) {
        await this.ensureDirectory(this.directory);
        const journalDir = path.join(this.directory, '_events');
        await this.ensureDirectory(journalDir);
        const now = Date.now();
        if (now - this.lastPrune > 60_000) {
            await this.prune();
            this.lastPrune = now;
        }
        const signature = JSON.stringify([event.adapter, event.session, event.stage, event.outcome, event.jobId, event.method, event.tool, event.state, event.code, event.details]);
        // Coalesce unchanged polls; failure and recovery records are always retained.
        if (['waiting', 'succeeded'].includes(event.outcome) && event.method && /wait_|get_review_status|gateway_ping/.test(event.method)) {
            if (now - (this.recent.get(signature) || 0) < 30_000)
                return;
            this.recent.set(signature, now);
            if (this.recent.size > 256)
                this.recent.delete(this.recent.keys().next().value);
        }
        const journal = path.join(journalDir, `${new Date().toISOString().slice(0, 10)}_${this.writer}.jsonl`);
        const stat = await fs.lstat(journal).catch(() => null);
        if (stat && (!stat.isFile() || stat.isSymbolicLink()))
            return;
        if (stat && stat.size > 512 * 1024) {
            const tail = (await fs.readFile(journal, 'utf8')).split('\n').filter(Boolean).slice(-128).join('\n');
            await fs.writeFile(journal, tail + '\n', { mode: 0o600 });
        }
        await fs.appendFile(journal, JSON.stringify(event) + '\n', { mode: 0o600 });
        // A task package is refreshed by later retries; pre-task failures use their trace.
        const scope = event.parentJobId || event.jobId || event.traceId || event.session || this.writer;
        const key = crypto.createHash('sha256').update(`${event.adapter}:${scope}`).digest('hex').slice(0, 12);
        const name = `AI协作失败_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}_${key}.zip`;
        const destination = path.join(this.directory, name);
        if (event.outcome === 'failed' || await fs.stat(destination).then(() => true, () => false))
            await this.bundle(destination, event, key);
        await this.prune();
    }
    async bundle(destination, trigger, key) {
        const lockPath = destination + '.lock';
        let lock;
        for (let attempt = 0; attempt < 20; attempt++) {
            try {
                lock = await fs.open(lockPath, 'wx', 0o600);
                break;
            }
            catch (error) {
                if (error.code !== 'EEXIST')
                    return;
                const stat = await fs.lstat(lockPath).catch(() => null);
                if (stat?.isSymbolicLink() || (stat && !stat.isFile()))
                    return;
                if (stat && Date.now() - stat.mtimeMs > 60_000)
                    await fs.unlink(lockPath).catch(() => undefined);
                await new Promise(resolve => setTimeout(resolve, 25));
            }
        }
        if (!lock)
            return;
        try {
            await this.writeBundle(destination, trigger, key);
        }
        finally {
            await lock.close().catch(() => undefined);
            await fs.unlink(lockPath).catch(() => undefined);
        }
    }
    async writeBundle(destination, trigger, key) {
        const journalDir = path.join(this.directory, '_events');
        const names = (await fs.readdir(journalDir)).filter(n => /^\d{4}-\d{2}-\d{2}_[a-f0-9]{16}\.jsonl$/.test(n)).sort().reverse();
        let events = [], readBytes = 0, incomplete = false;
        for (const name of names) {
            const file = path.join(journalDir, name), stat = await fs.lstat(file);
            if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024)
                continue;
            if (readBytes + stat.size > 10 * 1024 * 1024) {
                incomplete = true;
                break;
            }
            readBytes += stat.size;
            for (const line of (await fs.readFile(file, 'utf8')).split('\n')) {
                try {
                    const e = JSON.parse(line);
                    if (e.schemaVersion !== 1 || !uuid(e.eventId) || !Number.isFinite(Date.parse(e.at)))
                        continue;
                    if (trigger.session ? e.session !== trigger.session || e.adapter !== trigger.adapter : e.traceId !== trigger.traceId || !trigger.traceId)
                        continue;
                    // Re-whitelist persisted journals too. Never zip arbitrary local files.
                    const clean = cleanEvent({ ...e, sessionId: e.session }, e.side === 'lawbot' ? 'lawbot' : 'connector', {
                        appVersion: version(e.environment?.appVersion), buildId: /^[a-f0-9]{7,64}$/.test(e.environment?.buildId || '') ? e.environment.buildId : 'unknown',
                        system: choice(e.environment?.system, ['win32', 'darwin', 'linux']), architecture: choice(e.environment?.architecture, ['x64', 'arm64', 'ia32']),
                        diagnosticVersion: version(e.environment?.diagnosticVersion), development: e.environment?.development === true,
                        nodeVersion: version(e.environment?.nodeVersion), osVersion: version(e.environment?.osVersion),
                        gatewayProtocolVersion: e.environment?.gatewayProtocolVersion === 1 ? 1 : undefined,
                    });
                    events.push({ ...clean, at: new Date(Date.parse(e.at)).toISOString(), eventId: e.eventId });
                }
                catch { }
            }
        }
        if (trigger.jobId) {
            const jobs = new Set([trigger.jobId, trigger.parentJobId].filter(Boolean));
            for (let pass = 0; pass < 3; pass++)
                for (const event of events) {
                    if (jobs.has(event.jobId) || jobs.has(event.parentJobId)) {
                        if (event.jobId)
                            jobs.add(event.jobId);
                        if (event.parentJobId)
                            jobs.add(event.parentJobId);
                    }
                }
            const traces = new Set(events.filter(e => jobs.has(e.jobId)).map(e => e.traceId).filter(Boolean));
            events = events.filter(e => jobs.has(e.jobId) || (e.traceId && traces.has(e.traceId)));
        }
        else if (trigger.traceId)
            events = events.filter(e => e.traceId === trigger.traceId);
        events.sort((a, b) => a.at.localeCompare(b.at));
        if (events.length > 3000) {
            incomplete = true;
            events = events.slice(-3000);
        }
        const failure = events.filter(e => e.outcome === 'failed').at(-1);
        if (!failure)
            return;
        const latest = events.at(-1);
        const metadata = Object.assign({}, ...events.map(e => Object.fromEntries(Object.entries(e.client || {}).filter(([, v]) => v !== 'unknown'))));
        const task = Object.assign({}, ...events.map(e => e.details));
        const declared = Object.assign({}, ...events.filter(e => e.side === 'connector').map(e => e.details));
        const actual = Object.assign({}, ...events.filter(e => e.side === 'lawbot' && e.stage === 'task_state').map(e => e.details));
        const childIds = [...new Set(events.filter(e => e.parentJobId).map(e => e.jobId))];
        const files = childIds.map((id, index) => `文件 ${index + 1}：${events.find(e => e.jobId === id && e.details.inputFormats)?.details.inputFormats?.join('、') || '未知格式'}；最近状态 ${events.filter(e => e.jobId === id).at(-1)?.state || '见事件记录'}`);
        const titles = { dsh: 'DeepSeek Harness', qwenwork: '千问办公', workbuddy: 'WorkBuddy', unknown: '未知' };
        const labels = { contract_review: '合同审查', document_comparison: '文档对比', proofreading: '错别字检查', summary: '摘要', clause_revision: '条款修改', relation_extraction: '关系提取', timeline: '时间线', redaction: '脱敏', restoration: '还原', other: '其他' };
        const summary = ['AI 协作失败诊断', `排查编号：${key}`, `客户端：${titles[trigger.adapter] || '未知'}`,
            `客户端版本：${metadata?.clientVersion || 'unknown'}（来源：${metadata?.clientVersionSource || 'unknown'}）`,
            `安装包版本：${metadata?.installedClientVersion || 'unknown'}（仅代表安装信息，不证明当前运行版本）`,
            `连接器版本：${metadata?.connectorVersion || 'unknown'}；协议：${metadata?.protocolVersion || 'unknown'}`,
            `模型：${metadata?.modelName || 'unknown'}；版本：${metadata?.modelVersion || 'unknown'}；来源：${metadata?.modelSource || 'unknown'}`,
            `AI 声明的任务目标：${declared.goals?.map((g) => labels[g]).join('、') || '未提供'}`,
            `请求模式：${declared.taskMode || '未提供'}；实际任务模式：${actual.taskMode || '未进入任务或未知'}；视角：${declared.perspective || '未提供'}`,
            `还原授权：${actual.allowRestorePath === undefined ? '未知' : actual.allowRestorePath ? '已包含' : '未包含'}；假名表可用：${actual.mappingAvailable === undefined ? '未知' : actual.mappingAvailable ? '是' : '否'}`,
            `OCR 启动健康检查：${task.ocrAvailable === undefined ? '未知' : task.ocrAvailable ? '通过' : '失败'}`,
            `输入：${task.fileCount ?? '未知'} 份；格式：${task.inputFormats?.join('、') || '未知'}`,
            `成果要求：${task.outputKinds?.join('、') || '未提供'}；格式：${task.requestedResultFormat || task.resultFormat || '未提供'}`,
            ...files,
            `最近失败：${failure.at}；阶段：${failure.stage}；错误码：${failure.code || 'INTERNAL_ERROR'}`,
            `最近记录：${latest.at}；状态：${latest.state || latest.outcome}`,
            `事件数量：${events.length}；历史可能截断：${incomplete ? '是' : '仅保留限额内近期记录'}`,
            '请结合协作过程.jsonl 中的请求与实际状态判断原因；AI 声明不等于用户原话或执行证据。',
            '未收到请求不能证明外部 AI 故障。插件未运行、AI 未调用工具或客户端内部失败可能需要客户端日志。',
            '本包不包含文档、原文、聊天全文、真实文件名、完整路径、假名映射或密钥。unknown 表示未提供或无法核实。',].join('\r\n');
        const environment = { schemaVersion: 1, diagnosticId: key, historyLimited: true, historyTruncated: incomplete,
            environments: [...new Map(events.map(e => [JSON.stringify(e.environment), e.environment])).values()],
            client: metadata, modelAvailability: !metadata?.modelName || metadata.modelName === 'unknown' ? 'not_reported' : 'reported_not_independently_verified' };
        const data = zipFiles({ '问题摘要.txt': summary, '协作过程.jsonl': events.map(e => JSON.stringify(e)).join('\n') + '\n', '环境信息.json': JSON.stringify(environment, null, 2) });
        const existing = await fs.lstat(destination).catch(() => null);
        if (existing && (!existing.isFile() || existing.isSymbolicLink()))
            return;
        const temporary = destination + '.' + crypto.randomBytes(8).toString('hex') + '.tmp';
        try {
            await fs.writeFile(temporary, data, { flag: 'wx', mode: 0o600 });
            await fs.rename(temporary, destination);
        }
        finally {
            await fs.unlink(temporary).catch(() => undefined);
        }
    }
    async prune() {
        try {
            const entries = [];
            for (const dir of [this.directory, path.join(this.directory, '_events')]) {
                const dirStat = await fs.lstat(dir).catch(() => null);
                if (!dirStat?.isDirectory() || dirStat.isSymbolicLink())
                    continue;
                for (const name of await fs.readdir(dir)) {
                    if (!/^(?:AI协作失败_\d{8}_[a-f0-9]{12}\.zip|\d{4}-\d{2}-\d{2}_[a-f0-9]{16}\.jsonl)$/.test(name))
                        continue;
                    const file = path.join(dir, name), stat = await fs.lstat(file);
                    if (stat.isFile() && !stat.isSymbolicLink())
                        entries.push({ file, size: stat.size, time: stat.mtimeMs });
                }
            }
            let total = entries.reduce((sum, item) => sum + item.size, 0);
            const oldest = Date.now() - (this.options.retentionDays ?? 30) * 86400000;
            for (const item of entries.sort((a, b) => a.time - b.time)) {
                if (item.time >= oldest && total <= (this.options.maxBytes ?? 100 * 1024 * 1024))
                    continue;
                await fs.unlink(item.file).catch(() => undefined);
                total -= item.size;
            }
        }
        catch { /* Diagnostics retention must never break collaboration. */ }
    }
}
