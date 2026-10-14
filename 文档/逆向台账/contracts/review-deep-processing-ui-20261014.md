# 核心处理与 UI 独立对抗审查

**结论：No findings.** 当前快照没有未解决行动项。3处报告准确性问题已修正并独立回读；维持 S2/R0，不支持 S3 提级。

## 已修正问题

### [P2] 明确长图重叠区没有去重（已解决）

原“无缝区去重”容易被解释成去重能力；源码逐条push后直接返回，没有重叠区过滤。
生成器、JSON、Markdown均明确为“没有对重叠区去重”。

触发条件：高度大于7500的图像按6500高、6300步切片；相邻切片200像素重叠。

源码：`.data/research/lawbot-2026-10-13/readable/main.js:4558-4577`

### [P2] 区分DOCX替换轮数和替换处数（已解决）

原“每entity最多3次”会被误读为每实体仅替换3处；三轮是每实体每段落调用replace_in_runs的重试上限，一轮可处理多个匹配。
生成器、JSON、Markdown已明确每实体每段落最多3轮，每轮可处理多个匹配。

触发条件：同实体在同一段落存在多个exact匹配，或在多个段落重复出现。

源码：`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:592-634`；`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:681-749`；`.data/research/lawbot-2026-10-13/runtime-mount/Lawbot脱敏猫.app/Contents/Resources/scripts/docx/redact_docx_inplace.py:767-799`

### [P2] 给PDF跳过无效框结论补上锚点门禁（已解决）

该条件会在es/Za中拒绝整个输入，不能把所有缺框实体概括成普通continue。
主报告新增pdf-anchor-gate精确证据；DP14和DP-F03已限定先通过es/Za。samePositionBatch在无效或越界框的额外拒绝也保留；缺bbox直接continue仍成立。

触发条件：实体meta同时满足approximate、anchorReason含回退默认框、rangeAdjusted/userAdjusted均非true。

源码：`.data/research/lawbot-2026-10-13/readable/main.js:4285-4320`；`.data/research/lawbot-2026-10-13/readable/main.js:14599-14777`

## 范围与证据

| 分组 | 唯一接口数 |
|---|---:|
| processing | 44 |
| system | 53 |
| collaboration | 67 |
| formats | 88 |
| ui | 6 |

合计 258 项，与当前台账严格相等；组间无重复，无遗漏、无多余。核心 44 项中，25 项关联本轮新章节，19 项仅继承旧契约；不得称作本轮逐端点全链深读。

UI 25 段、核心 79 段、继承证据 133 次引用的全文及原始字节切片哈希均独立匹配。UI 6 项恰好等于台账 UI 集合。D9 解析打印复核通过（TypeScript 5.9.3），仅解析，没有执行竞品模块。

## 核心风险复核

- **DP-F01**：主输入仅检验原始truthy，wm归一化可变空；indexOf空串及长度0推进可形成不终止循环。需有缓存页及实际迭代的行/词；真实UI可达性未运行。
- **DP-F02**：多框分配helper要求非空假名、正总宽度且框数大于假名codepoint数；min1之后递减循环无法把总数降到目标。其直接调用位于特定内部像素渲染分支，不能推广为所有图片/PDF导出。
- **DP-F03**：通过Za前置门后，普通实体缺bbox或无效/越界框可被skip；samePositionBatch仅在部分异常分支throw。源对象未复制不能推出敏感像素全部遮住。
- **DP-F04**：Python页眉/文本框/图片异常可吞，正文/表格残留检查仅pass；JS结构检查不等价于内容残留检查。依赖DOCX实际保真仍未运行。
- **DP-F05**：NER输入按codepoint递增1而消费者使用UTF16切片；OCR搜索位置同样存在codepoint表与UTF16 indexOf差异。无需断言所有含emoji输入都会错。
- **DP-F06**：apply先登记running；指定非Markdown early return分支不落completed receipt，finally只清理活动任务等；同requestId查询/重试可持续看到running。
- **DP-F07**：getOCR共享在途Promise仍可在clear-cache删除q2后回填；clear-cache不取消J2。需要在途任务条件。
- **DP-F08**：报告handler把copy_export_test、page_continuity_check和manual_ops_count等设为字面值，不能引用为现场测试或R2证据。

## 审查边界

- Structural/hash validation proves evidence identity and inventory reconciliation, not semantic completeness.
- 25 core interfaces have associated new sections; 19 retain prior contracts only. Association does not mean all endpoint branches freshly reread.
- Four bounded endpoint closures do not establish UI/preload/state lifetime/complete business contracts; no S3 promotion supported.
- No competitor JS/Python/Swift executed, no license bypass, no browser or application test run; every competitor runtime status remains R0.
- Six explicitly listed readable dependency groups, model/native-library behavior, licensed end-to-end samples and complete format fidelity remain unresolved.
- Later PDF/OCR supplements are outside these input hash snapshots and require a separate review.

读取全部 21 节结论，优先独立追踪 8 项风险及关联前置条件。逐字哈希和集合校验不构成全部算法、所有上游调用或端到端行为证明。未修改应用代码或台账；台账由 root 统一维护。
