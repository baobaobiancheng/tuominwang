# 专用视觉能力最终范围核对

已逐项登记目前公开静态证据中的视觉分支，没有有意挑选遗漏。原早期“WindowsHough未获得/仅PNG-JPEG/签名shape合成100%/尚未E2E/只有黑色”记录已转为历史证据，当前以以下矩阵与专项报告为准。

| 能力 | 当前状态与边界 |
|---|---|
| 彩色HSV与8像素预筛 | ported；与已有全页连通候选合并；无彩色像素仍可执行黑白章检测 |
| 底部35%像素采样/框面积/行列6%/padding | ported；.65为算法候选分数，不是准确率 |
| darwin Hough直接返回空 | observed-platform-branch；macOS包分支没有Hough实际能力 |
| 非darwin Windows完整彩色分割/Hough支 | implemented_source_algorithm_oracle_verified；全部源参数/颜色分割/Hough/环密度/扇区/gap/NMS/碎片合并/徽记过滤；26/26合成数值oracle一致，不是商业印章真实准确率或授权桌面端运行 |
| PDF嵌图变换/中心/大小/比例 | ported-equivalent-structure；PDFium代PDF.js；有native图片、nested form、rotation fixtures |
| 裁剪色比例>=.015 | ported-with-explicit-errors；裁剪错误明确失败；未移植原版错误保留候选/空数组吞错 |
| 图片身份证/营业执照国徽或边缘过滤 | ported；保留excludedCandidates及原因供人工复核；仅图片分支应用 |
| 模型普通文件/大小/SHA元数据 | ported；官方YuNet固定commit及MIT LICENSE均固定hash |
| 中心letterbox、黑底、BGR CHW0-255 | ported；居中反变换修复；预览已是正向规范PNG |
| stride8/16/32、sqrt(cls*obj)、.6、exp框、.05padding | ported-with-validation；增加输出长度/finite明确校验，不复制缺输出跳过 |
| 同类型score降序，IoU>=.3抑制 | ported；取消200条静默截断；各类型不互抑 |
| word/media PNG/JPEG/GIF/BMP/TIFF全条目全帧 | implemented_actual_media_OCR_face_export_verified；binary signature+实际解码确认格式，GIF/TIFF逐帧atlas并逐帧OCR/face，原图字节不改；atlas预览会改变动画/多页首帧布局，不能称原版式等价 |
| signature/handwriting/handwritten_signature过滤 | source_boundary_observed；源公开处理分支过滤signature/handwriting/handwritten_signature，未观察到自动签名模型。独立shape-v1真实gold0TP/263FP已失败，已由Apache2离线模型替代；不是竞品算法等价 |
| 黑灰圆/椭圆、断章和有内文方章 | implemented-independent；闭合轮廓/空间碎片合并，未认定印章真假；钟表/图案误报 |
| 独立离线签名检测模型 | implemented_real_gold_and_actual_Edge_verified；完整35val/37test真实bbox评估仍有FP/FN，RF100家族训练重叠明示；所有候选待人工确认，不把旧合成13例100%当现实准确率 |
| 预览像素到canonical页面 | implemented；PDF2×及signature缩放test；face居中模型单图smoke |
| 候选确认/草稿/保存/导出像素清除 | implemented_actual_unit_API_and_clean_Edge_verified；彩章/黑白轮廓/新签名模型3casecleanEdge42.9s；确认前不入区域，确认后实际导出像素验证。sourceHash/revision/canonical绑定且原件不变 |
| black/white/purple/lightGray输出 | implemented_actual_pixel_verified；black/white/purple/lightGray全部；rect/circle真实像素，白色内边框；unit/真实PNG-PDF-DOCX21导出闭环见manual-clear-raster-source-porting-20261014.json |
| 椭圆、手绘实体类型/原文/id/meta完整元数据 | implemented_actual_API_and_Edge_verified；circle为bbox内切ellipse；旧缺shape保持rect；不把metadata当权限/路径/签发状态；私有字段at-rest绑定源/修订 |
| 默认遮盖和显式partial/full/custom/alias绘字分支 | implemented_source_matrix_and_actual_pixels_verified；源真实predicate meta.pseudonym&&masked；默认/overall full视觉归一化不绘；显式source bool优先，usePseudonym不是无条件绘字开关 |
| 手工清除区最后生效及Markdown真实可见内容 | implemented_actual_21exports_and_clean_Edge_verified；rect/ellipse和4style，partial/full/两derived区域重叠均测；被局部清除的派生片段保守整体不写入MD，防文字重建 |
| 空/空白/多行/特殊字符及200+自定义替换 | implemented_actual_18exports_and_clean_Edge_verified；空和不可见片段只清除；markup作为文字，XML非法控制明确拒；实际绘字空间超载仍FIT失败而非越界/截断 |
| 区域缓存提取/真实区域OCR/清缓存/完整labels与annotations | implemented_actual_API_and_Edge_verified；全部native/raw OCRmarks和glyph coords、confidence0、source/id/text/shape/meta；unknown类型不加200字符专用cap；bbox近似明确提示且不盲目覆盖canonical不连续文字 |
| OCR健康/诊断与暂停印章 | implemented_actual_worker_and_Edge_verified；真实OCR探针和模型hash；不伪造network测量；停止仅印章，诊断不输出私文/keys/宿主路径 |
| Word分页预览/VML嵌图/组变换/裁剪/翻转/旋转/文本框 | implemented_safe_offline_renderer_and_actual_Edge_verified；离线CSP sandbox，禁外联/active OLE/altChunk/script；source/hash/revision/view_original；原桌面renderer/未提供字体不可保证Word逐像素分页一致 |

## 真实准确率与授权边界

签名完整35val在IoU0.5为TP28/FP27/FN7；RF100完整37test为TP45/FP28/FN9，训练家族重叠明示，不声称未知语料泛化。AOSSig/tech4humans授权或联系共享门未绕过，Tobacco800原图许可未取得。黑白章DKDS公开访问故障与历史日文印章任务差异保留，没有真实商业黑白章gold就不报告虚假的100%。

没有授权运行竞品桌面整链；Windows26例数值oracle和自有真实流程通过均不能代替该许可运行。OCR后端、Word字体与精确分页仍按专项报告明示差异。Face完整语料以C最终报告为准。

Face已完成OpenImages真实5749全量：原字节5748推理、1张超现有像素门且为已核负样本，未冒记TN；声明的1024长边变体全部5749成功。IoU0.5 TP4149/FP1321/FN1292，F1约76.05%。逐图GT、预测、hash、署名与组框独立计数见 public-face-validation-20261014.json及评估目录，不把公开照片任务当中文合同准确率。
