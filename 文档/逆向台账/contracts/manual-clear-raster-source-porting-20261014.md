# 图像清除区与派生文字绘制闭环

## 修正与来源

| 项目 | 当前行为 |
|---|---|
| 默认图片/PDF/Word 内嵌图片 | 只清除选中字形像素；不因存在 masked 字符串就重绘 |
| 显式混合/假名替换 | 按可信 rasterReplacement/source meta.pseudonym 决定绘字 |
| 手工矩形/椭圆清除区 | 在所有文字合成后最后清除，区外保持预期像素 |
| Markdown | 已被清除区遮挡的派生片段不重建为完整文字；椭圆空角按真实形状判断 |

## 实际验收

| 流程 | 结果 |
|---|---|
| tests/manual-clear-override.test.ts + visual-replacement + circle + reference-portable-draft | 4 files / 14 tests PASS17.12s |
| tests/manual-clear-override.integration.ts | 1test /21 real exports PASS86.17s |
| independent A adversarial rerun | 18 explicit-mode exports PASS86.44s, no qualified findings |
| tests/e2e/image-batch-search.spec.ts | clean Edge1PASS16.6s |
| tests/e2e/visual-detection.spec.ts | clean Edge3PASS42.9s |
| tests/e2e/page-redaction.spec.ts | clean Edge2PASS39.5s |

实际 API 共 21 个导出：PNG/PDF/DOCX 的部分替换、全星替换分别比较无区基准、矩形、椭圆；另验三种格式默认方案的实际纯像素清除。所有原件保持不变。

浏览器下载图已打开检查，原先清除区内重新出现的 138****8000 已消失。截图、逐项断言、代码与自制 fixture SHA256 见同名 JSON。

原 Playwright worker 的 native sharp 导入导致完成后的退出卡顿，现改为静态自制素材、浏览器 canvas 和独立普通 Node PDFium 验真。最后三组 Edge 均自动结束和清理，无 force-exit。

限制：没有授权运行竞品处理链；真实签名模型仍有 FP/FN，不以合成材料通过冒充真实准确率完成。
