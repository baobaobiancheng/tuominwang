# 图像/OCR/批量还原接口功能闭合

| 源接口 | 我方真实接口 | 验证与边界 |
|---|---|---|
| image-review:ocr-region | POST /api/documents/:id/pages/:page/ocr-region | 源缓存字形中心＋缺字符框的uniform-word fallback；fallback显式approximate，缩放与UTF16完整。新增真实OCR区域重跑作为我方扩展，输出供人工纠正，不覆写原文。 |
| image-review:clear-ocr-cache | POST /api/documents/:id/ocr-cache/clear | 清理当前用户/项目材料的派生查询缓存，原图、已纠正文字、复核/签发结果保留；cachehit仍重新验源与map。 |
| image:export-labels | POST /api/documents/:id/pages/:page/labels | 全部bbox absolute/normalized、type、confidence、source、imageSize、exportedAt/version；imagePath为相对名称，不暴露宿主绝对路径；附我方documentId/revision/sourceHash。源confidence||1丢0，我方保留真实0。 |
| image:save-annotations | POST /api/documents/:id/pages/:page/annotations | bboxes/source元数据及savedAt/version完整保存为独立下载；source imageSize空对象，我方真实尺寸；全部OCR marks由真实glyph按行构框，native/raw类型、来源/score及annotations的id/text/shape/absolute span保留，未知raw类型不加200字符专用限制；手绘ellipse/id/text/meta保留，字段AEAD密封存储。 |
| desensitization:pause-seals | POST /api/documents/:id/visual-requests/:requestId/pause-seals | 限定当前owner/tenant/doc的活跃request，真正AbortSignal中止该seal worker并跳后续seal，不中止face/signature，已结束明确拒绝；原metadata/version保留。 |
| ocr:health-check | GET /api/ocr/health | 真实模型lock校验、OCR worker初始化及合成TEST123运行探针，不只是硬编码installed。 |
| ocr:collect-diagnostic | POST /api/ocr/diagnostic | 真实版本/模型lock/架构/探针错误或置信度，私文/keys/宿主路径不输出；不伪造network bytes测量，标not_measured及离线配置。 |
| pseudonym:restore-docx-batch | POST /api/projects/:id/restoration/batch/file + batch/download + batch/files | 真DOCX跨run/story还原，逐份上传、真实completed/total进度、成功/失败/partial、zero_replacement_files、total_replacements；已成功独立immutable artifact persist/reload/hash/owner+restore检查，流ZIP安全去重名称，失败不回原件。 |
| pseudonym:restore-markdown-batch | same batch routes | 相同批量机制覆盖MD/TXT；未知alias失败保留其他verified输出，原件不变；源Markdown同名可覆盖，我方主动修复避免覆盖。 |

6项定向单元、图像隔离API（真实OCR探针、权限/过期版本/损坏原件和map/活动暂停）及批量隔离API已真实运行；Edge最终图像流程18.4秒（bundled Node24.19、自动清理正常）、批量流程15.0秒通过。图像流程包含真实剪贴板、区域重跑、完整手机/手动椭圆印章/237字符原始类型与文字、metadata标注下载、健康检查/诊断；批量包含4文件3成功1失败、零替换计数、真ZIP及重载找回。截图已逐张检查。源码来源、固定文件哈希与日志见同名 JSON。没有许可证的竞品整体处理仍未执行，不宣称模型准确率或原生处理数值等价。
