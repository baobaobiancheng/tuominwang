# 手绘标注隐私字段交叉审查

按 defect-first 只读审查。发现并关闭一项 P1：最终锁内导出 gate 未解密 privateMetadata，导致合法 typed 标注全部导出失败。root 保留锁和二次 gate，改为两边按各自 revision/content 解密比较，真实三格式 API 已独立复证通过。

AEAD 绑定、迁移、复核快照、OCR 新版本、portable 新身份、metadata 不作为权限/路径均已检查，没有其他合格缺陷。独立5项单测与13.4秒 PNG/PDF/DOCX 接口验真通过；作者完整迁移与旧链接集成用例已读，本轮未全部独立重跑。

精确文件 hash 和证据见同名 JSON。
