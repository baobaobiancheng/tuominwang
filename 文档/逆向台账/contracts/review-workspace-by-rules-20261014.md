# A 对工作区可移植链的独立对抗审查 · 迭代028

范围：`core/workspace-compat.ts`、`adapters/reference-portable-draft.ts`、`api/workspace-portable.ts`、`tmm-compatibility.tsx`／`portable-draft.tsx`，只读，不改作者实现。已审来源格式桥接、任意raw类型身份、映射绑定、版本／原件hash、真实cell/page范围、模糊匹配保留unresolved、RLS权限与重识别后的人工待审。

## 当前结论

未发现新的可复现合格缺陷。A 独立运行 `tests/workspace-compat.integration.ts` 全部 **3 项通过，46.34 秒**，不是沿用作者口头结果：

|链|独立实际结果|
|---|---|
|TMM V1／V2／V3 写入，迁移V3，审查方案继承，真实Word／Markdown应用与还原|通过；不只codec同字节|
|无我方native扩展的外部TMM原件强绑恢复|恢复项均pending；歧义项完整unresolved，逐项人工处理后仍需复核|
|旧native raw Markdown恢复|重建当前scan／source-map偏移、保持pending，之后真实导出验证通过|

证据：`.data/research/lawbot-2026-10-14/iteration028/workspace-compat-independent.log`。源码文件SHA与证据SHA保存在同名JSON。已知旧MD coverage/source-adapter问题在此次实际调用链已通过，不凭家族名升级其他接口状态。

## 审查边界

这证明当前我方隔离API调用与文件结果，不是正版竞品运行互操作、其他桌面AI客户端安装、未知native组件或真实业务准确率。源R0继续保留；导入的approval不会被信任。源private snapshot/schema与codecs各接口仍由逐ID台账独立记录。
