# Renderer policy 独立对抗审查

结论：No open findings。2项P3已修并回读；另补原始org_name门限定。保持S2/R0。
全部37证据hash、5组有序词表及2组扩展集合独立验证；人工重点24个可重叠范围。此计数不表示全链或全运行证明。

## 重点结论

- 图片A2规范全角括号，而单份w4只删空白；b4任一映射即可禁止非selective的jr补配，未命中保持星号且无pseudonym。main有效bbox门通过后，部分假名场景仅标志项绘token；无标志场景普通遮盖。静态条件成立，不是运行复现。
- zc按原始canonicalKey核token一致，不阻止不同canonical共用token；jc一跳查找/规范后覆盖，与Mm按token聚合多原文结论成立。
- main jr全称信任门只接原始org_name，需元数据可信来源、长度/后缀及Br；renderer of/UK没有等价信任条件，cc与vr、HK与Pr亦存在明确差异。
- YK文件override空值可保留；全局custom在getTokenForFile以||回退，与build使用??不同。导入/快照未局部强制findTokenConflict，报告保留上游验证缺口。
- Ad第二参数未参与逻辑且返回unresolved=[]，Mm的组合冲突校验不能外推所有token全局一对一；mf补偿并非保证成功。
- 词表5组完整有序相同，扩展表数量和新增集合独立重提取一致；wd/Nt可见分支对应与两个手推例子成立，qp先cc使调用链不等价。

## 已修发现

- RRP01 [P3] Pr依类型分派的范围原止3003，未含3010–3032；已延至3036并回读。
- RRP02 [P3] 缺原文失败条件原概括为单项；已精确为同token聚合后仍无映射才失败，单个空原文先跳过。

## 审查边界

- 未重审全部导出IPC序列、取消/回滚、preload授权及所有消费者；报告相关其他范围只核hash，不据此证明完整契约。
- 未执行产品、未绕激活、无运行复现或跨格式LPM互通验收。
- 上游schema与findTokenConflict所有调用、完整下游writer和恢复定位仍按作者remaining保留。

## 目标快照

- 文档/逆向台账/contracts/renderer-policy-dependencies-20261014.json：`e6fc594ba87768708578f7e985fa829f104a0fb7cc35e9ed1821b5083dea1613`
- 文档/逆向台账/contracts/renderer-policy-dependencies-20261014.md：`4f3c92a12f15f5cfae7d3b142c0b234f078a3a0820a6106420d907168f71a6ce`
- 文档/逆向台账/contracts/build-renderer-policy-dependencies-20261014.py：`8222c663eb2646c17fe286817a5b083b7c63ae1938db956556c7443dda74ddd7`

## 人工重点范围

- .data/research/lawbot-2026-10-13/readable/renderer.js:4204–4207
- .data/research/lawbot-2026-10-13/readable/renderer.js:4404–4482
- .data/research/lawbot-2026-10-13/readable/renderer.js:5476–5534
- .data/research/lawbot-2026-10-13/readable/renderer.js:29836–29948
- .data/research/lawbot-2026-10-13/readable/renderer.js:30018–30172
- .data/research/lawbot-2026-10-13/readable/renderer.js:6973–7051
- .data/research/lawbot-2026-10-13/readable/renderer.js:24542–24589
- .data/research/lawbot-2026-10-13/readable/renderer.js:26190–26220
- .data/research/lawbot-2026-10-13/readable/renderer.js:37370–37391
- .data/research/lawbot-2026-10-13/readable/renderer.js:4792–4867
- .data/research/lawbot-2026-10-13/readable/renderer.js:5314–5329
- .data/research/lawbot-2026-10-13/readable/main.js:2922–2958
- .data/research/lawbot-2026-10-13/readable/main.js:2978–3036
- .data/research/lawbot-2026-10-13/readable/main.js:3045–3105
- .data/research/lawbot-2026-10-13/readable/main.js:3123–3192
- .data/research/lawbot-2026-10-13/readable/main.js:17505–17553
- .data/research/lawbot-2026-10-13/readable/main.js:17634–17686
- .data/research/lawbot-2026-10-13/readable/main.js:6861–6885
- .data/research/lawbot-2026-10-13/readable/main.js:14159–14228
- .data/research/lawbot-2026-10-13/readable/main.js:16523–16631
- .data/research/lawbot-2026-10-13/readable/main.js:1224–1298
- .data/research/lawbot-2026-10-13/readable/main.js:2242–2285
- .data/research/lawbot-2026-10-13/readable/main.js:15147–15263
- .data/research/lawbot-2026-10-13/readable/main.js:15675–15678
