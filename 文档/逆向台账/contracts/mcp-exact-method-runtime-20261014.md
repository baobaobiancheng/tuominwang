# 43项协作协议逐方法实际验收 · 迭代029

3项隔离工作流测试通过18.82秒；25 AI协作＋14 gateway＋4连接器，**43独立ID，缺失0**。每方法均实际调用成功并检验真实状态、持久化结果或真实产物，不用注册／HTTP 200／错误拒绝代替功能。

|稳定ID|精确方法|实际验证|
|---|---|---|
|IPC-9f9f62ce116e|ai-collab:authorize|real authorization creates source-selection task|
|IPC-540edc231d28|ai-collab:attach-source|one uploaded document bound and queued|
|IPC-77baf8b1932c|ai-collab:attach-sources|second uploaded document bound and queued|
|IPC-03b436a7c1b1|ai-collab:open-job|openRequested flag persists true|
|IPC-d0d9bb1ba45b|ai-collab:open-task|openRequested flag persists true|
|IPC-21f5af67811a|ai-collab:restore-saved-task|openRequested flag persists true|
|IPC-0e93232c5223|ai-collab:consume-open-job|consumes real open flag and returns bound material IDs|
|IPC-91a4aa41d44c|ai-collab:diagnostic-event|fixed category diagnostic event persisted|
|IPC-412cb770febe|ai-collab:report-statistics|integer statistic persisted|
|IPC-0ee2339f025f|ai-collab:list-pending|read-only current owner pending list returns real task|
|IPC-121d180be5d8|ai-collab:repair-task-storage|AEAD storage checked, truthful repairPerformed=false when all healthy|
|IPC-208d016e6972|ai-collab:prepare-export|queues real verified material export jobs|
|IPC-2c93659b71ad|ai-collab:finish-batch-export|publishes both successful verified batch material artifacts|
|IPC-40128ac5fccf|ai-collab:release-export|release one real hash-verified document artifact|
|IPC-3218ff56854c|ai-collab:fail|explicit failure code and failed state persist|
|IPC-fe44165e30fd|ai-collab:restart-preparation|clears failure/deliveries and returns human review|
|IPC-eceef0e6cff3|ai-collab:retry-authorization|failed task returns to fresh authorization|
|IPC-224e4065477a|ai-collab:cancel|task cancellation persists terminal state|
|GATEWAY-f21aa5c5dc19|gateway_ping|initialized dsh protocol session reaches real database|
|GATEWAY-191fc60f0036|get_configuration_catalog|returns saved profile catalogue|
|GATEWAY-cbd9ff60189a|start_secure_review|creates persisted source-bound secure review task|
|IPC-3b4c9f7c2b97|ai-collab:set-review-intent|structured review intent persists|
|GATEWAY-257145c95a18|get_review_status|read-only ready status|
|GATEWAY-f41647c2a851|wait_review_delivery|ready delivery wait returns without fake artifact|
|GATEWAY-678e012848a8|get_sanitized_artifact|reads real approved bytes without allocating round|
|GATEWAY-1abec6ed4302|allocate_result_slot|allocates real return round/slot without source bytes|
|GATEWAY-9550960e5004|submit_pseudonymized_result|validates real returned slot hash and pseudonym tokens|
|GATEWAY-269ba55489c6|request_local_restore|opens restore review for existing validated round|
|IPC-8b4556ee60d4|ai-collab:restore-failed|reports actual server hash-failure state, not a client fabricated failure|
|IPC-6c981281c999|ai-collab:retry-confirmation|clears prior human approval after actual failure|
|IPC-b3931f25eb79|ai-collab:resume-local-restore|actual restored output after corrected hash and new human review|
|IPC-0a8de5567b3c|ai-collab:restore-completed|server verifies actual completed artifact instead of trusting client counts|
|IPC-2f0db8546650|ai-collab:retry-restore|creates another actual immutable restored artifact via retry|
|GATEWAY-32e1f2fdcacd|get_completion_status|returns real artifact completion counters|
|GATEWAY-8f9ae82e2106|wait_restore_completion|terminal wait observes actual restored round|
|GATEWAY-c67325f03fc7|continue_review|same persisted task returns to sanitized artifact review|
|GATEWAY-95f7eda76ec2|resume_secure_review|resume requires a fresh explicit session authorization|
|GATEWAY-325df91336a6|start_local_restore|starts standalone restoration of actual sanitized material|
|IPC-a3eee81b75d4|ai-collab:standalone-restore-completed|confirms real standalone artifact with zero residual tokens|
|IPC-cf6cc425333d|mcp-connectors:copy-setup|actual initialized session/configuration, no claim OS client installation or reachability|
|IPC-d70108ef71d7|mcp-connectors:get-status|actual initialized session/configuration, no claim OS client installation or reachability|
|IPC-13b1b9cd954f|mcp-connectors:retry|actual initialized session/configuration, no claim OS client installation or reachability|
|IPC-7a1832cb9fe9|mcp-connectors:update-automation|actual initialized session/configuration, no claim OS client installation or reachability|

## 不冒称的范围

源绝对路径转为授权已上传document ID。连接器只验证真实会话与可用配置，外部桌面安装／连接性仍not_verified。repair-task-storage实际核验健康AEAD存储并如实返回repairPerformed=false，不能冒称完成竞品磁盘修复。故障fixture仅在隔离合成task修改SHA，真实还原路径检测失败后需重新人工复核，retry和resume各生成不可变实际产物，最后下载确认原值＋新增校对文字正确。

完整请求参数字段、响应结构指纹与每ID证据见同名JSON，日志iteration029/mcp-exact-method-runtime.log。正版竞品运行保持R0；逐ID集成等级由总台账按源合同分别判定，不整家族升级。
