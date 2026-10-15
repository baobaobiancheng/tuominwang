# 工作区回执下载归一化完整性独立审查

A独立真实接口1项通过，5.160秒，0跳过。当前权限、会话、快照指纹与原件／规范文本／页资源检查保留；新增unlocked或normalized均走verifiedDocumentSource。

合法AEAD但错误归一化字节、数据库原hash不变时，下载明确SOURCE_MISMATCH409；原件和已完成回执不变。恢复原归一化密文后，再下载与原回执逐字节一致。没有削弱不可变签发门。竞品仍R0；范围与日志hash见同名JSON。
