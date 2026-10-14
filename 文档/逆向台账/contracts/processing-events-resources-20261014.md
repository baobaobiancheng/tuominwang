# ITER028 真逐页进度与临时资源链

|稳定ID|源合同|实际闭合|状态|
|---|---|---|---|
|A-027-progress|requestId/sequence/heartbeatAt/5秒心跳|worker事件协议独立于终态；序列化AEAD事件，按owner/job/generation/版本/hash检查；UI游标分页|页处理与MD专用source-ready／matches实际闭合|
|A-027-page-processed|PDF OCR页/Word过滤后候选|真正OCR回调先发布，随后全部上下文过滤后按强绑定anchor发送pending候选|当前canonical格式运行通过，差异明确|
|A-027-release-sources|本会话源registry/cache释放|核验原件后产生独立session私有临时buffer，读取/释放真实删除临时对象|云端适配通过，enginecache删除计数真实0|
|A-027-cleanup-paths|成功receipt、同sender、15分钟、未保留、一次|真实成功artifact核hash后派生临时副本，严格session/owner/类型/期限/一次性，只删临时副本|云端适配通过|

真实隔离API3通过5.56秒：两页PDF运行中已有事件，OCR1/2与识别1/2序号连续；OCR文字、真实glyph、map/previewhash保留，手机号pending；同uid不同登录session不能读/清源cache；过期/保留/未知/错误类型不清；永久原件与副本仍可下载。具体文件指纹见JSON。

## Markdown 独立源码层：迭代028已接运行

已独立实现源 classHi parser 与 MarkdownSourceWriter 全字段及字节分支。27完整parser／103Writer源纯函数golden，真实AEAD sidecar／parseVersion2／源字节重建／逐项图片HTML确认。真实parser完成source-ready；规则、真实NER126窗口、上下文完成发布provisional matches，首次／25k实际完成字符／250ms／末尾刷新条件都消费。不是定时假chunk。

当前验收：4隔离API通过17.48秒；实际NER默认与progress输出完全相同通过2.36秒；默认复核页完整Edge操作通过18.3秒且reload确认仍在；162定向单测通过。源码／接口／界面／证据hash见 [Markdown阶段报告](markdown-source-porting-20261014.json)。历史027原文件hash与当时partial状态保留在JSON.history，未用新版覆盖历史事实。

候选provisional不能当人工批准；source-ready包含原文但事件AEAD存储，仅相同owner、project权限、job/generation/版本/hash可读。Word仅图片OCR事件对应真实图片canonical页，不宣称Word所有物理页自动精确分页。

没有竞品正版完整处理运行证据（R0）。我方实际测试不等于竞品动态等价；总体门禁和发布仍由root执行。
