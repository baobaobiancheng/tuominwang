# A 对手工最终清除与源图像绘字条件的独立审查 · 迭代029

只读审查B当前`core/visual-replacement.ts`、`adapters/visual-replacement.ts`、`adapters/profile-export.ts`，不改作者实现。

## 已独立复证

`tests/manual-clear-override.integration.ts` **1项实际隔离API通过86.44秒**，覆盖18个真实导出结果：PNG／PDF／DOCX × 人工partial/full替换 × 无最终框／rect／ellipse。实际读取导出像素与原件，不以HTTP200替代核验；区域内部最终清除，外侧像素保留，原件immutable。相交绘字不会作为完整label重新写入Markdown侧车。

源码检查：`finalClear`在所有绘字composite后再次clearPixels；零draw路径已由初始erase包含区域；ellipse相交判断保留外角而不是矩形bbox全擦；图像绘字仍先要求真实矩形擦除覆盖，不能拿ellipse包围盒冒充已清除文字角落。当前未发现新的可复现合格缺陷。

## 不混用的证明

上述18例人工显式`rasterReplacement=true`，验证人工clear最后有效，**不当作整体default无pseudo的像素证明**。源main17425／17528–50、6861–88、14700–18表明default纯填色，selective部分／全星置pseudo才绘字。源精确矩阵与40个caller纯控制流oracle另见 [模式矩阵](raster-source-mode-matrix-20261014.md)；默认实际像素用例由B/root另附，不能仅靠字符串mask oracle升级。

证据：`.data/research/lawbot-2026-10-14/iteration029/manual-clear-independent.log`。无竞品许可运行，R0继续保留。完整源码／logSHA见同名JSON。
