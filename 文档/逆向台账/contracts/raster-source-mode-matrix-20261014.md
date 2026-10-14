# 源图像／PDF／Word 绘字模式矩阵 · 迭代028

## 决定性条件

`masked` 是检测文本字段，**不能单独决定图像重新绘字**。源 main17425 的 `j3` 是 IPC `enablePseudonymization`；renderer先产生逐项`meta.pseudonym`，main／绘图层按这个标志绘字。

|输入模式|前端来源条件|图片／PDF／Word嵌图|Word正文／Markdown文字|
|---|---|---|---|
|整体default_star|computed masked，enable=false，meta.pseudonym不自动设true|只填色清除；即使masked='138****8000'也不绘回|按computed masked替换|
|整体full_star|全文字先码点全星；visual的oO把full_star归一化default_star|视觉格式归一化纯清除；不因为字符串有星而绘字|Word／MD全星替换|
|整体custom/default pseudonym|已分配token置meta.pseudonym=true；缺token时main jr补合法类型|先清原像素，再对meta.pseudonym&&masked项绘token；其它实体只遮盖|正文写token|
|selective：mask|qp返回null，mh2设meta.pseudonym=false/mixedAction=mask|纯清除；不绘masked原旧值|使用源旧masked替换；Word image另纯清除；我方显式人工clear是安全扩展|
|selective：partial_star|qp=Nt(type,original)，mh2设meta.pseudonym=true/mixedAction=partial_star|清原像素后绘部分星号|写Nt结果|
|selective：full_star|qp按Unicode码点全星，meta.pseudonym=true|清原像素后绘全星；与整体visual full不同|写全星|
|selective：pseudonym／编辑token|meta.pseudonym=true，非空current／autoValue|清除后绘选定token|写token|
|自定义替换／类型占位|源以pseudonym编辑条目导出时置true；我方显式custom/type须保人工选择|我方显式替换允许绘字，不能将automatic detected-mask默认当手工pseudonym|按明确替换输出|
|forceDetect／raw未知类型|只增候选，不改变renderer标志；jr只支持Er规范类型|仍按相同模式；未知未设pseudo时纯清除，不能凭forceDetect绘字|源未知runtime字段默认****；我方raw身份独立保留|
|手工画框／搜索清除范围|原source PDF优先manual并按重叠压制自动项|人工明确清除必须最终有效，不得被自动派生绘字覆盖；rect/circle各4色均同|不改原件|

## 精确调用依据

|位置|真实分支|
|---|---|
|renderer5328 qp／33480–33484 mh2|mask=null/false；partial=Nt；full=码点星；其它token，后三者true|
|renderer27839 sO／27842 oO／33755–33758实际caller|visual image/PDF整体full_star归一化default_star；selective动作不通过该整模式归一化|
|renderer32209–32237 ur2|full_star与default_star均enablefalse；pseudonym按已有token、统一映射和未解决项决定main是否补生成|
|main17425／17528–17550 image|j3 true→jr.apply→WithPseudonyms；j3 false但存在pseudo&&masked→With；完全无pseudo→applyMasksToImage只bbox|
|main6838–6860|applyMasksToImage只fill／stroke shape，完全不读masked|
|main6861–6888|WithPseudonyms仍逐实体先fill；仅meta.pseudonym&&masked调用drawPseudonymOnMask|
|main17638–17645 PDF调用／14700–14718真实renderSecurePdf|enable选项不直接决定绘字；真实每框pseudonymFragment／masked也要求meta.pseudonym；多框可split|
|main17555–17580 PDF人工优先去重|先按operationSource=user/source=manual/manual=true排序；manual覆盖自动交叠≥.65、同原文交叠≥.35压制后项|
|main17695 Word正文与17724／17754图像lines|正文传pseudonym及masked；图像line.pseudonym仅来自true meta.pseudonym|
|scripts/docx/redact_docx_inplace.py215–223／1345|正文优先pseudonym，再masked，再fallback；图像只line_info.pseudonym绘字，不因masked存在绘字|

## 证据与验收状态

本机从源main提取**仅图片caller控制流**，40个组合（enable×pseudo×masked×mixedAction）用fake ImageProcessor验证真实选择clear或WithPseudonyms，全部通过。无激活、无native渲染运行，不能将此当像素验证。证据在iteration028/raster-caller-source-oracle.json/log。

我方pixel修正由root/B实施与真实API／Edge复核；本文只绑定源码条件，不以字符串253mask oracle声称所有图像都应绘字。默认绘字与手工清除重绘P1只有实际像素证据通过后才能在台账关闭。
