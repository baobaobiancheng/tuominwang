# 规则与辅助接口增补独立对抗审查

当前快照无未解决 P1/P2。6 处准确性问题已由报告作者修正并独立回读；继续维持 S2/R0，不支持全链 S3 提级。

## 实际审查范围

- 阅读 24 节结论，逐读 19 个辅助 handler；重点复读人脸、旧图像遮盖、source registry、报告声明、表格 NER/融合/关系图。
- 114 个全文/切片哈希匹配；19 项恰好等于核心报告未关联新算法章节的辅助集合；41 基础规则序号连续。
- 独立比对实际 face_yunet.onnx 与磁盘 metadata：232589 字节，SHA256 `8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4` 一致。
- 没有执行竞品、推理或受许可流程；未改业务代码或台账。

## 已解决问题

### RS-A01 · P2 · 人脸元数据精确键与非空校验

DPS12写models.face；生成器同样使用错误键，modelIntegrity为空数组。
已改models["face_yunet.onnx"].fileSizeBytes，并固定要求1条。独立直接读取模型文件及metadata，232589字节与8f2383e4…2552fa4一致；这仅完整性，不是模型精度。
证据：`.data/research/lawbot-2026-10-13/readable/main.js:8277–8303`

### RS-A02 · P2 · 前文提示160不是所有锚点回退的硬窗口

DPS32将前文提示简写160，容易误认为后续定位也受该范围限制。
限定lastIndexOf近游标分支；随后indexOf提示→original回退无160距离限制。
证据：`.data/research/lawbot-2026-10-13/readable/main.js:5611–5629`

### RS-A03 · P3 · ci不存在全局回退

DPS33称顺序/全局锚。
ci仅indexOf(cellText,cursor)，失败continue；与oi或xi其他定位函数区分。
证据：`.data/research/lawbot-2026-10-13/readable/main.js:5656–5677`

### RS-A04 · P3 · Ei按包含标点过滤

DPS33称纯标点过滤。
/[，。；：！？]/对任一这些中文标点命中即删除候选，不要求整个字符串纯标点。
证据：`.data/research/lawbot-2026-10-13/readable/main.js:5808–5827`

### RS-A05 · P3 · buffer与path注册的哈希时序不同

DPS15 hash延后未明确适用分支。
path分支懒算hash；无path的buffer分支注册时立即算SHA256。
证据：`.data/research/lawbot-2026-10-13/readable/main.js:15759–15789`

### RS-A06 · P3 · 表格NER并发范围与分片阈值

两个并发predict与420上限容易推广全部预测。
420阈值遇单大cell不截断；两个并发只主contexts，跨行地址预测后续串行。
证据：`.data/research/lawbot-2026-10-13/readable/main.js:5136–5240`

## 已确认关键结论

- **DPS13**：旧su图像遮盖alpha.95，异常返回原buffer；跨类型相同框可在第二遍互相包含删除；不能泛化到Sc当前导出。（main 10161–10211）
- **DPS12**：BGR CHW float32 0–255；三stride、sqrt分数、反letterbox与IoU严格小于阈值；无推理中取消。（main 8320–8411）
- **DPS15**：旧path注册复用、ENOENT恢复不校原hash、resolve沿用hash、release先移map后await close均成立。（main 15759–15908）
- **DPS10**：zero_upload_guarantee字面true及部分meta缺省0/unknown，没有实际隐私保障测量。（main 12728–12742）
- **DPS31/32**：NER实体须落单cell span，严格释义可独立保留；无通用置信阈值；锚点最终可全文首命中。（main 5100–5655）
- **DPS33**：关系图启发式而非连线模型；同框同文可保留bbox-only，冲突框无可靠文本锚才整体删。（main 5690–5827）

## 审查边界

本轮不声称二次穷举 41 组正则及所有 legacy 平台链；19 个 handler 与已列 helper 的静态复读不等于 UI 生命周期完成。第三方数值行为、缺失跨平台资产、完整 renderer 和合法运行结果仍未闭合。目标快照哈希、精确源码范围与切片哈希见同名 JSON。
