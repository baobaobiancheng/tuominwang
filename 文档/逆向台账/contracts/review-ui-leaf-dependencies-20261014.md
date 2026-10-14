# review-ui-leaf-dependencies

独立只读人工重点范围；不执行竞品。全部证据hash校验不等于全量语义重审。

目标 SHA256：b1ac0bd5795c2c95c8b4224cabee6340d0e4f57bde84774abce01aded53bcb33；全部 14 证据hash；人工 10 范围；S2/R0。

- UL01取源缓存优先/30秒await、pC页边阈值/不走fC、af2宽高不验证finite、合框首页码/非IoU均已读。
- UL02 WU固定字段、sourceChain.map(String)、未约束offset、qU固定score1均成立；UU/HU尺寸有限但可为0，不能与af2规则混同。
- UL03 oV普通非人工非deleted实体回pending，即使原confirmed；lV恢复***、confidence1、offset0/0属于恢复默认值，不是原识别真值。
- UL04 bV的exact与可允许Markdown符号gap、wV非有限confidence未拒绝、xV按hash/length复用sidecar成立；本节未验证第三方parser的所有sourceMap生产。
- UL05 xl2/kl2逐命中+1保留重叠，nv前进query.length非重叠；qf全query spread而source分块的差异成立。
- nv/Xf的UTF16 offset实际经caller34830–34843进入uf2码点映射，非BMP条件索引差异有具体调用支持。
- 所有14证据hash校验；人工10个集中范围，未把oc/dv/hv/mv/Vp全部另行二审。

## 发现

- {'id': 'RUL01', 'priority': 'P3', 'status': 'fixed', 'detail': 'lf2数列条件length>=4，作者已修至少4项取前4项并回读。'}

## 人工范围

- .data/research/lawbot-2026-10-13/readable/renderer.js:22259–22275
- .data/research/lawbot-2026-10-13/readable/renderer.js:34071–34096
- .data/research/lawbot-2026-10-13/readable/renderer.js:34593–34654
- .data/research/lawbot-2026-10-13/readable/renderer.js:30448–30500
- .data/research/lawbot-2026-10-13/readable/renderer.js:30561–30617
- .data/research/lawbot-2026-10-13/readable/renderer.js:30625–30704
- .data/research/lawbot-2026-10-13/readable/renderer.js:5867–5892
- .data/research/lawbot-2026-10-13/readable/renderer.js:5961–5972
- .data/research/lawbot-2026-10-13/readable/renderer.js:9352–9386
- .data/research/lawbot-2026-10-13/readable/renderer.js:34830–34843
