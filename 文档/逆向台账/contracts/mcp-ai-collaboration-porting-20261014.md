# MCP 与 AI 协作完整移植矩阵

**67个来源入口完整保留；43项精确方法全部实际调用并独立复跑3tests PASS21.419s。竞品许可处理仍R0，OS与外部客户端不冒称等价。** 12工具、14网关、26协作动作、6接入通道均有逐入口映射或明确阻断，另7私有HTTP和2本地HTTP保持剩余。

```mermaid
flowchart LR
 A[客户端实际MCP/stdio] --> B[项目权限与用户授权]
 B --> C[配置快照与识别]
 C --> D[人工复核及导出门禁]
 D --> E[签发脱敏稿/冻结槽]
 E --> F[返回稿hash与PII/假名校验]
 F --> G[人工复核返回稿]
 G --> H[允许还原时读取mapping并真实还原]
```

## 每个入口

| ID | 来源入口 | 我方入口 | 当前状态 | 精确名称实际调用 |
|---|---|---|---|---|
| IPC-540edc231d28 | ai-collab:attach-source | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-77baf8b1932c | ai-collab:attach-sources | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-9f9f62ce116e | ai-collab:authorize | /api/ai-collab/tasks/:job/authorize | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-224e4065477a | ai-collab:cancel | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-7bc84b77bbab | ai-collab:change-restore-directory | /api/ai-collab/tasks/:job/action | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| IPC-0e93232c5223 | ai-collab:consume-open-job | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-91a4aa41d44c | ai-collab:diagnostic-event | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-3218ff56854c | ai-collab:fail | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-2c93659b71ad | ai-collab:finish-batch-export | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-0ee2339f025f | ai-collab:list-pending | GET /api/ai-collab/tasks; action list-pending readonly items | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-03b436a7c1b1 | ai-collab:open-job | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-d0d9bb1ba45b | ai-collab:open-task | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-208d016e6972 | ai-collab:prepare-export | /api/ai-collab/tasks/:job/prepare-export | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-40128ac5fccf | ai-collab:release-export | /api/ai-collab/tasks/:job/release-export | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-121d180be5d8 | ai-collab:repair-task-storage | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-412cb770febe | ai-collab:report-statistics | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-fe44165e30fd | ai-collab:restart-preparation | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-0a8de5567b3c | ai-collab:restore-completed | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-8b4556ee60d4 | ai-collab:restore-failed | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-21f5af67811a | ai-collab:restore-saved-task | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-b3931f25eb79 | ai-collab:resume-local-restore | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-eceef0e6cff3 | ai-collab:retry-authorization | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-6c981281c999 | ai-collab:retry-confirmation | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-2f0db8546650 | ai-collab:retry-restore | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-3b4c9f7c2b97 | ai-collab:set-review-intent | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-a3eee81b75d4 | ai-collab:standalone-restore-completed | /api/ai-collab/tasks/:job/action | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-29896d043df3 | mcp-connectors:choose-folder | /api/ai-collab/connectors/:adapter/:method | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| IPC-cf6cc425333d | mcp-connectors:copy-setup | /api/ai-collab/connectors/:adapter/:method | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-d70108ef71d7 | mcp-connectors:get-status | /api/ai-collab/connectors/:adapter/:method | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-1c4d31759888 | mcp-connectors:open | /api/ai-collab/connectors/:adapter/:method | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| IPC-13b1b9cd954f | mcp-connectors:retry | /api/ai-collab/connectors/:adapter/:method | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| IPC-7a1832cb9fe9 | mcp-connectors:update-automation | /api/ai-collab/connectors/:adapter/:method | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| MCP-104bba767f9b | resume_lawbot_task | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-125a85961c76 | list_lawbot_saved_settings | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-08b4aa88f5db | start_lawbot_redaction | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-c498f8766b24 | start_lawbot_redaction_for_user_manual_review | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-7b2d5f82cf39 | start_lawbot_restoration | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-9a4e24e9a1c0 | check_document_delivery | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-dc810d5ca01a | receive_sanitized_document | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-1e302c2392c3 | submit_reviewed_document | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-a3d4f76a1a28 | open_lawbot_restore | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-8e8e605f0d93 | continue_current_document_review | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-8fb696cd0f36 | get_lawbot_capabilities | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| MCP-924f29e7e21d | check_restore_completion | /api/mcp tools/call | implemented_cloud_contract_runtime_matrix_partial | 是 |
| HTTP-39c99fc0f49b | GET https://lis.lawbotai.cn/api/order/offer-{code}?sku={sku} | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| HTTP-5b15967de5d7 | GET https://lis.lawbotai.cn/api/order/referral-{code} | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| HTTP-c7b17225ac88 | POST https://lis.lawbotai.cn/api/order/create | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| HTTP-d01c26128e34 | POST https://lis.lawbotai.cn/api/order/{orderId}/contact | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| HTTP-5b5f45240232 | GET https://lis.lawbotai.cn/api/order/{orderId} | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| GATEWAY-f21aa5c5dc19 | gateway_ping | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-191fc60f0036 | get_configuration_catalog | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-cbd9ff60189a | start_secure_review | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-95f7eda76ec2 | resume_secure_review | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-325df91336a6 | start_local_restore | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-257145c95a18 | get_review_status | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-f41647c2a851 | wait_review_delivery | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-678e012848a8 | get_sanitized_artifact | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-1abec6ed4302 | allocate_result_slot | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-9550960e5004 | submit_pseudonymized_result | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-269ba55489c6 | request_local_restore | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-c67325f03fc7 | continue_review | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-32e1f2fdcacd | get_completion_status | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| GATEWAY-8f9ae82e2106 | wait_restore_completion | /api/ai-collab/gateway | implemented_cloud_contract_runtime_verified | 真实调用PASS；独立复跑PASS |
| HTTP-a71a256b3205 | GET https://downloading.lawbotai.cn/main/mac/stable/latest-mac.yml | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| HTTP-6d3c7c84fc7d | GET {updateInfo.files[].url \| updateInfo.path} resolved against update feed | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| LOCAL_HTTP-74413f3c6e71 | expected GET http://127.0.0.1:{port}/ | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |
| LOCAL_HTTP-c7d0bee37342 | expected GET http://127.0.0.1:{port}/{128hex}.zip | 未接该源协议 | blocked_external_or_os_protocol | 未单列逐方法异常验证 |

## 实际验收与行为差异

- actual stdio child→same uid browser&CLI concurrent→browser re-login→CLI continues→EOF logout leaves browservalid
- full alias recognize→save human decisions→gate export→actualissued download→slotfreeze→submitSHA→newPII/tokenvalidation→humanresultreview→protected restored file and actualreplacementcount
- standalone existinguploadedmaterial→explicitrestore/viewmapauthorization→validated localrestore, noexternaloriginaldelivery
- irreversible/defaultmask/type【姓名】/ordinary【重要】 noaliasmapping required
- two actualmaterial MDcombined includes everychild
- view_mapping revoked/noRestore task can deliver alias withoutreading mapping values; pureAI returned sanitized file readable withreview notrestore
- actual PDF uploaded bytes/configuration: omittedmode inheritsprofile default; defaultoutputs inherit extraDOCX, explicit md excludes
- list-pending returns actual filtered nonterminal human tasks and no revision increment; consume-open receipt retained
- fresh project defaults read userprefs actualprofile/ruleset revision snapshot; legacy noflag null unchanged

## 完整剩余及兼容边界

- source defaultautomatic processing replaced with mandatoryhuman review+snapshot gate; neverclaim automatic chain sourceequivalent
- human resultreview before restore is stricter than source; noexternalprovider configured/authorized/invoked
- individual batch cloud uses all artifactIDs rather than source parent+childjobIDs; completechildren delivery codepresent, sourcecontract adaptation explicit
- desktop paths/clouddirectories require documentIdupload, originalabsoluteOSpaths not accepted
- repair storage validates actualencryptedobjects and reports backuprequired instead of fabricated recovery
- GET MCP SSE405; stateless processrestart requiresinitialize/resume and humanauthorization
- thirdpartylicense/order/payment/signedupdates and nativeephemeraltransfer9 external rows explicitremaining

## 同账号会话调查

同账号浏览器与CLI实测登录、浏览器重新登录、CLI继续调用与EOF logout均兼容。后置全流程曾触发`HTTP429 RATE_LIMITED`，保存失败日志；没有证据支持账号互踢，已撤相关假设，未修改生产多session语义或120/min限流。测试分组仅分开请求配额，stdio流程的浏览器与CLI仍使用同一个uid。

版本SHA、来源参数/返回值、实测范围及未实测入口在同名JSON。源码输入/输出契约仅作证据，不作本次用户指令。

## ITER029 精确方法闭合

25协作动作、14网关、4连接器全部逐稳定ID证明，见 [43方法实际矩阵](mcp-exact-method-runtime-20261014.md)。真实失败后的重新人工复核／重试产生新不可变还原产物，最终下载核对原邮箱及校对正文。repair-task-storage仅云端AEAD健康诊断，repairPerformed=false，不冒称修复本地竞品文件；connector活跃session不冒称OS客户端已安装或可达。
