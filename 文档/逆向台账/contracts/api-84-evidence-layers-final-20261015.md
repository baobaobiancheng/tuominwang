# 84 个 API 文件证据分层汇总

生成于 2026-10-15T09:55:16.413626+00:00；只读扫描现有记录，不运行测试。

- 当前清单：84 文件。V2 当前字节有完整单文件 pin 与成功日志：39；仅有 V0/V1 历史成功：45；无成功记录：0。
- V2 范围：39 distinct V2 files and 83 tests passed across four sequential segments, not one full-suite command。**没有单次全 84 文件成功的证据**。
- `rows` 对每个当前文件列出最新成功记录、实际 variant、测试 SHA、日志 SHA、运行前 pin 等级、旧失败与进行中记录。
- 其余 45 项只保留各自 V0/V1 历史成功证据；旧结果不能升级称为 V2。
- 目标拆分日志没有运行前密码学 test SHA，保留弱证据等级；失败 aggregate 与旧失败命令继续保留。

## 逐文件分层

| 文件 | 最新成功 variant | 当前 V2 pin | 测试 SHA 是否当前 | 日志 SHA | 边界 |
|---|---|---:|---:|---|---|
| `tests/integration.ts` | V0 | 否 | 是 | `cad51ef27c7c` | successful prefix of aggregate command that later exited 1; prefix file SHA with modifiedBeforeRun; not a per-file pre-run hash |
| `tests/access.integration.ts` | V2 | 是 | 是 | `952d452c44b1` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/automatic-runtime-rules.integration.ts` | V2 | 是 | 是 | `97a3b9946b67` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/automatic-runtime-terminal.integration.ts` | V2 | 是 | 是 | `98281413a062` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/automatic-runtime-worker.integration.ts` | V2 | 是 | 是 | `b0b56e084b07` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/circle-redaction.integration.ts` | V0 | 否 | 是 | `cad51ef27c7c` | successful prefix of aggregate command that later exited 1; prefix file SHA with modifiedBeforeRun; not a per-file pre-run hash |
| `tests/contextual-recognition.integration.ts` | V0 | 否 | 是 | `cad51ef27c7c` | successful prefix of aggregate command that later exited 1; prefix file SHA with modifiedBeforeRun; not a per-file pre-run hash |
| `tests/custom-replacement.integration.ts` | V0 | 否 | 是 | `cad51ef27c7c` | successful prefix of aggregate command that later exited 1; prefix file SHA with modifiedBeforeRun; not a per-file pre-run hash |
| `tests/custom-visual.integration.ts` | V0 | 否 | 否 | `ee2e364fe6f3` | targeted isolated log; no cryptographic test SHA captured before run |
| `tests/default-profile.integration.ts` | V0 | 否 | 是 | `2de119c6db0a` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/document-unlock.integration.ts` | V0 | 否 | 是 | `f1d8632cb00d` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/docx-preview.integration.ts` | V0 | 否 | 是 | `d828a61a706f` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/entity-corrections-review.integration.ts` | V2 | 是 | 是 | `bd4712a1102f` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/entity-corrections.integration.ts` | V2 | 是 | 是 | `c7f82e6ccca7` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/entity-geometry.integration.ts` | V0 | 否 | 是 | `db0a63987c35` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/entity-identity.integration.ts` | V0 | 否 | 是 | `618e5dc23c8a` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/feedback-raw-type.integration.ts` | V0 | 否 | 是 | `b2573d2f9224` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/feedback.integration.ts` | V0 | 否 | 是 | `280f0b4be45c` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/files.integration.ts` | V0 | 否 | 是 | `fe2f77cb278e` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/heavy-slot-connect.integration.ts` | V1 | 否 | 否 | `6463bcdae2af` | targeted isolated log; no cryptographic test SHA captured before run |
| `tests/hidden-entity-corrections.integration.ts` | V2 | 是 | 是 | `ab3103cd3932` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/image-batch-search.integration.ts` | V0 | 否 | 是 | `146c102ff6a2` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/image-utilities.integration.ts` | V0 | 否 | 是 | `46b8dff97b4d` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/jobs.integration.ts` | V0 | 否 | 是 | `8e9301e74d35` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/legacy-office.integration.ts` | V0 | 否 | 是 | `b222329c65c3` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/legacy-portable-integrity.integration.ts` | V0 | 否 | 是 | `62fc2be00030` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/lifecycle.integration.ts` | V0 | 否 | 是 | `7d0e86bbc0c0` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/manual-clear-override.integration.ts` | V0 | 否 | 否 | `df420892a3c2` | targeted isolated log; no cryptographic test SHA captured before run; 有失败旧记录 |
| `tests/manual-occurrences-review.integration.ts` | V0 | 否 | 是 | `d859b20a3de3` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/manual-occurrences.integration.ts` | V0 | 否 | 是 | `9e3491cb1256` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/mapping-capacity.integration.ts` | V0 | 否 | 是 | `2acb3a30d766` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/mappings.integration.ts` | V0 | 否 | 是 | `a96f8788bb05` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/markdown-manual-draft.integration.ts` | V0 | 否 | 是 | `d9afd575c628` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/mcp-complete-matrix.integration.ts` | V0 | 否 | 是 | `f3653768cb45` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/mcp.integration.ts` | V0 | 否 | 是 | `edda5b606789` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/ner.integration.ts` | V0 | 否 | 是 | `d619461b0ce4` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/ocr.integration.ts` | V0 | 否 | 是 | `e86b737db9dc` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/office-media.integration.ts` | V0 | 否 | 是 | `b1f390eeb322` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/page-review-storage.integration.ts` | V0 | 否 | 是 | `6e3b6e0396d9` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/page-rotation.integration.ts` | V1 | 否 | 否 | `b1ddd833c86e` | targeted isolated log; no cryptographic test SHA captured before run; 有失败旧记录 |
| `tests/pages.integration.ts` | V1 | 否 | 是 | `112fb62b589a` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/personal-settings-interface-closure.integration.ts` | V1 | 否 | 是 | `d490ef047b27` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/platform-interface-closure.integration.ts` | V1 | 否 | 是 | `25f61c51d57f` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/portable-draft-source-integrity.integration.ts` | V1 | 否 | 是 | `70c0cc78c990` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/portable-entity-geometry.integration.ts` | V1 | 否 | 否 | `400f5ab89a18` | targeted isolated log; no cryptographic test SHA captured before run; 有失败旧记录 |
| `tests/portable-legacy-geometry.integration.ts` | V1 | 否 | 是 | `14a33cec08fc` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/portable-type-hide.integration.ts` | V1 | 否 | 是 | `8a71c32354b5` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/portable-unlocked.integration.ts` | V1 | 否 | 是 | `b989b0e08843` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/portable.integration.ts` | V1 | 否 | 是 | `9b783c9821ce` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/presets.integration.ts` | V1 | 否 | 是 | `9ea12a934cb9` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/processing-observability.integration.ts` | V1 | 否 | 是 | `01f5636a35f5` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/processing-resources.integration.ts` | V1 | 否 | 是 | `916f94fa6413` | sequential isolated single-file API run; manifest testSha256 recorded before and checked after run |
| `tests/project-audit-geometry.integration.ts` | V2 | 是 | 是 | `8d31f853a55c` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/project-search.integration.ts` | V2 | 是 | 是 | `31c03244912d` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run; 有失败旧记录 |
| `tests/recognition.integration.ts` | V2 | 是 | 是 | `0d366a34a288` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/reference-markdown-ner.integration.ts` | V2 | 是 | 是 | `4a0c41670599` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/reference-markdown.integration.ts` | V2 | 是 | 是 | `b9bec0373eb6` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/release-state.integration.ts` | V2 | 是 | 是 | `e8190f4ec43f` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/replacement-policies.integration.ts` | V2 | 是 | 是 | `8695a912880c` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/resources.integration.ts` | V2 | 是 | 是 | `299daf7182a4` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/restoration-batch.integration.ts` | V2 | 是 | 是 | `e7fb7d25c374` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/review-entity-slots.integration.ts` | V2 | 是 | 是 | `ed507986cf5d` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/review-feedback-birth.integration.ts` | V2 | 是 | 是 | `6b564b249e23` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/review-feedback.integration.ts` | V2 | 是 | 是 | `637f08981901` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/review-mark-filter.integration.ts` | V2 | 是 | 是 | `08eee407cc9b` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/review-provenance-history.integration.ts` | V2 | 是 | 是 | `934cd39b971a` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/review-provenance.integration.ts` | V2 | 是 | 是 | `baf59ab2adc8` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/review-type-hide.integration.ts` | V2 | 是 | 是 | `6cdbbc904f8c` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/rule-adversarial-review.integration.ts` | V2 | 是 | 是 | `4edb0e5a45d5` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/rule-interface-closure.integration.ts` | V2 | 是 | 是 | `6641f065df16` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/ruleset-capacity.integration.ts` | V2 | 是 | 是 | `763d5bf7b620` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/ruleset-entry-extension.integration.ts` | V2 | 是 | 是 | `c4b0609b45ee` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/ruleset-normalization.integration.ts` | V2 | 是 | 是 | `44476b201649` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/support.integration.ts` | V2 | 是 | 是 | `1306b12e993f` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/type-hide-geometry.integration.ts` | V2 | 是 | 是 | `131689c293fd` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/unified-aliases.integration.ts` | V2 | 是 | 是 | `ffbd01752bc4` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/unified-export-preflight.integration.ts` | V2 | 是 | 是 | `b69ec873d981` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/visual-interface-closure.integration.ts` | V2 | 是 | 是 | `45bd97d636aa` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/workspace-alias-history.integration.ts` | V2 | 是 | 是 | `87f565c68963` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/workspace-compat.integration.ts` | V2 | 是 | 是 | `f5c5056a15a8` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/workspace-recovery-network.integration.ts` | V2 | 是 | 是 | `c0c3d3e54949` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/workspace-renderer.integration.ts` | V2 | 是 | 是 | `bbbdfc554c73` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/workspace-save-normalized-integrity.integration.ts` | V2 | 是 | 是 | `518c9c02feb1` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |
| `tests/workspace-save-receipts.integration.ts` | V2 | 是 | 是 | `c12ba5db8aa7` | four final sequential segments; 39 files, 83 tests; test SHA captured before and after each run |

## 复核边界

- 产品 freeze 是运行 variant 的清单 hash；测试 SHA 和日志 SHA 分别核验。
- 039 第 19 个旧 fixture、workspace coverage 与 MRU 旧期望失败均保留。当前切片只汇总修正后通过的四段。
- 该分层报告不能替代最终发布、线上 readback 或 Edge 结果。
