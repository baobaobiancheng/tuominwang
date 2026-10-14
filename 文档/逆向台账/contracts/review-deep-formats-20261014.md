# 格式与规则深层报告对抗审查 · 2026-10-14

## 结论

**6个常量端点可作为窄S3候选；49个应用边界候选和33个项目依赖未闭合项不能整体提级。R0保持。**

6个learner接口仅固定返回空值/停用提示，固定返回的可证明性不意味着实现了学习、更新或回滚能力。49项的“候选”由命名空间批量生成，不能替代逐接口调用链证据。

本轮独立语义审查：6个常量handler，以及规则/方案/反馈/审核/容器/token索引/源登记关键分支。其余接口集合/hash核对不是全链语义验收。

## 待补项

### REV-FMT-01 完整枚举和公共错误映射不在模块精确引用范围中

状态：resolved-after-independent-readback

profile实施范围18931起，遗漏18928的$m/Lm/Fm/Bm/jm常量及18929–18931 Vm对象检查；26078结束只含DI声明，遗漏26079–26081错误映射体。secure范围14847起遗漏14846的magic、chunkSize、头大小、对象类型、V2容量限制。完整文件hash能固定源文件，不能代替这些引用范围中的参数和值已被审查。

要求：作者已补secure14846、profile18928及26081，独立readback与build/verify通过；本项已关闭。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:18928–18932`；`.data/research/lawbot-2026-10-13/readable/main.js:26078–26081`；`.data/research/lawbot-2026-10-13/readable/main.js:14846–14847`

### REV-FMT-02 49项候选由命名空间分配，不能整体升S3

状态：promotion-blocked

build脚本仅以dictionary/feedback/review/ruleset/profile/preference/learner namespace为条件生成49候选。此分类不证明每端点所有项目内函数闭合。例如review导出外层ce→TaskPowerLeases，ruleset.initialize→feedbackStore迁移，dictionary导出命名→license.getStatus/getUserDataPath，原报告仍须链接并核验实际实现；作者已补ce/TaskPowerLeases范围，公共wrapper异常边界仍须保留。报告正文已明确候选不是S3，审查支持保留该措辞，不支持一键将49条提升。

要求：每ID建立已闭合调用边及明确外部终止边；公共模块证据可引用系统/引擎专项；须逐ID审核后提升，标准Node/Electron API运行R0可独立保留。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:17–26`；`.data/research/lawbot-2026-10-13/readable/main.js:14346–14357`；`.data/research/lawbot-2026-10-13/readable/main.js:16792–16804`；`.data/research/lawbot-2026-10-13/readable/main.js:18886–18906`

### REV-FMT-03 校验器只保证部分分类与证据完整性，不能验语义

状态：classification-guard-fixed-semantic-boundary-retained

既有校验88 ID/121证据/6负向探针通过。首版独立内存变异把workspace行改为reviewed-application-boundary-candidate仍通过；作者现已补三分类集合/汇总校验与新增3探针，修复后该变异被拒绝。将review模块network_out_bytes固定0文字改为真实测量仍通过。后者是语义审查边界，不要求用字符串断言伪装语义测试；前者可以加强分类/summary一致性检测。

要求：分类枚举/集合/summary校验已修复；仍仅称结构/hash探针通过，语义结论依赖人工源码核读。

证据：`.data/research/lawbot-2026-10-13/readable/main.js:18814–18829`

## 已确认的具体发现

- 6 learner常量是真常量，get-stats另有chunk调用。允许6个端点窄S3候选；固定停用/空值并不实现学习功能，R0不变。
- review外层filePath实为整个服务结果对象，outer success可吞内层失败；network_out_bytes=0固定。报告正确，不能实现对齐时继承其成功假象。
- rules保存强制all/exact/description空，迁移forceSkip优先；多文件写无统一事务。报告正确；revision仅乐观比较，不是锁/跨进程原子CAS。
- profile迁移与writeJsonAtomic失败删除旧目标后再rename；recordSuccessfulExport只是写声明。报告正确；初始化迁移有副作用，get/list也非总纯读。
- Mu默认encrypt:true但无key明文，key路径循环XOR；batch审计在save之后。报告正确；XOR不是安全容器。
- 容器写后只读取首/尾范围验证，文件sync但无目录fsync。报告正确，不能等同全payload写后校验。
- approvedTokens只从meta索引读取，强制1–5000且<=256。报告正确，与协作COL-03交叉支持。
- 源registry具体实现仍需从workspace生命周期连接。协作COL-02已展开dp有路径忽略buffer/同路径复用；可补作formats跨报告引用，不能仍笼统遗留未知。

## 验证边界

修复后校验器：88条接口、123处证据、9个负向探针通过。首版曾接受的workspace候选分类变异现已被拒绝；把固定network_out_bytes描述改成网络实测仍说明语义审查不能由文件hash代替，文档已明确该限制。未修改别组报告、应用或ledger。
