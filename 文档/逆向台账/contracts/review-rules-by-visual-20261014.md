# 视觉／文件模块作者对文本规则的交叉审查

审查范围：`reference-rules.ts`、`reference/rule-data.json`、`reference/blacklists.json`、`reference-mask.ts`、`recognition-pipeline.ts`；仅查本地已提取静态证据，没有运行授权竞品处理链。未以规则名称或抽取数量作为完成等价声明。

|检查|观察与结果|
|---|---|
|基础组|39个spec加OCR邮箱／网址两个分支，清单共41组；手机号、邮箱、URL输入优化均记录安全差异，未以截断输入避开长文件|
|金额|17个regex branches归12种业务family，专门排除时间戳／日期／比例／股数／面积／利率；需真实语料误报评估|
|黑名单|实际读取JSON逐一数得108类别、3012数组项，全为数组；执行用去重Set，计数不等于3012不同词|
|全regex|rule-data含57 patterns与527 regex literals；独立解释器读取pattern与指定literal，同时有重写语义。527条已保存不是527分支全部已运行；不存在授权竞品运行证据|
|校验差异|原身份证／信用代码／Luhn验证仍保留；新增源码结构候选不等于通过真实性checksum，均pending|
|标记来源上限|同跨度／类型由mergeCandidates合并，超过8个独立source明确失败，未静默截断；本轮地址＋字典探针见2–4个来源，没有实证普通输入超8|
|Unicode|姓名保留整codepoint，全星按codepoint；replacementFor拒绝未遮掉完整原文、孤立surrogate，预览／各格式公用该出口|
|格式锚|发现下面两项跨对象问题，作者已修复且本审查者独立复跑反例关闭；不能据一个手机号跨cell案例宣称所有field／NER已隔离|

## P2-01 NER省名修复扩张越过源对象

`filterCompleteNer`没有传anchors，`repairReferenceProvince`扫描全局前16字符。实际探针：文本 `广东\n省广州市天河区合成路88号`，在两个CSV cell或OOXML story中，原NER候选start=3/end=16，返回start=0/end=16。同OCR页内换行修复有意义；跨对象则可能使后续Office／页面导出门拒绝。建议在候选所属规范anchor内做修复再加offset，明确拒绝跨anchor。

## P2-02 原字典候选仍可跨OOXML story

`detectComplete`让参考规则按span扫描，但仍全局调用旧`detect(text,anchors,dictionary)`。实证 `联系人：\n张三` 两个story anchors0–4与5–7，字典literal为整串时返回自定义候选0–7。应保留全局表头列归属，但原字典／字段候选也必须被一个规范anchor完整覆盖；不应把不可导出的跨对象标记当正常候选。

## 修复复查（2026-10-14）

两项 P2 已关闭：`filterCompleteNer(text,marks,anchors)` 将候选所属最窄对象传给参考后处理，局部修复后加回 offset；`detectComplete` 对旧字典/字段候选也要求存在一个完整覆盖的规范 anchor。本审查者独立复跑上文两条反例：跨 cell 地址仍保持 start=3/end=16，跨 story 整串字典返回 `marks=[]`。没有借用作者测试结果作为唯一关闭依据。

仍保留以下验收边界：527 regex literals 已抽取不等于所有分支已逐条动态运行；3012 黑名单数组项的重复数不能隐去；所有新增结构候选 pending；金额真实语料准确率及竞品授权链等价未证实。

## 追加格式接线对抗审查：两个 OOXML 分支遗漏（独立复证关闭）

|问题|初次真实格式反例|源码与修复|独立复证|
|---|---|---|---|
|P2-03 vMerge续行丢继承标签|第0行“姓名(vMerge restart)／张三”，第1行“空(vMerge continue)／李四”；typed adapter 未生成空 continuation，结果仅张三|源 main.js4831–4841 的 owner 文本复制；现维护每table/colSpan owner，空续行仅作继承语义，不重复原文标记；nonempty continuation独立actualText强绑定|同一真实OOXML现在张三、李四皆pending|
|P2-04 嵌套表格丢局部单位上下文|父cell段落“单位：万元”后嵌套表格3000.50／4000.75；旧 adapter 排除所有处于table的preceding paragraph，金额候选为空|源main.js4809–4826递归前三段context；现按真实XML树建立每table进入快照，继承parentcell局部上下文|两金额现在pending；另一个cell nested5000.25／6000.75以及独立sibling7000.50／8000.75均未错误继承单位|

独立探针完整 cells、contexts、marks 保存于 `.data/research/lawbot-2026-10-14/iteration022/table-xml-independent-probes.json`。仅新增 OOXML 接线范围已复核；PDF/image几何表格重建作者仍在实施，不能据此报告宣称该新范围已最终冻结。
