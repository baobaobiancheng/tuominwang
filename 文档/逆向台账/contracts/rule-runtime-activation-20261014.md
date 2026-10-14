# 规则运行激活矩阵 ITER024

静态源版本0.5.9。规则存在、真实caller、配置开关、默认遮盖和实证分别登记。授权竞品运行R0。

## 计数

- baselineGroups: 41
- amountFamilies: 12
- amountRegexBranches: 17
- yamlCategories: 108
- arrayEntries: 3012
- nonEmptyStrings: 3009
- nonStringsIgnoredLikeSource: 3
- distinctStringsAcrossFiles: 2516
- nonLitigationItems: 54
- spatialSourceGolden: 100
- legacyMaskStaticCases: 35
- tableGoldenCases: 168
- tableMissingSourceCandidates: 0
- tableExtraPendingCases: 44
- partyGoldenCases: 96
- fragmentGoldenCases: 240
- layoutGoldenCases: 81
- vectorGoldenCases: 18
- detectedMaskGoldenCases: 253

## options

|稳定 ID|状态|实现与运行入口|源码依据|
|---|---|---|---|
|OPT-ocr|metadata-only-by-design|; worker pages.length>0; OCR correction true forwarded but never read by reference detector|main.js:yt/Ue/ze|
|OPT-screenshot|active|; initial detect + document route screenshot; OCR correction detectComplete screenshot and applyDocumentRoute; page hash verified spatial/table helpers consume corrected glyph override|main.js:1118-1173 receipt + source screenshot pipeline|
|OPT-documentType|active|; full classification by filename/text passed per anchor; official_letter enables official regex families; explicit configured route reruns independent rules|main.js:Qe and OfficialDocumentStrategy|
|OPT-filename|active|; worker source_name unseal + OCR correction filename → classifyReferenceDocumentDetail (40 score patterns/120 golden cases)|main.js:475-509|
|OPT-windowOffset|active|; detectComplete per canonical anchor start → all candidate positions add exactly one offset|source contexts metadata windowOffset|

## baseline

|稳定 ID|状态|实现与运行入口|源码依据|
|---|---|---|---|
|REF41-id_card|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:662-668|
|REF41-mobile|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:670-683|
|REF41-wechat_labeled|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:685-690|
|REF41-wechat_wxid|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:692-695|
|REF41-bank|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:697-705|
|REF41-bank_labeled|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:707-725|
|REF41-email|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:727-740|
|REF41-uscc|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:764-770|
|REF41-tax_labeled|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:774-796|
|REF41-landline|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:798-809|
|REF41-local_phone|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:811-818|
|REF41-contact_name|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:820-829|
|REF41-transcript_name|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:831-834|
|REF41-officer_names|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:836-843|
|REF41-self_name|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:845-848|
|REF41-address_labeled_door|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:850-889|
|REF41-address_labeled_no_door|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:891-906|
|REF41-venue_labeled|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:908-922|
|REF41-address_unlabeled|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:924-993|
|REF41-garage|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:995-1000|
|REF41-property_base|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1002-1005|
|REF41-attached_door|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1007-1012|
|REF41-context_place|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1014-1024|
|REF41-unit_range|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1026-1031|
|REF41-plate|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1033-1036|
|REF41-securities_account|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1038-1044|
|REF41-case_no|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1046-1049|
|REF41-admin_no|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1051-1054|
|REF41-realty_cert|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1056-1059|
|REF41-patent|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1061-1064|
|REF41-patent_labeled|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1066-1069|
|REF41-icp|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1071-1074|
|REF41-filing_beizi|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1076-1079|
|REF41-filing_labeled|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1081-1084|
|REF41-land_cert|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1086-1089|
|REF41-housing_permit|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1091-1094|
|REF41-realty_unit|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1096-1099|
|REF41-certificate_labeled|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1101-1109|
|REF41-parcel|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1111-1114|
|REF41-email_ocr|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:741-747|
|REF41-url|active|baseline / urlsAndOcrEmail; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:748-762|
|AMOUNT-label|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-currency|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-uppercase|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-standalone|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-table_summary|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-labeled_bare_number|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-post_yuan_bare_number|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-conversation_payment|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-standalone_yuan|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-per_share_price|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-thousand_sep|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|
|AMOUNT-standalone_uppercase|active|detectReferenceAmounts → amountSpecs/amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1974-2134|

## amountBranches

|稳定 ID|状态|实现与运行入口|源码依据|
|---|---|---|---|
|AMOUNT-REGEX-L2028|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2028|
|AMOUNT-REGEX-L2037|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2037|
|AMOUNT-REGEX-L2044|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2044|
|AMOUNT-REGEX-L2049|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2049|
|AMOUNT-REGEX-L2054|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2054|
|AMOUNT-REGEX-L2059|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2059|
|AMOUNT-REGEX-L2066|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2066|
|AMOUNT-REGEX-L2071|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2071|
|AMOUNT-REGEX-L2078|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2078|
|AMOUNT-REGEX-L2083|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2083|
|AMOUNT-REGEX-L2089|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2089|
|AMOUNT-REGEX-L2096|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2096|
|AMOUNT-REGEX-L2103|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2103|
|AMOUNT-REGEX-L2111|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2111|
|AMOUNT-REGEX-L2118|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2118|
|AMOUNT-REGEX-L2124|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2124|
|AMOUNT-REGEX-L2129|active|amountSpecs: migratedPattern(line) + submit + amountExcluded; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2129|

## scenarios

|稳定 ID|状态|实现与运行入口|源码依据|
|---|---|---|---|
|INT-ein|active|international; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1299-1348|
|INT-passport|active|international; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1299-1348|
|INT-national-id|active|international; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1305-1348|
|INT-phone|active|international; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1299-1348|
|SCENE-receipt-wechat-pair|active|receipt; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1118-1173|
|SCENE-receipt-name-pair|active|receipt; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1118-1173|
|SCENE-receipt-timestamp-name|active|receipt; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1118-1173|
|SCENE-receipt-standalone-wechat|active|receipt; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:1118-1173|
|SCENE-form-name_cn|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-form-org_name|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-form-address|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-form-id_card|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-form-phone|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-form-bank_card|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-form-uscc|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-form-contract_amount|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-transaction-merchant|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-transaction-truncated-company|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-transaction-name|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-social-insurance-name|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-social-insurance-number|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-social-insurance-company|active|formAndTransactions; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2526-2617|
|SCENE-explicit-name|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2445-2490|
|SCENE-explicit-org|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2445-2490|
|OFFICIAL-signer|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-recipient|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-signatory|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-cert-subject|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-header-org|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-footer-org|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-recipient-org|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-staff-name|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-case-person|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|OFFICIAL-placeholder-org|active|explicitAndOfficial; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:2224-2321|
|SCENE-visual-relation-diagram|active|detectReferenceSpatialRelations; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|main.js:5682-5825/6214/11247|

## filters

|稳定 ID|状态|实现与运行入口|源码依据|
|---|---|---|---|
|FILTER-name-base|active|validReferenceName / isReferenceBlacklisted name; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|un/On + Lt combinedNameBlacklist|
|FILTER-name-strict|active-new-phase|isReferenceNameBlacklistedStrict → classifyReferenceRelationNode; |main.js:1431-1436/5722; caller5771/5814|
|FILTER-org-base|active|validReferenceOrganization + noisyDirectOrganization; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|Yn + direct an + Lt.orgNameBlacklist|
|FILTER-org-non-litigation|source-no-caller utility-only|isReferenceBlacklisted org true / validReferenceOrganization fourth param true; |main.js:1383-1384/1441-1443|
|FILTER-partylist-dedicated|source-dedicated-method-no-caller|category retained in combined name blacklist; |main.js:1416-1423/1444-1446|
|FILTER-address|active|cleanAddress + isReferenceNoisyAddress + anchor-scoped province repair; processing-worker detectComplete per canonical anchor → applyDocumentRoute → NER postfilter if enabled → contextualDocumentMarks → enabledProfileMarks; same path after correctOcrText|source address cleanup + Yt/Zt|
|FILTER-overlap|intentional-safety-difference|retain different types/overlapping spans pending; same kind/span combine evidence; |source several suppression routines|

## yamlCategories

|稳定 ID|状态|实现与运行入口|源码依据|
|---|---|---|---|
|YAML-name_blacklist-partylist_blacklist|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-procedural_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-position_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-organization_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-modifier_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-verb_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-connector_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-contract_party_labels|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-contract_role_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-legal_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-business_and_action_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-product_and_commodity_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-compound_false_positives|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-narrative_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-de_prefix_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-short_noise_roots|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-time_ordinal_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-object_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-phrase_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-party_list_noise|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-company_brand_names|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-single_chars|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-construction_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-financial_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-real_estate_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-role_descriptors|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-commercial_housing_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-civil_lending_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-second_trial_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-location_names|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-xinzexuan_high_freq_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-verb_fragments_xinzexuan|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-ordinal_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-document_types|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-expense_types|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-short_org_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-judicial_procedure_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-org_name_fragments_zhuw|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-document_code_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-contract_financial_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-tianjin_guohai_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-ordinal_numbers_without_prefix|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-shenzhen_guangyun_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-tianjin_penghao_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-beijing_heshun_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-shandong_hanlu_divorce_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-trademark_infringement_angl_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-construction_dongfang_fuli_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-personal_injury_xuqiaoyun_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-ner_3char_high_freq_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_short_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_prefix_cut|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_suffix_cut|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_middle_cut|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_org_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_name_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_legal_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_address_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_quantity_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_other_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_contextual_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-layer3_long_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-legal_roles_high_freq|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-legal_terms_high_freq|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-text_fragments_high_freq|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-org_fragments_high_freq|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-case_2026_02_03_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-case_2026_02_04_jiafuhua_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-case_2026_02_06_angelo_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-case_2026_02_06_mayue_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-case_2026_02_07_stock_transfer_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-case_2026_02_07_supervision_contract_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-fragment_recomposer_fixes|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-contract_work_items|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-contract_field_labels_and_fragments|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-contract_announcement_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-ipo_lawyer_report_fps|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-hardcoded_noise_migration|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-fp_pool_2026_04_30_class_a|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-fp_pool_2026_04_30_class_c|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-procurement_governance_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-name_blacklist-hr_governance_fp|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-legal_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-action_verbs|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-time_and_numbers|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-contract_clauses|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-fragmentation_errors|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-pdf_high_fp_words|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-contract_field_labels|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-securities_announcement_generic_terms|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-ner_fp_blacklist-regex_patterns|active-exact-filter|; combined nameBlacklist → explicit name validation, direct NER filter; strict name source graph also uses name-only categories||
|YAML-org_name_blacklist-legal_documents|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-contract_types|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-legal_procedures|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-evidence_types|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-time_terms|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-other_fp|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-pattern_fp_fragments|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-private_fund_generic_terms|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-insurance_product_names|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-securities_issuance_generic_institution_types|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-contract_announcement_generic_orgs|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-hardcoded_noise_migration|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-governance_bank_category_labels|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-investment_announcement_noise|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-boundary_fragment_noise|active-exact-filter|; orgBlacklist → explicit org validator and direct NER postfilter||
|YAML-org_name_blacklist-announcement_generic_orgs_round3|source-no-caller utility-only|; isReferenceBlacklisted(value,organization,true), public optional API; no default detector caller (source method also has no caller)||
|YAML-org_name_blacklist-disclosure_legal_opinion_and_charter_generic_orgs|source-no-caller utility-only|; isReferenceBlacklisted(value,organization,true), public optional API; no default detector caller (source method also has no caller)||

## masks

|稳定 ID|状态|实现与运行入口|源码依据|
|---|---|---|---|
|MASK-Nt-姓名|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-机构|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-地址|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-身份证号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-手机号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-固定电话|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-银行账号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-证券/资金账号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-信用代码|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-邮箱|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-网址|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-车牌号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-案号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-公文编号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-证照/许可证号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-专利号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-备案号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-护照号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-微信号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-自定义|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-商业秘密|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-金额|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-税号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-雇主识别号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-国际身份证号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-Nt-社保号|active|referencePartialMask + kind/type mapping; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:1224-1308|
|MASK-official-name|active|referencePartialMask official-name; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:_n/Sn|
|MASK-full|active|referenceFullMask; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|source full-star Unicode families|
|MASK-legacy-An|active-source-finalizer|referenceLegacyOrganizationMask Mn101/En179 + all props; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:2242-2268; Qn.mask2494 when NER_DIRECT=0|
|MASK-legacy-Jn|active-source-finalizer|referenceLegacyAddressMask uses identical address family; referencePartialMask for selective partial_star or explicit generic type mask; overall default_star uses source-provenance referenceDetectedMask; full_star uses Unicode referenceFullMask; preview/export share replacementFor|main.js:2429-2433|

## contextualStages

|稳定 ID|状态|实现与运行入口|源码依据|
|---|---|---|---|
|TABLE-typed-structure|active|referenceTableCells real OOXML ordinal/tbl/tr/tc/gridSpan/vMerge; GFM exact raw→decoded map; CSV/XLSX canonical cells; contextualDocumentMarks in worker/OCR; no NER model initialization per cell|main.js:4809-4845/5411-5656|
|TABLE-nested-context|active|scoped tree context snapshots inherit within parent story/cell; never sibling-table unit leakage; actual nested unit and empty merge continuation independently reviewed by visual agent|main.js:4809-4826|
|TABLE-financial-9|active|all9 literal financial categories + numeric/area/count/per-share/unit branches; automatic pure AMOUNT-only exact-span exclusions; manual/project dictionary/NER preserved|main.js:4847-4995|
|TABLE-glossary-signature|active|strict definition/fullname, ASCII aliases, signature fragments, column profiles, strong NER context offsets; wholecandidate pending; distinct actual repeated model offsets retained; source final dedup loss intentionally fixed|main.js:5411-5656/6213|
|TABLE-visual|active|physical PDF character/OCR glyph units, row/column/region/prose gates, continuation/header, explicit legal names/address/patent/cert; documentVisualTableMarks verified map hashes + nativeText prefix + canonical coordinates; PDF/OCR/image/Word media|main.js:6213; D9V2C_Ir.js reconstructVisualTables|
|TABLE-vector|active|closed connected PDF stroked/filled axis paths, nested Form affine transforms, merged grid cells; same PDFium canonical PageToDevice as extraction; read-only PDF source; actual synthetic PDF unit|main.js:3570-3705|
|PARTY-primary|active-conditional|judgment party seeds/source checks, roles, name/org consistency; legacy configuration only; text/Word/pdf-summary; image-rescan excludes primary party stage|main.js:8586-8650/9159/10483/10551|
|PARTY-org|active-conditional|org consistency/regulator/title/usage exclusions; modern PDF summary Ll with allowJudgment + legacy four/five-group callers|main.js:8651-8682/10894|
|PARTY-glossary|active-conditional|fulltext glossary alias shape/subsequence/source guards; legacy configuration only; nonjudgment gate|main.js:8683-8716|
|PARTY-kinship|active-conditional|all4 kinship/list/legal-role branches; legacy configuration; source word-flat initial omitBl followed by highConfidenceRescan9076 restores it; final helper includes branch|main.js:8717-8750|
|PARTY-name|active-conditional|NER confidence, 3–4 length, provenance, occurrence protection; modern PDF summary jl + legacy callers; no fabricated judgment skip|main.js:8751-8783|
|FRAGMENT-recomposer|active-conditional|all32 recovered patterns/noise/surnames, source max150/context/overlap; configuration.referenceStrategy legacy + fragmentRecomposer true + resolved documentType != other + txt/md/docx; default disabled|main.js:3283-3407/9149/10470/10530|
|MASK-detector-computed|active|all41 REF families,12 AMOUNT families, SCENE/TABLE/propagation/official + source finalizers; profile overall default_star → detected or detected-raster; selective partial_star stays Nt; UTF16/codepoint/source unchanged-value safety gates|main.js:661-1114/1978/2494/2564-2618/5074/5817; renderer8943-8948|

## 源无caller与空方法

108类别、3012数组项中3009非空字符串、3非字符串与源码一致；54非诉字符串仅保API/数据不人为默认启用。ContractStrategy ContractStrategy.applyTypeSpecificRules, detectConfirmedNameReferences, detectPartyNames, detectSignaturePage, addGlobalAbbrevMapping, hasGlobalAbbrevValue, getTitleCandidateLines, isBlacklisted, identify 是源空实现或false，不能用方法名冒充算法。

## 验证和差异

- spatial7 + legacy-mask1 + adapter/OCR2 pass; existing frozen rule/mask/pipeline79 unchanged
- 100
- 0
- 35
- 0
- False
- 6 own files32 tests + author C unlock3 + author B VML4 =8files39 PASS; latest source masks rechecked separately
- 168 cases no missing candidate,44 cases additional pending/visual evidence
- 96 zero differences
- 240 zero differences
- 81 zero differences
- 18 zero differences
- .data/research/lawbot-2026-10-14/iteration024/table-oracle/detected-mask-comparison.json
- tests/contextual-recognition.integration.ts actual DOCX/MD/CSV worker pass; separately explicit legacy/fragment config re-recognition

## 未验证边界

- Licensed competitor processing runtime is R0; static pure oracle does not prove authorized end-to-end equivalence or exhaust future/hidden versions
- Real multilingual OCR/NER accuracy is an evaluation gate independent of source rule migration; existing frozen public corpus pins remain unchanged
- 54 non-litigation blacklist strings have source method but no extracted caller; keep opt-in API/data, not default fabricated activation
- Compatibility configuration wires known party/fragment alternatives; it does not claim the complete proprietary legacy model/decision engine has been distributed or executed
- Source computes different winners for coincident provenance (e.g. USCC versus tax); our pending evidence remains additive. Runtime/source geometric and encoded-text safety differences are explicit in the context manifest

## ITER025 补充

最新运行规则/报告/名单/统计矩阵见 [processing-observability-porting-20261014.md](processing-observability-porting-20261014.md) 及同名 JSON。ITER024 上述文件hash为历史冻结快照；当前新增 runtime-whitelist 检测后遮盖分支（main9457）由ITER025清单固定，前后版本不得混为同一快照。基础detector/NER与公开语料评估基线未改变。Markdown纯函数480组源码对照通过，真实事件接线在父代理当前阶段继续核验。
