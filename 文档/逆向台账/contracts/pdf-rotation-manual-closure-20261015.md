# 视觉交互、旋转及人工选择验收

公开源有限范围仍 S2，竞品授权运行仍 R0。

|能力|真实证据|
|---|---|
|旋转及035/036精确重绑|3 API、独立3 API、Edge1PASS39秒|
|透明文字选取、手绘八手柄、内外搜索|Edge1PASS20秒|
|各格式同文位置、空间多行真实UTF16范围|3 API39.334秒；空归一查询反例已独立关闭|
|识别实体真实bbox编辑及PNG/PDF/Word像素导出|2 API44.34秒；A独立2 API35.732秒|
|Word两图片直达/同文定位新增保存，PNG实体8手柄保存及清除|两例Edge全部通过，runner自然exit0，总5.9分钟|
|portable geometry完整恢复|C普通三格式×四codec；B独立legacy签名桥接+3篡改反例1PASS20.572秒|

Edge5.9分钟包括浏览器进程已退出后、Edge crashpad/updater继承stderr导致的Playwright关闭延迟；未增加测试deadline或使用force-exit。诊断JSON、原失败fixture日志和sample均保留，不将耗时缩成业务操作时间。

## UI差异边界

Word图片编辑功能已由主页面内嵌资源审查区完整到达，新增资源直达选择器；分页iframe直接点击图片入口与此资源审查区排列不同。PDF页均可直达/前后跳转/搜索定位，采用分页面已核验raster与透明glyph层；未宣称与竞品continuous PDF.js renderer像素完全相同。这两项是入口及呈现差异，不再误列为无法编辑或无法到达页面。

自动反馈生产链由A/root独立验收，详见其报告。准确率边界仍见公开真实语料报告，测试不能证明黑白商业章质量已经达到实用完成。
