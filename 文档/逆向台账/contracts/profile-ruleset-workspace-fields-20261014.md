# 模板、规则库与沿用审查：字段和行为全量清单

竞品mac0.5.9静态S2/R0。字段schema支持不等于当前版本实际开启。

## 脱敏模板字段

| 字段 | 约束/实际行为 |
|---|---|
| id/name/description/createdAt/updatedAt | string |
| schemaVersion | 1 |
| source | system | user; system 必须 readonly |
| readonly | boolean |
| enabledEntityTypeIds | 非空去重，19默认类别 + schema允许signature；当前读写TI会删除signature |
| certNoPreferenceRecorded | 可选boolean；迁移case_number带上cert_no，保存true |
| pseudonymTypeActions | entityType -> mask | pseudonym | partial_star | full_star |
| pseudonymTemplate.kind | schema standard | party_slots；当前PI强制standard |
| pseudonymTemplate.slots | party_slots>=2；id/label非空，id唯一；当前废弃 |
| docx.defaultMode / markdown.defaultMode | default_star | full_star | default_pseudonym | custom_pseudonym | selective_pseudonym；旧default_pseudonym迁为custom_pseudonym |
| docx.removeHeaderFooter/removeImages/exportMarkdown | boolean |
| docx.commentHandlingMode | remove | anonymize | keep |
| pdf.defaultMode / image.defaultMode | default_star | default_pseudonym | custom_pseudonym | selective_pseudonym；没有full_star |
| pdf.maskStyle / image.maskStyle | black | white | purple | lightGray |
| pdf.exportPdfAsDocx/exportMarkdown；image.exportMarkdown | boolean |
| batch.docxDefaultMode/markdownDefaultMode | 同文字mode；缺markdown迁default_star |
| batch.pdfDefaultMode/imageDefaultMode | 同视觉mode |
| batch.exportMarkdownByKind | docx/pdf/image -> boolean |
| batch.pseudonymTableNameTemplates | singleDocument/unifiedBatch/independentBatch非空string |
| preferences | schemaVersion1/defaultProfileId/lastSuccessfulExportByKind/updatedAt |

## 规则库/工作区字段

| 字段 | 约束/实际行为 |
|---|---|
| ruleSet | id/schemaVersion1/name/description/source(system,user,migrated)/readonly/applicability/createdAt/updatedAt/entries |
| applicability | schema支持 all/materialTypes(7 routes)，validate保存强制all+[] |
| ruleEntry | id/pattern/normalizedPattern/entityType/kind/matchMode/enabled/source/createdAt/updatedAt/originWorkspaceId? |
| kind | forceDetect / forceSkip（旧dictionary whitelist在迁移是forceDetect；UI“黑名单”也是forceDetect） |
| matchMode | schema exact/contains，validate与迁移强制exact |
| source | manual/reviewSuggestion/promotedFromWorkspace/excelImport/migration |
| stored/index | {ruleSet,revision>=1}; index schemaVersion1/migrationVersion/activeRuleSetId/ids |
| correction | id/kind/pattern/normalizedPattern/entityType/matchMode/sourceDecisionIds/enabled/risk/createdAt/updatedAt/origin/sourceWorkspaceId? |
| inheritedPseudonymProfile | schemaVersion1/entries(key,token,canonicalKey)/reservedTokens?；entries<=100000/reserved<=200000，keys唯一 |

## 模板CRUD与偏好

1. list返回摘要items+preferences；system放在user前；读取用户项会迁移并写回
2. get返回深拷贝；隐藏system或不在userIds则PROFILE_NOT_FOUND
3. create(name,description?,baseProfileId?,profile?)：名称trim+不区分大小写唯一，继承默认或指定base；强制id/user/readonly=false/时间/schema
4. update(profile)：仅user；没有revision参数，不具CAS；保留createdAt、更新updatedAt
5. duplicate(id,name?)：默认“副本”；同名追加2、3…，再create
6. delete(id)：系统默认不可删除；其它system逻辑隐藏；user删除items、更新index，若默认则退系统默认
7. setDefault(id)：必须存在；写preferences；recordSuccessfulExport(kind,state)要求state.kind相同
8. initialize：错误index退空/坏user记录丢出index/default无效退默认；profile原子文件写rename失败会先rm旧文件再rename，不承诺全局事务

## 规则库全部行为

1. normalizePattern=trim+全部空白压一个空格；key=entityType+NUL+normalizedPattern+NUL+exact；同kind重复DUPLICATE，异kindCONFLICT
2. create为空entries、revision1，名称zh-CN小写去边空唯一；description清空/applicability all/exact
3. update要求revision一致，readonly拒绝；保留id/source/createdAt，revision+1
4. delete readonly拒绝，active删除退null；setActive(null)允许，system_empty拒绝
5. list隐藏system_empty；非readonly优先，updatedAt降序；返回enabledDetect/Skip/totalCount/revision/activeId
6. Excel import仅sheet1；A内容B类型C黑白D状态，旧D匹配列则E状态；返回cleanEntries/conflicts/errors，不持久化；文件内冲突/重复为errors
7. Excel export两sheet名单/信息、四列、inlineStr；template三列示例及B/C下拉；取消返回success/null
8. previewPromotion(corrections)只返回accepted/duplicates/conflicts，不持久化，也不把同轮新增项加入查重map
9. legacy migration完整backup+conflicts；旧whitelist->forceDetect/blacklist->forceSkip，同键保Skip；migrationVersion1，默认不启用
10. initialize normalizeStored逐表范围all/exact，冲突保Skip，revision+1；单表异常吞掉；create/delete/index跨文件无事务，需要我方安全适配

## 工作区沿用规则与假名

1. selectReviewProfile只选择.tmm；readReviewProfile在授权解锁后抽取继承对象，不直接覆盖工程
2. 先收集继承 reserved tokens 和key->canonicalKey；project mergedInto及每材料pseudonymEntries canonicalKey参与合并
3. 当前文档同canonical组首出现清旧继承同组；selective仅action=pseudonym纳入；locked取currentValue，default取autoValue，其余current||auto
4. 项目sharedMapping仅补未被当前材料覆盖的组；同canonical多值生成multiple-values choices，不能默默选一值
5. 沿用纠正从有效text实体或image active/deleted BBoxes生成，删除->forceSkip，有效->forceDetect；高风险非显式Detect跳过
6. 按 normalizedPattern|entityType 分组；有forceDetect优先于forceSkip；保持sourceDecisionIds、enabled、risk、origin、时间
7. 导入correction同键合并；反向冲突仅在现有决策非显式时允许导入覆盖；输出仅enabled纠正，origin imported/sourceWorkspaceId
8. readReviewProfile返回filePath/sourceName/sourceWorkspaceId/format/corrections/pseudonyms(schemaVersion1/entries/reservedTokens)/conflicts；它不是普通profile模板

## 证据

| 区域 | 行 | 范围SHA256 |
|---|---|---|
| profile-validator | 18927–18972 | 9eb9a0bf3a6a75c3815f25b96bde6c79775bde258f6926fd711f81687fcd71d8 |
| profile-repository | 25929–26086 | 29c7bf7cb7259a8893e97472c630ed08cd3634bf5090e5248d8d69f439c4b108 |
| profile-ipc | 26883–26934 | e093d2bef5dba7899767d5e412c627e30bbf0f155f2487a36e95c770187c5bb7 |
| ruleset-schema-repository | 14264–14447 | 6f5ef346f0b44e413a1e5f62c313fae7d14ec54bb4cfd7b6681821925cb84a8f |
| ruleset-ipc-excel | 25796–25927 | 667d5a6f3975671523cd3a14408ea775e1f801e8520f906a469083e0b9bedc1c |
| workspace-review-profile | 20119–20203 | 7d7678be28a61e2bb1a960c4bf847fad3501cf7eb8011244d3e715412d8b3cfd |
| workspace-review-profile-ipc | 25648–25660 | bd4c835f49daf0eace26edc5d9f87a6381d24db5ac54b988382925ee8385f9c0 |

字段支持与当前发布保存归一化不同；不能按schema已声明就全部启用。未知上层消费、受保护容器、OS对话框、运行边界仍需合法对照；我方独立实现应保留租户授权/CAS/事务而不复刻已知缺陷。
