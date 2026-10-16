/** Keep the supplied artifact ID authoritative while accepting a batch parent ID. */
export function resolveReceivableJob(status, requestedJobId, artifactId) {
    // 单份任务免编号领取：服务端会返回该任务唯一的交换件并核验状态。
    if (!artifactId) {
        if (status.documents?.length) {
            throw new Error('这是批量任务：请从 check_document_delivery 返回的 documents 中逐份使用子文档的 jobId 和 sanitizedArtifact.artifactId；单份任务才可省略 artifact_id。');
        }
        return requestedJobId;
    }
    if (status.sanitizedArtifact?.artifactId === artifactId)
        return requestedJobId;
    if (status.documents?.length) {
        const matches = status.documents.filter(document => document.sanitizedArtifact?.artifactId === artifactId
            && ['sanitized_artifact_ready', 'analyzing_by_ai'].includes(document.status || ''));
        if (matches.length === 1 && matches[0].jobId)
            return matches[0].jobId;
        throw new Error('这是批量父任务，父任务没有可领取的交换件。请从 check_document_delivery 返回的 documents 中逐份使用子文档的 jobId 和 sanitizedArtifact.artifactId；不要反复重试父任务编号。');
    }
    if (status.redactionOptions?.executionMode === 'automatic' && status.status === 'waiting_for_human_review') {
        throw new Error('全自动模式仍在后台导出，请继续调用 check_document_delivery；humanReviewed: false 不代表需要用户点击完成复核。');
    }
    if (status.sanitizedArtifact?.artifactId) {
        throw new Error('交换件编号已变化（任务可能重新交付过）：请重新调用 check_document_delivery 获取最新 artifact_id 后再领取，不要沿用旧编号重试。');
    }
    return requestedJobId;
}
