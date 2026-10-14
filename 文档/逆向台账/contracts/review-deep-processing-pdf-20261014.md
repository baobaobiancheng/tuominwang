# PDF/OCR 增补定向对抗审查

本轮仅独立复核下列风险，**没有重审 PDF 全部 9 节**。公开发布包可见代码只读，R0。

审查快照：`文档/逆向台账/contracts/deep-processing-pdf-20261014.json` SHA256 `1dd23381feb0bd105854762396be859d6a872622d13447e55963949f54f9a9ad`；30项证据hash一致仅证明身份。

## RP01 · PDF03 · supported

策略/类型/文本SHA缓存没有运行时规则版本；命中分支复制缓存而跳过applyLearnedWhitelist/ForceSkip/rescan，之后仍cc/sc；部分region失败仍可从y3生成候选。

只证明条件和控制流；未验证规则更新真实并发时机或样本影响。

## RP02 · PDF04 · supported

required OCR只在recognizeImage抛异常时降级；success:false没有触发fallback，默认OCR_PAGE_FAILED；允许失败环境值1时保留P3原页到S2并continue。压缩PNG字节启发式不等于解码空白页检测。

未运行空白误判/失败导出样本。

## RP03 · PDF05,PDF08 · supported

bboxMissing实体仍加入M2；Gl.unmapped仅构造诊断表达式、不抛；旧非detect-only流继续applyMasksToImage。DPS13补读确认该旧helper alpha.95且catch原buffer，与安全新writer应分开。

本轮未从UI重新追溯每个mode的可达性，不泛化全部导出器。

## RP04 · PDF07,PDF09 · supported

Qi经$i取得UTF16 rawIndexes给Xi，而Xi按展开码点slice；非BMP前缀具索引错位条件。Da同样展开码点，Oa.charCodeAt不可能>=131072，补充平面CJK分支不可达。

只做语言语义和源码核读，未运行vendor helper或图像坐标测试。

## RP05 · PDF08 · supported-after-clarification

samePositionBatch并非保证所有缺框拒绝：n4不存在/空数组在进入逐框校验前continue；只有存在bbox且无效/完全越界才throw。作者已按反馈补入当前报告。

sh等完整数学分支未在本次交叉审查全部重读；本次重点为缺框分支顺序。

## RP06 · PDF09 · supported-for-read-subset

ba的8块门和几何启发；va仅轴向线段、曲线使path无效、细填充矩形<=1.5、长度>2、网格闭合/最小8x7/1.25容差及页边界过滤；无法由名称推断一般曲线/斜线表格支持。

本次未重读3699–3780及3835–4132全部consumer。原报告30范围哈希匹配不是这些分支的第二次语义审查。

## RP07 · PDF06,PDF07 · cross-report-boundary-resolved

oi/yt/Ei的本轮可见项目语义已由规则增补DPS01–DPS06、DPS30–DPS33补读，Kt/NER仍引用核心DP03/04；PDF报告可改为已提供证据依赖，而非继续待分析。

仅接入既有独立分工证据；PDF全体9节未由本审查逐字二次重读。

## 结论

重点风险有源码依据；1处边界措辞已纠正。维持S2/R0，没有全业务闭合或等价认可。

未重读范围：
- PDF01/02完整child/planner协议
- PDF06 D9全体几何helpers
- PDF05所有局部bbox算法
- PDF09未列sourceEvidence的consumer行
- renderer时间状态与授权运行结果
