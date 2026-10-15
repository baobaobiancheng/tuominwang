# 规则与材料处理接口逐项实测（2026-10-15）

## 结论

28 个确切方法各有实际成功调用，缺失 ID 为 0。5 组隔离 API 流程通过（33.39 秒），不是仅注册接口或用错误请求代替成功功能。竞品许可处理链仍为 **R0**，不宣称 Electron／本地操作系统接口动态等价。

|稳定 ID|源方法|真实成功调用数|负向调用数|
|---|---|---:|---:|
|IPC-5a998529649c|desensitization:apply|1|0|
|IPC-88cd1d915682|desensitization:cancel|1|0|
|IPC-fd1ca8c6cb27|desensitization:cleanup-paths|1|0|
|IPC-e8dcb4d0e8b3|desensitization:create-folder-output|1|0|
|IPC-7d7d2d58da91|desensitization:detect-only|1|0|
|IPC-42a70f50df5f|desensitization:detect-route-only|5|0|
|IPC-85f474cad97a|desensitization:generate-reports|1|0|
|IPC-8c5afeb517e6|desensitization:get-apply-result|1|0|
|IPC-a09f09579955|desensitization:get-markdown-export-stats|1|0|
|IPC-7b3e67a5a715|desensitization:get-resource-diagnostics|1|0|
|IPC-58567733591e|desensitization:page-processed|1|0|
|IPC-c1cec3199992|desensitization:process-file-main|1|0|
|IPC-27dd16394cd6|desensitization:process-files|1|0|
|IPC-8fc7e5c07051|desensitization:progress|1|0|
|IPC-a07c3fdcbe45|desensitization:read-file|1|0|
|IPC-f071ce7c965b|desensitization:read-source|1|0|
|IPC-8f1caa190dda|desensitization:register-source|3|1|
|IPC-d9b14aa97589|desensitization:release-sources|1|0|
|IPC-3bea45842355|desensitization:resolve-folder-output-path|1|0|
|IPC-f1f713df2b98|desensitization:save-file|1|0|
|IPC-629ace0aecd1|desensitization:save-markdown-draft|1|0|
|IPC-9577d3a9d6d0|desensitization:save-report|5|0|
|IPC-e29b03465bc3|desensitization:scan-dropped-folder|1|1|
|IPC-95d4f752bfb1|desensitization:select-files|1|0|
|IPC-523337153cab|desensitization:select-folder|1|0|
|IPC-0ea3b09c375b|desensitization:update-runtime-rules|1|0|
|IPC-96ccc7c0ce76|desensitization:validate-folder-source|2|0|
|IPC-e84cabdffc27|desensitization:write-folder-manifest|1|0|

## 本轮实现与真实修复

- 材料类型单独识别：读取真实原件；DOCX 使用 Mammoth 主链，PDF 使用同版本公开 PDF.js 文本与向量表格布局链，Markdown 使用真实 scanText；不更改复核状态。
- 源纯函数对照：1200 完整路由输出、1688 PDF 抽样分支、34 Word 规范化、140 首页面布局与 18 向量绘制分支；6 项单测全部通过。
- PDF 的 6000 字阈值是在整页提取后判断，首个页面大于6000字仍完整保留；手动类型覆盖的 confidence1 与全零分数也逐字段对照。
- 文件夹结果：独立12小时会话、租户/用户/权限隔离、CAS、完整输入清单、未上传/失败/取消/空目录真实状态、已复核副本二次校验、唯一输出目录、HTML转义及ZIP。
- 大批量文件夹使用分帧AES-GCM存储和懒读取，逐帧绑定对象ID/序号，认证footer绑定SHA/总大小/帧数；下载先完整认证，再每帧认证后输出。真实2×26MiB不可压缩输入生成 **54,543,172 bytes** ZIP，全部项hash一致，篡改拒绝，原件不变；不改通用上传／Office ZIP上限。
- 合法1013字相对路径的处理报告曾被任意1000字限制拒绝，已移除此额外限制并实际回归。
- 个人词条提示接口不再另设 raw type200／pattern2000 的限制；源允许空字段默认与其规范化语义保留。
- CFB目录图先执行完整原始校验，再进入第三方解析；目录循环用真实加密容器修改，独立spy证明 cfb.read 调用0。

## 并行代理对抗审查

|对象|A独立运行|结果|
|---|---|---|
|B视觉、Word图片OCR、还原|6 tests /15.48s|通过|
|C假名表目录、4种备份与下线learner|3 tests /12.21s|通过|
|C异步工程保存／恢复回执|2 tests /3.07s|通过|
|C 49个个人确切接口，含长类型／词条提示|4 tests /34.87s|通过|
|C source Mm/Pd/kd 组合|2500 seeded cases|完整输出零差异|
|B OCR apply 源完整性反例|1 actual test /3.15s|修复后原件／正文／解锁派生错hash均409，revision0|

新发现的OCR应用前缺少源字节复验已由B修复；异步工程保存确定失败后的请求ID清理已由C修复。保留了修复前后的证据，不以“后续导出会拒绝”代替应用链验收。

## 范围边界

- 网页用授权不可变ID与相对ZIP路径适配本地sourceRef／输出目录，不提供任意服务器路径读写；原生文件选择对话框与目录mtime没有冒称运行。
- 本分支没有实现旧版DOC／WPS转换。对应差异交root继续列明，不能据此宣称所有支持格式完全等价。
- 本文API与纯函数验收不等于浏览器验收或竞品许可运行；全站UI、发布与部署由root分别验收。
- 逐项源输入／输出／异常、真实HTTP请求与结果hash、全部代码与证据hash见同名JSON。
