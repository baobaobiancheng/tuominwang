# PDF.js worker 资源：有限公开链核读

`IPC-a982d6d137ce / get-pdfjs-worker-path`：无参数，主进程返回 `{type:fileUrl,fileUrl}`；renderer 兼容旧版字符串。主进程 packaged/dev 路径、unpacked 存在校验、临时缓存尺寸/mtime、复制和失败回原路径、外层抛错全部核读。没有 Squirrel 专用分支，不从安装器名称推断行为。

原 preload 是直接 invoke。两个实际调用点是 PDF `Ju2` 和项目原生文字查找 `vf2`，分别核读既有 worker 跳过、fileUrl/string、失败清空、过期任务/卸载取消和 document destroy。vf2 的全文检查与两条项目补录 caller 的失败、空结果、继续 OCR 分支均固定精确范围。

云端不向浏览器返回宿主机绝对 fileURL：PDF 页面用服务端 PDFium 生成绑定原件的图像与文字坐标；路由提取的 Node PDF.js 使用固定本地模块、关闭 worker fetch/eval。不是 Electron 连续 DOM 的逐像素移植。

10 个精确节点、全部文件/切片 SHA、边和范围见同名 JSON。该报告只补资源链范围，不把所有 PDF.js 内核、其他共享业务入口或竞品许可运行宣称完整。R0 不变；本次未运行测试、浏览器或部署。
