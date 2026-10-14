# Windows 红蓝印章分支对抗审查

[P2] 保留自动识别的部分失败诊断 — packages/adapters/processing-worker.ts:188

自动页识别直接取得 `canonicalVisualResult(...).candidates`，新检测器的 `warnings/complete` 未进入持久化识别结果。颜色分割失败但Hough仍给出候选时，手动API会显示部分完成，自动初检却丢失该诊断。已交父代理修正共享接线。

两项已复证关闭：

- Mat提前分配未清理：独立真实WASM故障注入修前allocated2/live2，修后allocated2/live0。
- 源色分割失败继续Hough的分支遗漏：修后独立注入 `morphologyEx` 失败，真实Hough仍给出候选并返回 `COLOR_SEGMENTATION_FAILED`，手动聚合不静默冒称完整成功。

已逐支核对官方Windows静态脚本的HSV阈值、闭运算/膨胀/连通域、尺寸/填充/中心/环带门、Hough输入与原图坐标、round-even、红蓝颜色比、扇区密度/最大缺口、大圆双门、NMS/碎片合并及实心徽记过滤，未发现额外数学偏差。离线官方OpenCV4.10.0文件hash固定，未将竞品Python脚本重新发布。

独立定向4文件18测试通过，其中真实WASM印章6项。作者26组源码纯函数Python与WASM对照证据已检查，未在本审查另跑其Python程序。竞品授权完整运行仍R0；真实文档准确率不由合成oracle替代。

## 最新接线复核

AUTO-VISUAL-WARNING-PERSISTENCE 已关闭：根 worker 逐页保留 warnings/detectors 并计算 recognition.visual.complete，发布保存完整 recognition，API 暴露 visualDiagnostics，界面显示部分未完成。此处为独立完整源码链复核，未冒称新增真实材料准确率评估；原 detector 故障注入证据仍有效。最新文件指纹见 JSON。
