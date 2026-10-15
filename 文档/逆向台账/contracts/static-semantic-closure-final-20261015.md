# 公开静态合同闭合与明确边界

经3名指定模型主审及9名子审，合并后逐ID采纳：**224项有界公开静态合同S3；34项保留S2（19原生／外部、15私有服务）**。本轮未识别出可具体命名的未读公开应用节点；这一结论限0.5.9发布包及声明的有限应用图，不能外推整个包所有库、未知版本或私有服务。竞品258项全部R0，我方实现等级本次不变。

|范围|逐ID数量|语义证据|
|---|---:|---|
|C公开合同|162|[C独立总审](team-sol-architecture-C196-independent-join-20261015.md)|
|处理接口|35|[规则35](team-sol-rules-static35-join-20261015.md)，其中2条由视觉组补齐|
|视觉与还原接口|21|[视觉21](team-sol-visual-static21-join-20261015.md)|
|UI入口|6|[根UI图](root-ui-six-semantic-join-20261015.md)，经规则／视觉主审交叉核|

## 仍有明确边界的34项

|稳定ID|名称|边界|
|---|---|---|
|IPC-243bf096202b|auth:cancel-recovery|private_service_boundary|
|IPC-3484537f3350|auth:complete-recovery|private_service_boundary|
|IPC-8f0322abb8b8|auth:create-recovery-request|private_service_boundary|
|IPC-2a09a00cba17|auth:import-recovery-file|private_service_boundary|
|IPC-34a47a0ff8e1|auth:save-recovery-request|private_service_boundary|
|IPC-d79e3892b954|license:activate|private_service_boundary|
|IPC-a70191351664|license:get-machine-id|private_service_boundary|
|IPC-0dcec6bac9d5|license:get-status|private_service_boundary|
|IPC-765d8b00f827|license:get-summary|private_service_boundary|
|IPC-527f74c7a029|license:refresh|private_service_boundary|
|IPC-1abcdf6d1a56|software-update:acknowledge-whats-new|native_or_external_runtime_boundary|
|IPC-6099fda9db85|software-update:check|native_or_external_runtime_boundary|
|IPC-1e8858b1ed43|software-update:download|native_or_external_runtime_boundary|
|IPC-4e269deca69e|software-update:get-state|native_or_external_runtime_boundary|
|IPC-67a324d00c09|software-update:restart-and-install|native_or_external_runtime_boundary|
|IPC-a73b27802b39|software-update:set-preferences|native_or_external_runtime_boundary|
|IPC-6cb1afcdadfc|software-update:state|native_or_external_runtime_boundary|
|IPC-6f5f29f520a1|task-power:get-state|native_or_external_runtime_boundary|
|IPC-cfbe72c62d81|task-power:state|native_or_external_runtime_boundary|
|IPC-ce03744a77ef|window:before-close|native_or_external_runtime_boundary|
|IPC-3a73e0100026|window:close|native_or_external_runtime_boundary|
|IPC-ed495037f8dc|window:is-maximized|native_or_external_runtime_boundary|
|IPC-e436786bb1f7|window:minimize|native_or_external_runtime_boundary|
|IPC-1e94f610b0e1|window:resolve-close|native_or_external_runtime_boundary|
|IPC-b148b8418b82|window:toggle-maximize|native_or_external_runtime_boundary|
|HTTP-39c99fc0f49b|GET https://lis.lawbotai.cn/api/order/offer-{code}?sku={sku}|private_service_boundary|
|HTTP-5b15967de5d7|GET https://lis.lawbotai.cn/api/order/referral-{code}|private_service_boundary|
|HTTP-c7b17225ac88|POST https://lis.lawbotai.cn/api/order/create|private_service_boundary|
|HTTP-d01c26128e34|POST https://lis.lawbotai.cn/api/order/{orderId}/contact|private_service_boundary|
|HTTP-5b5f45240232|GET https://lis.lawbotai.cn/api/order/{orderId}|private_service_boundary|
|HTTP-a71a256b3205|GET https://downloading.lawbotai.cn/main/mac/stable/latest-mac.yml|native_or_external_runtime_boundary|
|HTTP-6d3c7c84fc7d|GET {updateInfo.files[].url | updateInfo.path} resolved against update feed|native_or_external_runtime_boundary|
|LOCAL_HTTP-74413f3c6e71|expected GET http://127.0.0.1:{port}/|native_or_external_runtime_boundary|
|LOCAL_HTTP-c7d0bee37342|expected GET http://127.0.0.1:{port}/{128hex}.zip|native_or_external_runtime_boundary|

完整逐ID调用、异常、副作用、语义报告和叶边界在[JSON](static-semantic-closure-final-20261015.json)。源码闭合不等于竞品已运行、我方功能验收或识别准确率达标；实际API／Edge和发布继续独立核验。
