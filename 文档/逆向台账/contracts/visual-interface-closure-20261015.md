# 视觉／OCR／还原逐接口核验（2026-10-15）

本轮24个稳定ID逐项核对：19个已实际调用对应云端适配入口，5个选文件入口属于浏览器文件选择适配，本API轮次未执行原生弹窗。全部源许可处理链仍为R0，不宣称原生协议或算法数值等价。

| 稳定ID | 源接口 | 本轮证据 |
|---|---|---|
| IPC-e4cf3e6c3c0a | desensitization:pause-seals | 实际POST /api/documents/305cbc59-8862-44d7-82ed-4f6825a2e551/visual-requests/0a1a3363-be0e-46a8-a72e-89650bac7ca9/pause-seals |
| IPC-81f79eee361a | desensitization:recognize-docx-images | 实际POST /api/documents/76ced00e-2350-4d2a-a2d5-431302b988f2/recognize-docx-images |
| IPC-47ecc7525dfe | image-review:clear-ocr-cache | 实际POST /api/documents/305cbc59-8862-44d7-82ed-4f6825a2e551/ocr-cache/clear |
| IPC-d3864dc80560 | image:export-labels | 实际POST /api/documents/305cbc59-8862-44d7-82ed-4f6825a2e551/pages/0/labels |
| IPC-5569a4344615 | image:save-annotations | 实际POST /api/documents/305cbc59-8862-44d7-82ed-4f6825a2e551/pages/0/annotations |
| IPC-0ecb1de9c806 | ocr:collect-diagnostic | 实际POST /api/ocr/diagnostic |
| IPC-f02ad1fa2413 | ocr:health-check | 实际GET /api/ocr/health |
| IPC-4dd20e80cae3 | image-review:batch-search | 实际POST /api/documents/305cbc59-8862-44d7-82ed-4f6825a2e551/image-search |
| IPC-ba07bb14e3df | image-review:get-ocr-page | 实际GET /api/documents/305cbc59-8862-44d7-82ed-4f6825a2e551/pages/0/ocr-text?revision=0 |
| IPC-910347ed48b5 | image-review:ocr-region | 实际POST /api/documents/305cbc59-8862-44d7-82ed-4f6825a2e551/pages/0/ocr-region |
| IPC-bd4779635d5d | pseudonym:inspect-restore-mapping | 实际POST /api/projects/227e3b09-279a-487b-bf27-aca4ea92fcb9/restoration/inspect |
| IPC-1d272ba10a6c | pseudonym:restore-docx | 实际POST /api/projects/227e3b09-279a-487b-bf27-aca4ea92fcb9/restoration/files |
| IPC-5c2a14961699 | pseudonym:restore-markdown | 实际POST /api/projects/227e3b09-279a-487b-bf27-aca4ea92fcb9/restoration/files |
| IPC-24fe13c4efb6 | pseudonym:restore-docx-batch | 实际POST /api/projects/227e3b09-279a-487b-bf27-aca4ea92fcb9/restoration/batch/file |
| IPC-096d3ecc2554 | pseudonym:restore-markdown-batch | 实际POST /api/projects/227e3b09-279a-487b-bf27-aca4ea92fcb9/restoration/batch/file |
| IPC-0fa110b8534b | pseudonym:restore-progress | 实际GET /api/projects/227e3b09-279a-487b-bf27-aca4ea92fcb9/restoration/progress/252a304c-744e-42db-8cac-0e76150d4a68 |
| IPC-37a279488720 | pseudonym:select-input-docx | 浏览器选择适配；本API轮未执行OS选择器 |
| IPC-7fe81107ae4d | pseudonym:select-input-files | 浏览器选择适配；本API轮未执行OS选择器 |
| IPC-6dcdb71fa095 | pseudonym:select-input-markdown | 浏览器选择适配；本API轮未执行OS选择器 |
| IPC-f69ef883aa33 | pseudonym:select-input-docx-batch | 浏览器选择适配；本API轮未执行OS选择器 |
| IPC-93ba5dca8357 | pseudonym:select-input-markdown-batch | 浏览器选择适配；本API轮未执行OS选择器 |
| IPC-f5725b5e0d8a | app:get-docx-safe-mode | 实际GET /api/preferences/docx-safe-mode |
| IPC-e25810712ab1 | app:set-docx-safe-mode | 实际PUT /api/preferences/docx-safe-mode |
| IPC-2e9ce1df9fec | app:reset-docx-safe-mode | 实际DELETE /api/preferences/docx-safe-mode |

## 修正的实际缺口

- Word图片OCR此前误映射成人脸查找，现已补专用真实OCR、完整字段和明确应用新版本。
- 兼容预览设置已持久保存时间／原因，支持降级与恢复；原文窗口保留绝对偏移。
- 标注坏坐标由500改为明确400；原生长类型／id／source和完整meta不再被200字符门截断。
- 组合／混合假名支持完整最长匹配与跨run还原，未知组件仍拒绝。
- 批量还原现在有真实工作线程进度与事务提交后完成事件。
- 合法240字符文件名完成Word/MD单份、批量、ZIP实际下载；不截断文件名。

## 验证与限制

6项真实隔离API通过（23.40秒）；6文件31单测通过（4.02秒）。原失败日志与精确修改前字节已保留，逐响应字段／hash和源证据见同名JSON。

本轮B未启动Edge或云服务；浏览器验收由root独立执行。原生`.doc/.wps`转换、OS filePath／取消回执不是本轮已完成能力。真实黑白章质量仍按独立金标证据记录，不使用合成oracle冒充准确率。

## 独立对抗审查增量

A 独立完整 6 API 用例通过（15.48s）；另发现候选完成后原件被替换仍可应用的 P2。已补写前真实原件/解锁副本双哈希及当前 canonical AEAD/哈希复核，任何异常均 409、不增版本、不创建验收快照。独立反例复跑正在进行；此前失败日志保留。

B 对 A 的 CFB 目录环 P1 已用真实合成文件独立关闭，CFB.read 调用为 0；文件夹流首帧篡改暴露明文为 0、错误总哈希/截断/对象替换全拒。B 对 C 的跨时区备份 P2 和权限迟回 UI P2 已关闭。详见同目录独立报告。

全 786 张混合公开印章 test 正按固定 revision 原样运行，未训练或改变阈值；该集无黑白章/商业分层且上游授权链未核，不能冒充独立商业黑白章质量证据。评估与软件接口完成度分别记录。

### 源完整性 P2 独立关闭

A 最终对抗 1 test / 3 个独立篡改分支通过（3.153s）：原件、当前 canonical、已解锁副本分别返回 **409 SOURCE_MISMATCH**，revision 保持 0。原错误实际200日志和修后逐项 JSON 均保留。代码 SHA 已更新到修后版本；接口审查已通过，不等待独立混合公开集准确率评估。

### Source 首尾空白别名 P2 独立关闭

最后逐源复读发现 hm 的 string 假名保留首尾空白，Ad 同时保 raw + trim 拼写。已完整移植，raw/trim 共用 occurrence 游标、不同原值/队列碰撞硬拒、内部 literal 空白保持精确。C 独立 3 API / 28.429s，通过保存的真实 LPM→MD/跨 run Word 对 plain/wrapper/mixed 的两拼写还原，正文逐文本节点精确等于原文，不留多余空格。5文件30定向单测通过，另 Word body→docProps 连续 occurrence 探针通过。文件 SHA 已再次更新；B 产品代码冻结。

### 全786混合公开集已完成

786成功/0partial/0失败；IoU.5 TP316 FP1496 FN999，精确率17.44%、召回率24.03%、F1 20.21%。明确当前印章质量不足。详见 `public-stamp-validation-20261015.md`；它没有黑白商业分层，不能替代独立商业黑白章验证。
