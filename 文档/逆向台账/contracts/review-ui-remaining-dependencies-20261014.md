# review-ui-remaining-dependencies

独立只读人工重点范围；不执行竞品。全部证据hash校验不等于全量语义重审。

目标 SHA256：f01948ad9c0091c8fd6eeea85d2f8414dc47d821029fc53c2e8f9060d36066c7；全部 54 证据hash；人工 13 范围；S2/R0。

- Nu2缺源/Markdown sidecar返回null、按四格式组装；Jc2批量正式保存计数门成立，不能外推到Zu2关闭分支。Zu2 !Ou2()可以直接true，报告保留了此边界。
- W2受Markdown/无表/trim后空查询/长度阈值限制。非空白查询关闭虚拟化，St2 DOM缺失直接return；不是所有搜索都局限窗口，也不是自动成功定位。
- rp2 Blob经FileReader变DataURL无需revokeObjectURL；PDFWorker跨origin blob wrapper另有生命周期，destroy不调用revoke。组件卸载有render代际/cancel/cleanup但异步销毁并非资源全已回收证明。
- Ji2未知页面尺寸只凭Xi2返回true，Xi2接受Infinity；已知尺寸额外finite约束，报告没有误写为全部有效框必有限数。
- Es2 3秒race及finally清timer不取消getPage；晚返回不会继续本函数viewport步骤但底层工作可继续。
- vf2逐页Array.from码点框，却用UTF16 indexOf/slice，非BMP偏移条件成立；加载promise在try前，reject不进document destroy finally。
- AppWindowControls只await prepare-close不看false、save后不重查isDirty已核实；这与review退出门不同，可能放行的时序仍R0。
- 所审重点结论成立；其余序列化子归一、格式导出消费、DOCX大DOM、PDF全渲染仍保留remaining，没有53范围全二审声明。

## 发现

- {'id': 'RUI01', 'priority': 'P3', 'status': 'fixed', 'detail': 'UIR06非空搜索应限定trim后非空，纯空白查询不关闭虚拟化；作者已修trim措辞，重新回读通过。'}

## 人工范围

- .data/research/lawbot-2026-10-13/readable/renderer.js:3945–4024
- .data/research/lawbot-2026-10-13/readable/renderer.js:32555–32609
- .data/research/lawbot-2026-10-13/readable/renderer.js:32909–32919
- .data/research/lawbot-2026-10-13/readable/renderer.js:32744–32766
- .data/research/lawbot-2026-10-13/readable/renderer.js:6142–6169
- .data/research/lawbot-2026-10-13/readable/renderer.js:6333–6356
- .data/research/lawbot-2026-10-13/readable/renderer.js:33691–33699
- .data/research/lawbot-2026-10-13/readable/renderer.js:17534–17545
- .data/research/lawbot-2026-10-13/readable/renderer.js:17569–17618
- .data/research/lawbot-2026-10-13/readable/renderer.js:25973–25995
- .data/research/lawbot-2026-10-13/readable/renderer.js:23396–23438
- .data/research/lawbot-2026-10-13/readable/renderer.js:23688–23724
- .data/research/lawbot-2026-10-13/readable/renderer.js:34679–34743
