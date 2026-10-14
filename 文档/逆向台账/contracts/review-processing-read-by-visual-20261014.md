# Word暂忙预览自动恢复只读复审

无新增可复现缺陷。仅PROCESSING_BUSY有限重试，取消/旧代请求不渲染；权限、版本、hash、CSP和backend semaphore保持。独立4单测通过，root另行真实Edge验证。代码hash见同名JSON。
