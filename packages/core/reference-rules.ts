import ruleData from './reference/rule-data.json' with { type: 'json' };
import blacklistData from './reference/blacklists.json' with { type: 'json' };
import { MAX_MARKS, type Mark, type Anchor } from '../contracts/index.ts';

/** Recovered rule data is interpreted by independent, bounded candidate code. No upstream runtime is shipped. */
export const REFERENCE_RULES_VERSION = 'reference-static-0.5.9-1';
export type ReferenceKind = Mark['kind'] | '税号' | '雇主识别号' | '国际身份证号' | '社保号';
export type ReferenceCandidate = {start:number; end:number; kind:ReferenceKind; referenceType:string; ruleId:string; confidence:number; decision:'pending'; sources:{layer:'rules';code:string;uncertain?:boolean}[]};
export type ReferenceOptions = {ocr?:boolean; screenshot?:boolean; sceneMode?:'off'|'only'; documentType?:'other'|'contract'|'complaint'|'reply'|'judgment'|'official_letter'; filename?:string; windowOffset?:number};
type Spec={id:string;line:number;endLine:number;type:string;kind:ReferenceKind;group:number;confidence:number};
const specs:Spec[]=[
 ['id_card',662,668,'id_card','身份证号',0,.98],['mobile',670,683,'mobile','手机号',0,.95],['wechat_labeled',685,690,'wechat_id','微信号',1,.97],['wechat_wxid',692,695,'wechat_id','微信号',1,.96],['bank',697,705,'bank_card','银行账号',0,.92],['bank_labeled',707,725,'bank_card','银行账号',1,.85],['email',727,740,'email','邮箱',0,.97],['uscc',764,770,'uscc','信用代码',0,.94],['tax_labeled',774,796,'tax_id','税号',0,.91],['landline',798,809,'landline','固定电话',0,.88],['local_phone',811,818,'landline','固定电话',1,.9],['contact_name',820,829,'name_cn','姓名',1,.88],['transcript_name',831,834,'name_cn','姓名',1,.99],['officer_names',836,843,'name_cn','姓名',1,.97],['self_name',845,848,'name_cn','姓名',1,.98],['address_labeled_door',850,889,'address','地址',1,.98],['address_labeled_no_door',891,906,'address','地址',1,.95],['venue_labeled',908,922,'address','地址',1,.9],['address_unlabeled',924,993,'address','地址',1,.98],['garage',995,1000,'address','地址',1,.98],['property_base',1002,1005,'address','地址',1,.97],['attached_door',1007,1012,'address','地址',1,.98],['context_place',1014,1024,'address','地址',1,.97],['unit_range',1026,1031,'address','地址',1,.98],['plate',1033,1036,'plate_cn','车牌号',0,.93],['securities_account',1038,1044,'securities_account','证券/资金账号',0,.89],['case_no',1046,1049,'case_number','案号',0,.96],['admin_no',1051,1054,'admin_doc_number','公文编号',0,.95],['realty_cert',1056,1059,'cert_no','证照/许可证号',0,.96],['patent',1061,1064,'patent_no','专利号',0,.94],['patent_labeled',1066,1069,'patent_no','专利号',0,.9],['icp',1071,1074,'filing_no','备案号',0,.95],['filing_beizi',1076,1079,'filing_no','备案号',0,.9],['filing_labeled',1081,1084,'filing_no','备案号',0,.88],['land_cert',1086,1089,'cert_no','证照/许可证号',0,.95],['housing_permit',1091,1094,'cert_no','证照/许可证号',0,.93],['realty_unit',1096,1099,'cert_no','证照/许可证号',0,.94],['certificate_labeled',1101,1109,'cert_no','证照/许可证号',2,.9],['parcel',1111,1114,'cert_no','证照/许可证号',0,.88],
].map(([id,line,endLine,type,kind,group,confidence])=>({id:id as string,line:line as number,endLine:endLine as number,type:type as string,kind:kind as ReferenceKind,group:group as number,confidence:confidence as number}));
export const REFERENCE_RULE_INVENTORY = [ ...specs.map(s=>({id:'REF41-'+s.id,source:`main.js:${s.line}-${s.endLine}`})),{id:'REF41-email_ocr',source:'main.js:741-747'},{id:'REF41-url',source:'main.js:748-762'},...['label','currency','uppercase','standalone','table_summary','labeled_bare_number','post_yuan_bare_number','conversation_payment','standalone_yuan','per_share_price','thousand_sep','standalone_uppercase'].map(id=>({id:'AMOUNT-'+id,source:'main.js:1974-2134'})) ];
const migratedPattern=(line:number)=>{const p=ruleData.patterns.find(p=>p.line===line);if(!p)throw new Error('REFERENCE_PATTERN_MISSING:'+line);return new RegExp(p.source,p.flags.includes('g')?p.flags:p.flags+'g');};
const regexAt=(line:number,index=0)=>{const p=ruleData.regexLiterals.filter(p=>p.line===line)[index];if(!p)throw new Error('REFERENCE_LITERAL_MISSING:'+line);return new RegExp(p.source,p.flags.replace('g',''));};
const strings=(v:unknown)=>Array.isArray(v)?v.filter((s):s is string=>typeof s==='string'&&!!s.trim()).map(s=>s.trim()):[];
const combine=(o:Record<string,unknown>,exclude:string[]=[])=>new Set(Object.entries(o).filter(([k])=>!exclude.includes(k)).flatMap(([,v])=>strings(v)));
const nonLitigationCategories=['announcement_generic_orgs_round3','disclosure_legal_opinion_and_charter_generic_orgs'];
const nameBlacklist=combine({...blacklistData.name_blacklist,...Object.fromEntries(Object.entries(blacklistData.ner_fp_blacklist).map(([k,v])=>['ner:'+k,v]))});
const orgBlacklist=combine(blacklistData.org_name_blacklist,nonLitigationCategories);
const nonLitigationBlacklist=combine(Object.fromEntries(Object.entries(blacklistData.org_name_blacklist).filter(([k])=>nonLitigationCategories.includes(k))));
const surnames=new Set(strings(ruleData.literals.pn)),compoundSurnames=new Set(strings(ruleData.literals.Gn)),knownOrganizations=new Set(strings(ruleData.literals.Hn));
export const REFERENCE_CONFIG_COUNTS={categories:108,arrayItems:3012,nameUnique:nameBlacklist.size,organizationUnique:orgBlacklist.size,nonLitigationUnique:nonLitigationBlacklist.size};
export function isReferenceBlacklisted(value:string,type:'name'|'organization',nonLitigation=false){return type==='name'?nameBlacklist.has(value):orgBlacklist.has(value)||nonLitigation&&nonLitigationBlacklist.has(value);}
export function isReferenceCompoundSurname(value:string){return compoundSurnames.has(value.slice(0,2));}
export function validReferenceName(value:string,relaxSurname=false){
 if(!/^[\u4e00-\u9fa5]{2,4}$/u.test(value)||nameBlacklist.has(value)||strings(ruleData.literals.fn).some(s=>value.includes(s)))return false;
 for(const denied of nameBlacklist)if(denied.length>=2&&value.includes(denied))return false;
 if(/[的之其此该]/u.test(value)||value.length<=2&&/[本任]/u.test(value)||/^[本任]/u.test(value)||/[市县区镇村路街]$/u.test(value)||/[岭山湖河]{2}/u.test(value))return false;
 if(/(?:本院|权益|受损|居住|处理|联系客户|同时|拒收|客观|以下|以上|公司|中心|机构|集团|企业|工厂|商行|店铺|损失|联方|元转|注册|发行|协议|合同|建设|著作|推广|研发|产品|劳动|庄农|南人|县祥|区东|省邳|市碧|招标|委派|指派|承担|政府|机关|部门|委员|简历|严格|时间|如更|后生|任职|董事|职员|改制|保密|排除|资格|报备)/u.test(value))return false;
 if(/(?:证券|保险|投资|银行|基金|资本|财富|金融|信托|期货|自治|开发|族人|民族|地区|行政|政府|委员|部门|街道|社区|工业区|开发区|利率|政策|外汇|渠道|名称|自律|专线|工作组|成员|公示|说明|规则|制度|条款|流程|标准|原则|办法|规定|细则|方案|措施|要求|职责|分工|排序|评分|评级|分类|分档|统计|公告|告知|承诺|管理|监督|考核|决议)$/u.test(value))return false;
 if(value.length>2&&/[受以等或有无前后中上下来去到身与方转册失务者别动农集]$/u.test(value)||value.length===4&&(value.endsWith('利')||value.startsWith('方'))||value.length===3&&(/^方[委指承担派授]/u.test(value)||/[省市区县街镇乡村路]/u.test(value[1])))return false;
 for(const province of strings(ruleData.literals.ht).length?strings(ruleData.literals.ht):String(ruleData.literals.ht).split('|'))if(value.startsWith(province)&&value.length>province.length)return false;
 return relaxSurname||surnames.has(value[0])||isReferenceCompoundSurname(value);
}
export function validReferenceOrganization(value:string,confidence=1,source='',nonLitigation=false){
 if(knownOrganizations.has(value))return true;
 if(!value||isReferenceBlacklisted(value,'organization',nonLitigation)||strings(ruleData.literals.Dn).includes(value)||strings(ruleData.literals.Rn).includes(value))return false;
 const organizationShape=/^.{2,}(?:公司|集团|工作室|银行|法院|检察院|公安|局|院|所|中心|委员会|协会|事务所|学校|医院|研究院|分行|支行|分局|派出所|公证处|交易所|仲裁委|商会|联盟|联合会|信托|基金|酒店|驾校|客运段|业委会|加工店)$/u;
 const suffix=/(?:公司|集团|工作室|银行|法院|检察院|公安|局|院|所|中心|委员会|协会|事务所|学校|医院|研究院|分行|支行|分局|派出所|公证处|交易所|仲裁委|商会|联盟|联合会|信托|基金|酒店|驾校|客运段|业委会|加工店)$/u;
 const rejects=[/^(?:告|被告|原告|不服被告|起诉被告|诉被告)/u,/^(?:本案全部|日前清偿全部|日在北京市民政局|告本人颈部|包含双方签字及公司|授权委托书及律师事务所|详细记载了案发中心)$/u,/^(?:受|在|向|对|由|经|从|给|与|按|依照|依据|根据|通过|针对|对于|自).+(?:公司|集团|银行|法院|检察院|公安局|公安分局|分局|管理局|委员会|业主委员会|业委会|事务所|研究院|研究所|中心|医院|学校|政府|局|院|所)$/u,/^(?:集团公司|合资公司|合营公司|合作公司|母公司|子公司|分公司|总公司|新公司|原公司|对方公司|相应公司|存续公司|新设公司|项目公司|关联公司|控股公司|参股公司|境内公司|境外公司|发起人公司|本集团|该集团|各方公司|双方公司|任何一方公司|另一方公司)$/u,/^(?:保密信息|保密资料|保密义务|保密条款|商业秘密|技术秘密|敏感信息|个人信息|相关信息|相关资料|机密信息|涉密信息)$/u,/^(?:公司|集团|银行|法院|局|院|所|中心|委员会|合伙企业|企业|基金|协会|单位|机构|合伙人|基金管理人|基金托管人|投资基金|有限合伙)$/u,/^(?:控股子公司|全资子公司|参股子公司|直接控股公司|间接控股公司|主要控股子公司|下属子公司|合并报表子公司)$/u,/^(?:我|贵|该|其|本|双方|各方)(?:公司|单位|司|集团|企业|机构)/u,/^(?:选择|确定|协议|约定)?(?:管辖|受理|审判|执行|一审|二审|原审|再审|上一级|本级|专属|海事)(?:人民法院|法院)$/u,/^(?:有限(?:责任)?公司|股份(?:有限)?公司|集团(?:有限)?公司|总公司|分公司|子公司|合伙企业|有限合伙)$/u,/判令|判决|裁定|分割|驳回|归还|命令|责令|委托|依法委托|高于|通过|提供/u,/^(?:该|此|其中|其|上述|如前|依据|鉴于|经由|由于|应当|应遵守|应经|应向|应在|须经|必须|不得|拟向|拟由|遵守|按照|根据|依照|依据|或|名下)/u,/开户银行|开户行|(?:支行|分行|营业部)银行$/u];
 if(rejects.some(r=>r.test(value)))return false;
 if(/企业类型|公司类型|企业性质|企业状态|组织形式|成立日期|成立时间|登记日期|经营范围|经营期限|营业期限|存续期限|合伙期限|注册资本|注册资金|实缴资本|实收资本|认缴出资|实缴出资|执行事务合伙人|主要经营场所|主营业务|纳税人识别号|本公告披露日/u.test(value))return false;
 if(/公司$/u.test(value)&&/变更|新设|裁员|协商|指定|协助|努力|章程|约定|如为|如系|拟由|或由|应当|不得|履行|清算|解散|终止|退出|加入|转让|聘请|聘任|相应|否则|违反|经营范围内?的/u.test(value))return false;
 if(/公司$/u.test(value)&&!/(有限责任公司|股份有限公司|有限公司|集团有限公司|集团公司|股份公司|总公司|分公司|子公司)$/u.test(value)&&/可能会|导致|负责|制订|董事会|股东会|监事|法定代表人|注册资本|增资|认购|身份|权益类|股权转让|治理结构|优先购买|随售|拖售|第三方的身份/u.test(value))return false;
 if(/证券$/u.test(value)&&!value.endsWith('证券公司')&&/购股权|权益类|等证券|类证券|认购|授予|优先购买|随售|拖售|拟转|新发行|注册资本|增资|违约|义务|职务|股权转让|交易条款/u.test(value)||value==='国家市场监督管理总局')return false;
 if(value.length<=4){const trusted=/pattern2\.5|pattern2-abbrev-definition|pattern10-abbr|defined_in_document_abbrev|doc_short_org_fulltext|org_abbrev_whitelist|alias_resolver|pattern6-1|pattern-role-line-org|party_list_extractor|obligation_sentence|pattern3_split_by_/u.test(source);const defined=/pattern2-abbrev-definition|pattern2\.5|defined_in_document_abbrev|doc_abbrev_fulltext|doc_short_org_fulltext|announcement-long-report-defined-short-org/u.test(source);if(defined)return confidence>=.6;if(!organizationShape.test(value)&&!/(科技|实业|软件|信托|基金|酒店|驾校|证券|保险|业委会|客运段|合伙)$/u.test(value)&&!(trusted&&/(投资|置业|地产|房地产|房产|合伙|资本|传媒|互娱|证券|交易所|证监会|证监局|科技|工贸|商贸|实业|物流|农业|医疗|能源|建材|建工|文化|传播|商业|工程|设计|咨询|管理|发展|控股|生物|制药|食品|环保|电力|矿业|信息|网络|数码|智能|航空|机械)$/u.test(value)))return false;if(confidence<(/银行|法院|高院|中院|政府|律所$/u.test(value)?.55:trusted?.6:.95))return false;}
 // Each source noise family has its own guard: suffix, length and context are not collapsed into a blanket blacklist.
 if(/(?:保险公司|原告公司|被告公司)/u.test(value)&&value.length<=12&&!/[A-Z]/u.test(value)){const prefix=value.replace(/(?:保险公司|原告公司|被告公司)$/u,'');if(/^(?:进入|系|驾驶|年为|在|到|的|是|为|某|某某)/u.test(prefix)||prefix.length<=3)return false;}
 if(value.length>4&&/(?:上市公司|目标公司|标的公司|关联公司|拟收购公司|被收购公司|挂牌公司|发行人公司|实际控制人公司)$/u.test(value))return false;
 if(/^(?:一家|某家|该家|每家|多家|两家|三家|本事项|该事项|具体详见|详见|是否对|不会对|将对|拟对|拟由|将由|系一家|为一家)[一-龥]{0,24}公司$/u.test(value)||/的(?:有限责任公司|有限公司|股份有限公司|集团有限公司|集团股份有限公司|有限合伙企业?)$/u.test(value))return false;
 if(value.length>4&&/(?:合资公司|合营公司|合资企业|合营企业)$/u.test(value)&&!value.endsWith('有限公司'))return false;
 if(/^(?:行政许可法|公司登记管理条例|答复[一二三四五六七八九十两]?通?意见陈述|财务报告内部|内部控制|意见陈述)$/u.test(value)||/^(?:股东会|董事会|执行董事|监事会?|法定代表人)(?:负责|召集|主持|审议|批准|监督|行使|担任)|^(?:依据|依照)?本章程(?:规定|行使|负责)/u.test(value))return false;
 if(/^(?:根据检测算法的需要对眼部|主要包括杭州宋城集团控股有限公司|为了确保公司|融资方尚有全部|上一级人民法院|可以自公告之日起十日内向人民法院)$/u.test(value)||/^(?:不同意[\u4e00-\u9fa5]{2,}(?:公司|集团|银行|法院|检察院|中心|委员会)|本案当事人[\u4e00-\u9fa5]{2,}(?:公司|集团|企业).+)$/u.test(value))return false;
 if(/^[的在与及、，]/u.test(value)&&value.length<8||/^[（(][一二三四五六七八九十百千\d]+[)）]/u.test(value)||/^(?:公司|企业|合伙企业|基金|合伙|机构|单位)(?:及|和|或|与|以及|、)(?:公司|企业|合伙企业|基金|合伙|机构|单位)$/u.test(value)||/^公司(?:及|和|与|以及)(?:控股子公司|全资子公司|参股子公司|下属子公司|附属公司|关联公司)$/u.test(value))return false;
 const fund=value.match(/(合伙企业|有限合伙|投资基金|基金管理人|基金托管人|基金|合伙人)$/u)?.[1];if(fund){const prefix=value.slice(0,-fund.length);if(prefix&&/^(?:充分发挥|管理模式|出资认缴|受托管理|拟参与投资的?|股权投资|私募投资|私募|上市|非上市|境内|境外|目标|标的|底层|母|子|新设|存续|发起设立的?|拟设立的?|拟成立的?|设立|管理|运营|经营|投资|受托|认缴|实缴|发起|组织|成立|清算|解散|终止|变更|退出|加入|转让|增资|减资|参与|发挥|模式|制度|全部|各|本|该|其)*$/u.test(prefix))return false;}
 if(/的.{1,2}公司$/u.test(value)&&value.length<6||/银行(?:流水|账户|账单|存款记录|贷款|转账|汇款|存取款|对账单)/u.test(value))return false;
 if(value.endsWith('所')&&!/(事务所|律师事务所|法律服务所|鉴定所|派出所|交易所|研究所|公证处|营业所|服务所|律所)$/u.test(value)&&(/原告|被告|诉请|请求|生活|财产|动产|前妻|生育|增加|超出|全部归|归原告|归被告|取得|依据前款|家庭日常|图像|因素|上市公司|检测算法|眼部|股票市场|证券市场/u.test(value)||value.length<=4))return false;
 if(/(?:内部|干部|人员|图像和所|因素所)$/u.test(value)&&!/(委员会|研究所|事务所|派出所|公证处)$/u.test(value))return false;
 if(value.endsWith('银行')&&!/(建设银行|工商银行|农业银行|中国银行|交通银行|招商银行|邮政储蓄银行|邮储银行|民生银行|光大银行|兴业银行|浦发银行|中信银行|华夏银行|平安银行|北京银行|江苏银行|宁波银行|农村商业银行|信用社|合作银行|人民银行)$/u.test(value)&&(/^(?:从|向|对|在|由|经|按|通过|且|已|应|据|以|自认|用于|也不|告|方)/u.test(value)||/来源于|通过|流水|账号|账户|账单|存款|贷款|转账|汇款|购房款|广告费|土地作抵押/u.test(value)))return false;
 if(value.endsWith('部')&&!/(司法部|财政部|教育部|公安部|商务部|民政部|外交部|组织部|宣传部|统战部|营业部|分部|总部)$/u.test(value)&&(/^(?:基本|逾期|行政|主管|卫生行政|省级卫生行政)/u.test(value)||/(有限公司部|公司部|集团部)$/u.test(value)))return false;
 if(/[一-龥]{3,}的人民法院$/u.test(value)||/^[\u4e00-\u9fa5]{2,4}(?:在|持有的|生前系|所有的|名下的|签订了|签署了|向|对|与|及)[\u4e00-\u9fa5]/u.test(value))return false;
 if(/(?:同期|贷款|基准)[\u4e00-\u9fa5]{0,4}银行$/u.test(value)&&/同期|基准/u.test(value)||value.length>4&&!suffix.test(value)&&/尽了|继承人|对被|被继|全部义务|已全部|了全部/u.test(value))return false;
 if(/^的[\u4e00-\u9fa5]|[\u4e00-\u9fa5]{2,4}向[\u4e00-\u9fa5]{1,6}(?:局|院|厅|委|部|司|庭|署|处|所|馆|中心)|^(?:本次发行上市|支持上诉人的全部|下属子公司)$/u.test(value))return false;
 if(!suffix.test(value)&&/^(?:主营|经营|从事|主要从事|专注|专营|主营业务|主要生产|生产销售|研发生产)/u.test(value)||/(?:省|市|县|区|国家|总)级?(?:局|部|院|委)?或(?:省|市|县|区|国家|总)级/u.test(value))return false;
 if(value.length>4&&/(?:充分发挥|协商一致解散|占合资|合作运营方占|一致撤出|上报到双方)[\u4e00-\u9fa5]{0,10}(?:公司|集团|中心|委员会|协会|银行|法院|事务所|场馆|俱乐部|机构)$/u.test(value))return false;
 if(/^中华人民共和国(?:公司|合同|民法|劳动|刑法|行政|证券|税务|商标|专利|仲裁|土地|环境|建筑)|^(?:运营期内|当地政府职能|区等各级政府|全年累计|整个|招标单位指定|国内外各|各级|各地方|主要包括|国际单项体育)[\u4e00-\u9fa5]{0,8}(?:公司|委员会|部|协会|场馆|中心|局|事务所|俱乐部|机构)$/u.test(value)||value.length>18&&/了解|已全|读和|研究了|等的全部|等全部|文件等/u.test(value))return false;
 if(/(?:场馆|闭馆)$/u.test(value)&&!/^[\u4e00-\u9fa5]{2,6}(?:场馆|闭馆)管理/u.test(value))return false;
 if(value.length>5&&value.indexOf('的')>=1&&value.indexOf('的')<=4||/的(?:银行|公司|法院|检察院|机构|单位|政府|局)$/u.test(value)&&value.length<=14)return false;
 return !(/(?:法|条例|规定|办法|规则|细则|意见)$/u.test(value)&&!suffix.test(value));
}
const normalizeDigits=(value:string)=>value.replace(/[OoＯｏ〇○]/gu,'0').replace(/[IlIｌ１l丨|￨]/gu,'1').replace(/[\s-]/gu,'');
const digits=(value:string)=>value.replace(/\D/gu,'');
function luhn(value:string){if(!/^\d{12,19}$/u.test(value))return false;let sum=0;for(let i=value.length-1,twice=false;i>=0;i--,twice=!twice){let d=Number(value[i])*(twice?2:1);sum+=d>9?d-9:d;}return sum%10===0;}
const idShape=/^[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx]$/u;
const timeStamp=(value:string)=>/^1\d{12}$/u.test(value)&&Number(value)>1e12;
function safeBoundary(text:string,n:number){return !(n>0&&n<text.length&&/[\uD800-\uDBFF]/u.test(text[n-1])&&/[\uDC00-\uDFFF]/u.test(text[n]));}
function addCandidate(out:ReferenceCandidate[],text:string,start:number,end:number,kind:ReferenceKind,id:string,confidence:number,type:string){if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=end||end>text.length||!safeBoundary(text,start)||!safeBoundary(text,end))throw new Error('REFERENCE_POSITION_INVALID');if(out.length>=MAX_MARKS)throw new Error('MARK_LIMIT');out.push({start,end,kind,referenceType:type,ruleId:id,confidence,decision:'pending',sources:[{layer:'rules',code:id}]});}
function cleanAddress(text:string,start:number,end:number){
 let value=text.slice(start,end),offset=value.length-value.trimStart().length;start+=offset;value=value.trim();
 const province=String(ruleData.literals.ht),administrative=new RegExp('^(?:(?:'+province+')(?:省|市|自治区|特别行政区)?|[\\u4e00-\\u9fa5]{2,8}(?:市|区|县|旗|镇|乡|村|街道|社区))','u');
 for(const re of [/^委托[\u4e00-\u9fa5A-Za-z0-9]{2,20}对/u,/^(?:住所为|注册地(?:址)?为|办公地(?:址)?为|经营场所为|场所为|所为|位于|地处于?|座落于?|坐落于?|址为|地为|为)(?=[一-龥]{2,6}(?:省|市|区|县|镇|街道|路|大道))/u]){const prefix=value.match(re)?.[0];if(prefix){start+=prefix.length;value=value.slice(prefix.length);}}
 if(!administrative.test(value)&&!/^中国[（(][\u4e00-\u9fa5]{2,6}[）)]/u.test(value)){
  const locations=[new RegExp('(?:'+province+')(?:省|市|自治区|特别行政区)?','u'),/[\u4e00-\u9fa5]{2,10}(?:区|县|旗)/u,/[\u4e00-\u9fa5A-Za-z0-9]{2,30}(?:新村|花园|苑|郡|城)\d+号/u,/[\u4e00-\u9fa5A-Za-z0-9]{2,30}(?:路|街道|街|道|镇|乡|村|大道|巷|弄|社区|小区|花园|新村|公寓|大厦|广场|城|苑|郡|庭|阁|湾|府|酒店|宾馆)/u];
  for(const re of locations){const m=value.match(re);if(m?.index&&m.index<=24){start+=m.index;value=value.slice(m.index);break;}}
 }
 const narrative=value.match(/^[\u4e00-\u9fa5]{0,6}(?:购买|出售|出租|租用|购置|转让|过户)(?=[\u4e00-\u9fa5]{2,8}(?:市|区|县|旗))/u)?.[0];if(narrative){start+=narrative.length;value=value.slice(narrative.length);}
 const stop=value.search(/(?:现住(?:址|地)?|单位(?:地址|住址|所在地|座机|电话)|联系(?:电话|方式)|联系电话|电话|传真|邮编|邮政编码|身份证号(?:码)?|不动产权第|建筑面积)|的(?:房产|房屋|住宅|商铺|车位|车库|房产证|不动产权证)|法定代表人|执行事务合伙人|委托代理人|代理人|负责人|联系人|邮箱|成立日期|成立时间|注册资本|营业期限|经营范围|统一社会信用代码|身份证|开户行|开户银行|账号|账户|甲方|乙方|丙方|丁方|主送|抄送|签发人|鉴于|受托方|委托方/u);if(stop>0)value=value.slice(0,stop);value=value.replace(/(?:现|的房|的车|的住)$|[，,。；;：:、)\]】》\s]+$/u,'');
 const endpoints=/(?:附\d+号|[A-Za-z]?\d+(?:号附\d+号|号楼|号|室|房|层|楼|栋|单元|组|座|幢|门|车位|车库|[Ff]\d*)|[一二三四五六七八九十〇○零\d]+(?:层|栋|单元|号|座|幢|[Ff]\d*)|(?:酒店|宾馆|公寓|大厦|中心|广场|花园|新村|苑|郡|城|会议室|会议中心|会议厅|报告厅|多功能厅))(?:至[A-Za-z0-9一二三四五六七八九十〇○零\d]+(?:号|室|层|楼|栋|单元|座|幢|门))?/gu;
 let tail=-1;for(const m of value.matchAll(endpoints))tail=m.index+m[0].length;
 if(tail>0&&tail<value.length){
  const code=value.slice(tail).match(/^[A-Za-z\d][A-Za-z\d\-]*(?:[号室房户层楼栋](?![A-Za-z\d]))?/u)?.[0];if(code&&code.length<=15)tail+=code.length;
  const extensions=[/^[-－][A-Za-z\d]{1,10}/u,/^(?:地下室|地下层|院|区|村|平房|一楼|二楼|首层(?:之\d+)?|[一二三四五六]期|对面路段)(?=[^\u4e00-\u9fa5，。；;\n]|$)/u,/^[（(][^（）)\n]{1,30}[）)]/u,new RegExp('^[\\u4e00-\\u9fa5A-Za-z0-9()（）\\-]{2,50}(?:'+String(ruleData.literals.ft)+')(?:[A-Za-z0-9\\-]{0,20})?(?:[（(][^（）)\\n]{1,30}[）)])?','u')];
  for(const re of extensions){const extension=value.slice(tail).match(re)?.[0];if(extension)tail+=extension.length;}
  value=value.slice(0,tail).replace(/[，,。；;：:、)\]】》\s]+$/u,'');
 }
 return {start,end:start+value.length,value};
}
function baseline(text:string,out:ReferenceCandidate[]){
 for(const spec of specs){if(spec.id==='email')continue;for(const match of text.matchAll(migratedPattern(spec.line))){
  let value=match[spec.group],start=match.index+(spec.group?match[0].lastIndexOf(value):0),confidence=spec.confidence;
  if(!value)continue;
  if(spec.id==='mobile'){value=value.trimEnd().replace(/[ \t\r\n-]+$/u,'');const mobile=digits(value).match(/1[3-9]\d{9}/u);const before=text.slice(Math.max(0,start-20),start),after=text.slice(start+value.length,start+value.length+6);if(!mobile||/[A-Za-z]{1,6}$/u.test(before)||after.startsWith('号')&&/编号|合同编号|借贷字第|担保字第|字第|合同号|协议号|保单号|凭证号/u.test(before))continue;}
  if(spec.id==='wechat_labeled'&&/^[_-]+$/u.test(value))continue;
  if(spec.id==='bank'||spec.id==='bank_labeled'){
   const following=text.slice(start+value.length,start+value.length+6);if(/^[.．]\d|^、/u.test(following)&&normalizeDigits(value.slice(0,-1)).length>=8)value=value.slice(0,-1).trimEnd();
   const compact=normalizeDigits(value),ocr=/[OoＯｏ〇○IlIｌ１l丨|￨]/u.test(value);if(timeStamp(compact)||idShape.test(compact))continue;
   if(spec.id==='bank'){if(compact.length<12||compact.length>22)continue;const context=text.slice(Math.max(0,start-50),start)+text.slice(start+value.length,start+value.length+30);const explicit=/对公账户|公司账户|企业账户|对公转账|公司转账|收款信息|付款信息|汇款信息|转账信息|银行信息|收款账号|付款账号|开户账号|银行账号|银行帐号|银行账户|银行卡号|账号[：:\s为是]|账户[：:\s为是]|帐号[：:\s为是]|帐户[：:\s为是]|卡号[：:\s为是]|开户行|开户银行|收款银行|收款单位|付款单位|乙方账[号户]|甲方账[号户]|户名[：:]|账户名[：:为是]|开户名[：:]|专项?账户|专户|募集资金|资金账户|资金专户|监管账户|结算账户|保证金账户|托管账户/u.test(context);if(!luhn(compact)&&!explicit)continue;confidence=luhn(compact)?.92:.85;}
   else {if(compact.length<8||compact.length>25||!ocr&&(/[\r\n]/u.test(match[0].slice(0,match[0].lastIndexOf(value)))||!/^\d{1,6}(?:[ \t-]+\d{1,6}){2,}$/u.test(value)||compact.length<12||compact.length>22))continue;confidence=ocr?.84:.85;}
  }
  if(spec.id==='email'){const prefix=value.match(/^(1[3-9]\d{9})(?=[A-Z][A-Z0-9._%+-]*@)/iu)?.[1];if(prefix&&out.some(c=>c.kind==='手机号'&&c.start===start&&c.end===start+prefix.length)){start+=prefix.length;value=value.slice(prefix.length);}}
  if(spec.id==='uscc'){const compact=value.toUpperCase();const before=text.slice(Math.max(0,start-30),start),after=text.slice(start+value.length,start+value.length+10);if(/身份证|身分证|公民身份|居民身份|身份号码|证件号/u.test(before+after)||/甲方[:：]|乙方[:：]|丙方[:：]|丁方[:：]|承建方[:：]|发包方[:：]|承包方[:：]|受托人[:：]|委托人[:：]|出租方[:：]|承租方[:：]/u.test(before)&&/[（(]\s*$/u.test(before)&&/^\s*[）)]/u.test(after))continue;if(!/^[0-9A-HJ-NP-RTUWXY]{18}$/u.test(compact)||Number(compact.slice(0,2))<11||Number(compact.slice(0,2))>91||idShape.test(compact))continue;}
  if(spec.id==='tax_labeled'){start=match.index+match[0].length;const rest=text.slice(start,start+40);value=rest.match(/^([0-9A-HJ-NP-RTUWXYa-hj-np-rtuwxy]{10,20})/u)?.[1]??rest.match(/^([0-9A-HJ-NP-RTUWXYa-hj-np-rtuwxy][0-9A-HJ-NP-RTUWXYa-hj-np-rtuwxy \t]{0,25}[0-9A-HJ-NP-RTUWXYa-hj-np-rtuwxy])/u)?.[1]??'';const compact=value.replace(/\s/gu,'');if(compact.length<10||compact.length>20||idShape.test(compact))continue;}
  if(spec.id==='landline'&&digits(value).length<10)continue;
  if(spec.id==='local_phone'&&out.some(c=>c.kind==='固定电话'&&start<c.end&&start+value.length>c.start))continue;
  if(spec.id==='contact_name'&&(/联系|方式|电话|手机|邮件|地址|信息/u.test(value)||out.some(c=>start<c.end&&start+value.length>c.start)))continue;
  if(spec.id==='officer_names'){let cursor=start;for(const part of value.split(/[、，,]/u)){if(!/^[一二三四五六七八九十]/u.test(part)&&!out.some(c=>c.kind==='姓名'&&cursor<c.end&&cursor+part.length>c.start))addCandidate(out,text,cursor,cursor+part.length,spec.kind,'REF41-'+spec.id,confidence,spec.type);cursor+=part.length+1;}continue;}
  if(spec.type==='address'){
   const cleaned=cleanAddress(text,start,start+value.length);start=cleaned.start;value=cleaned.value;
   if(spec.id==='address_labeled_door'&&(value.length<10||!(/\d+(?:号|室|层|楼|栋|单元|组)/u.test(value)||/[A-Z]区(?:内|的)?[\u4e00-\u9fa5]{2,15}(?:小区|公寓|花园|苑|城|园|庄|居|里|新村)/u.test(value))))continue;
   if(spec.id==='address_labeled_no_door'&&(value.length<8||!/省|市|自治区|特别行政区|区|县|旗/u.test(value)||!/路|街|大道|巷|镇|乡|村|社区/u.test(value)||/\d+(?:号|室|楼|栋|层|单元)/u.test(value)))continue;
   if(spec.id==='venue_labeled'){value=match[1].trim().replace(/[，,。；;：:、)\]】》\s]+$/u,'');start=match.index+match[0].lastIndexOf(match[1])+match[1].length-match[1].trimStart().length;if(value.length<3||/^[\d年月日时分秒：:\-\s]+$|^\d+(?:人|名|位|个)$/u.test(value))continue;const listStop=value.search(/[；;]|(?<![零一二三四五六七八九十百])[一二三四五六七八九十百]+[、。]/u);if(listStop>3)value=value.slice(0,listStop).trimEnd();const stop=value.search(/会议时间|活动时间|举办时间|集合时间|主办单位|承办单位|参加人数|参与人数|联系电话/u);if(stop>0)value=value.slice(0,stop).trimEnd();}
   if(spec.id==='address_unlabeled'){
    if(value.length<10||/人民政府(?:令)?第\d+号|建筑面积|不动产权第|上诉|申诉|诉讼|诉求|主张|答辩|抗辩|异议|复议|股价|股权|股份|分红|收盘价|开盘价|市场价|基准日|基准价|每股|转让价|交易价|评估价|净资产|市场报价|报价利率|LPR|执行利率|年利率|月利率/u.test(value))continue;
    const surrounding=text.slice(Math.max(0,start-10),start)+text.slice(start+value.length,start+value.length+10);const residential=/住址|住所|居住地|户籍|家庭住址|现住址|经常居住/u.test(text.slice(Math.max(0,start-15),start));if(!residential&&/公司|企业|单位|机构|银行|注册地|营业执照|法定代表|经营范围/u.test(surrounding))continue;
    if(/经济开发区|高新区|高新技术|科技园区|国际中心|世贸中心|金融中心|商务中心|商业广场/u.test(value)||/工业区|工业园区|产业园/u.test(value)&&!/\d+(?:室|房|楼|层|栋|号|单元)/u.test(value)||/大厦|写字楼|中心/u.test(value)&&!/\d+(?:室|房|层|楼)/u.test(value)&&value.length<25)continue;
   }
   if(spec.id==='context_place'&&(value.length<7||ruleData.regexLiterals.filter(p=>p.line===1021).some(p=>new RegExp(p.source,p.flags).test(value))))continue;
   if(spec.id==='property_base'){const street=value.match(/^.+?(?:路|街|大道|巷|弄)\d+号/u)?.[0];if(street)value=street;}
   if(spec.id==='garage')value=value.replace(/车位$/u,'');
   if(value.length<(spec.id==='venue_labeled'?3:6))continue;
  }
  if(spec.id==='securities_account'&&digits(value).length<6)continue;
  if(['patent_labeled','filing_labeled'].includes(spec.id)&&out.some(c=>c.kind===spec.kind&&value.includes(text.slice(c.start,c.end))))continue;
  if(spec.id==='certificate_labeled')value=value.replace(/[）)\]]+$/u,'');
  if(['certificate_labeled','parcel'].includes(spec.id)&&out.some(c=>c.kind==='证照/许可证号'&&start<c.end&&start+value.length>c.start))continue;
  addCandidate(out,text,start,start+value.length,spec.kind,'REF41-'+spec.id,confidence,spec.type);
 }
}
}
function urlsAndOcrEmail(text:string,out:ReferenceCandidate[]){
 const email=/(?:电子邮[\u4e00-\u9fa5]|邮箱|E-?mail)[：:，,、\s]*([A-Z0-9._%+-](?:[A-Z0-9._%+\- ]{0,80}[A-Z0-9_%+-])?[ \t]*@[ \t]*[A-Z0-9-](?:[A-Z0-9.\- ]{0,80}[A-Z0-9-])?[ \t]*\.[ \t]*(?:[A-Z]{2,10}(?:[ \t]+[A-Z](?![A-Z])){0,8}|[A-Z](?:[ \t]+[A-Z](?![A-Z])){1,9}))(?![A-Z])/giu;
 if(text.includes('@')) for(const m of text.matchAll(email)){const raw=m[1],value=raw.trim(),start=m.index+m[0].lastIndexOf(raw)+raw.length-raw.trimStart().length;if(!/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/iu.test(value.replace(/\s/gu,'')))continue;addCandidate(out,text,start,start+value.length,'邮箱','REF41-email_ocr',.9,'email');}
 detectLinearEmail(text,out);
 if(!text.includes('.'))return;
 const candidates:ReferenceCandidate[]=[];
 for(const [index,confidence,label]of [[0,.995,'protocol'],[1,.99,'www'],[2,.97,'labeled-domain']] as const){const p=ruleData.regexLiterals.filter(p=>p.line===570)[index],re=new RegExp(p.source,p.flags);for(const m of text.matchAll(re)){const value0=index===0?m[0]:index===2?m[1]:index===1?m[2]:m[0].slice(m[1].length);let value=value0.replace(/[，。；、！？,.；;!！?？：:]+$/u,'');while(/[)）\]】]$/u.test(value)&&((value.match(/[)）\]】]/gu)?.length??0)>(value.match(/[(（\[【]/gu)?.length??0)))value=value.slice(0,-1);const start=m.index+m[0].lastIndexOf(value0);if(text[start-1]==='@')continue;try{const normalized=value.replace(/^(https?)：/iu,'$1:').replace(/^(https?:)[/／]{2}/iu,'$1//');const url=new URL(/^https?:\/\//iu.test(normalized)?normalized:'https://'+normalized);if(!url.hostname.includes('.')||url.port&&(+url.port<1||+url.port>65535))continue;addCandidate(candidates,text,start,start+value.length,'网址','REF41-url-'+label,confidence,'website_url');}catch{continue;}}}
 for(const b of linearBareDomains(text))addCandidate(candidates,text,b.start,b.end,'网址','REF41-url-bare-domain',.9,'website_url');
 candidates.sort((a,b)=>a.start-b.start||b.end-a.end||b.confidence-a.confidence);out.push(...candidates.filter((c,i)=>!candidates.slice(0,i).some(p=>c.start<p.end&&c.end>p.start)));
}
const amountSpecs = [
 [2028,'label',1,.93],[2037,'label',1,.93],[2044,'currency',0,.92],[2049,'currency',0,.92],[2054,'currency',0,.92],[2059,'uppercase',0,.91],[2066,'standalone',1,.82],[2071,'uppercase',1,.91],[2078,'currency',1,.9],[2083,'table_summary',1,.84],[2089,'labeled_bare_number',1,.88],[2096,'post_yuan_bare_number',1,.89],[2103,'conversation_payment',1,.89],[2111,'standalone_yuan',1,.8],[2118,'per_share_price',1,.92],[2124,'thousand_sep',1,.85],[2129,'standalone_uppercase',1,.82],
] as const;
const chineseAmountUnits=/[百千万亿佰仟萬億拾]/u;
function* standaloneAmountMatches(text:string,pattern:RegExp){
 // The source suffix can fail after a long number. Try it once per numeric run,
 // preserving the original pattern instead of retrying at every interior digit.
 const runs=/\d(?:[\d,，.]|\s+(?=[\d,，.]))*/g;
 const anchored=new RegExp(pattern.source,pattern.flags.replace('g','y'));
 for(let run; (run=runs.exec(text));){
  let start=run.index;
  if(/[零一二三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖]/u.test(text[start-1]??'')){
   const next=run[0].slice(1).search(/\d/u);if(next<0)continue;start+=next+1;
  }
  anchored.lastIndex=start;const match=anchored.exec(text);
  if(match){runs.lastIndex=Math.max(runs.lastIndex,anchored.lastIndex);yield match;}
 }
}
function amountExcluded(text:string,value:string,start:number,end:number,branch:string){const compact=value.replace(/\s/gu,''),before=text.slice(Math.max(0,start-20),start),after=text.slice(end,end+20),b=before.replace(/[ \t\u00a0\u3000]/gu,''),a=after.replace(/[ \t\u00a0\u3000]/gu,''),currency=/[¥￥]|人民币|RMB|CNY|元|圆/u.test(compact),unit=currency||/[万萬亿億]/u.test(compact),moneyContext=/(?:合同(?:价款|金额)|价款|金额|总价|单价|售价|交易对价|补偿款|赔偿款|租金|费用|余额|本金|借款)[：:为]?$/u.test(b)||/^(?:元|圆|人民币|RMB|CNY|[¥￥])/u.test(a);
 if(!currency&&(/(?:百分之|千分之|万分之|十分之)$/u.test(b)||/^(?:[%％‰‱]|(?:个)?(?:百分点|千分点|万分点|基点)|(?:bp|bps)\b|成(?:半|[零一二三四五六七八九十\d])?|折|倍)/iu.test(a)||/^(?:[：:／/]|比)\d/u.test(a)||/\d(?:[：:／/]|比)$/u.test(b)))return true;
 if(!unit&&/^\d+(?:\.\d+){2,}$/u.test(compact))return true;
 if(!unit&&/^(?:\d+\.\d+|\d{1,3})$/u.test(compact)&&(/(?:^|[^\d])\d+(?:\.\d+)?(?:天|日|个月|月|年|期|条|款)(?:[^\d]|$)/u.test(before+compact+after)||/利率|年利率|月利率|日利率|LPR|罚息|逾期利息|利息/u.test(before+compact+after)))return true;
 if(!unit&&/^\d{4}$/u.test(compact)&&/年|月|日|期限|期间|届满|到期|截止|起至|自|至/u.test(before+after))return true;
 if(!unit&&/label|labeled_bare_number|post_yuan_bare_number|table_summary/u.test(branch)&&/借款期限|期限|期间|利率|年利率|月利率|日利率|本合同所称|系指/u.test(before+after))return true;
 return branch==='thousand_sep'&&!unit&&!moneyContext&&(/(?:(?:房屋建筑|房屋|建筑|建筑物|宗地|土地|占地|用地|使用|套内|产权|规划|计容|实测|预测|租赁|出租|总)?面积)(?:合计|总计)?[：:为]?$/u.test(b)||/^(?:平方米|平方公尺|平方英尺|平方呎|平米|㎡|亩|公顷|m(?:²|2)?|ft(?:²|2)?|sq\.?(?:m|ft))/iu.test(a));
}
export function detectReferenceAmounts(text:string):ReferenceCandidate[]{const out:ReferenceCandidate[]=[];
 const submit=(raw:string,start:number,branch:string,confidence:number)=>{let value=raw.trim();start+=raw.length-raw.trimStart().length;if(!value)return;const parenthesis=value.match(/[ \t]*[（(][^）)\n]{0,60}[）)]$/u)?.[0];if(parenthesis&&/%|％|‰|‱|百分之|千分之|万分之|成|折|倍|分之|基点|bps?/iu.test(parenthesis)){value=value.slice(0,-parenthesis.length).trimEnd();if(!value)return;}
  let end=start+value.length;if(!/(?:元|圆|万|亿|角|分)(?:整|正)?$/u.test(value)){const next=text.slice(end,end+12);if(/^\s*(?:(?:千|万|亿)\s*)?股(?:份|票)?|^\s*份/u.test(next)||/^\s*(?:(?:万|亿)\s*)?(?:平方米|平方公尺|平方英尺|平方呎|平米|㎡|亩|公顷|m(?:²|2)?|ft(?:²|2)?|sq\.?(?:m|ft))/iu.test(next))return;const extend=next.match(/^\s*(?:亿元|万元|亿|万|元(?:整|正)?)/u)?.[0];if(extend){value+=extend;end+=extend.length;}}
  if(amountExcluded(text,value,start,end,branch)||out.some(c=>start<c.end&&end>c.start))return;addCandidate(out,text,start,end,'金额','AMOUNT-'+branch,confidence,'contract_amount');
 };
 for(const [line,branch,group,confidence]of amountSpecs)for(const m of line===2066?standaloneAmountMatches(text,migratedPattern(line)):text.matchAll(migratedPattern(line))){const value=m[group];if(!value)continue;const start=m.index+(group?m[0].lastIndexOf(value):0),compact=value.replace(/\s/gu,'');if([2028,2044,2049].includes(line)&&digits(value).length<2||[2037,2071,2129].includes(line)&&/[一二三四五六七八九十]/u.test(value)&&!chineseAmountUnits.test(value)||line===2037&&!chineseAmountUnits.test(value)||line===2078&&digits(value).length<3||line===2103&&!/[¥￥]|万|千|百|元|块/u.test(compact)&&digits(compact).length<3||line===2124&&digits(value).length<4)continue;
  if(line===2059&&!/[¥￥]|RMB|CNY|人民币|合同(?:价款|金额)|工程(?:造价|价款)|结算金额/u.test(text.slice(Math.max(0,start-100),start)))continue;
  if([2089,2096].includes(line)&&/税率/u.test(text.slice(Math.max(0,start-18),start)))continue;
  if(line===2028&&/\r?\n/u.test(m[0].slice(0,m[0].length-value.length))&&/(?:利息|逾期利息|罚息|本金|欠款|货款|损失)(?:金额)?[：: \t]*(?:\r?\n[ \t]*){1,3}$/u.test(m[0].slice(0,m[0].length-value.length))&&!/金额|人民币|RMB|CNY|[¥￥]|元|圆|万|萬|亿|億/iu.test(m[0]))continue;
  const uppercase=value.match(/[（(][^）)]*?([壹贰叁肆伍陆柒捌玖零拾百佰千仟万萬亿億]{2,}(?:元(?:圆整|整|正)?|圆(?:整|正)))[^）)]*[）)]/u);if(/\d/u.test(value)&&uppercase?.[1]){const before=value.slice(0,uppercase.index).replace(/[\s，,、；;：:]+$/u,'');if(digits(before))submit(before,start,branch,confidence);submit(uppercase[1],start+value.indexOf(uppercase[1]),'uppercase',Math.max(confidence,.91));}else submit(value,start,branch,confidence);
 }return out;
}
function international(text:string,out:ReferenceCandidate[]){
 const ein=/\b(?:EIN|Employer\s+Identification\s+(?:Number|No\.?)|Tax\s+ID)(?:\s*(?:No\.?|Number|#))?\s*[:#]?\s*(\d{2}-\d{7})\b/giu;
 for(const m of text.matchAll(ein)){const start=m.index+m[0].lastIndexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'雇主识别号','INT-ein',.88,'ein');}
 const passport=/\bpassport(?:\s*(?:no|number|num|#|id|no\.)?)?\s*[:#\s]\s*([A-Za-z]{1,2}\d{6,9}|\d{8,9})\b/giu;
 for(const m of text.matchAll(passport)){const start=m.index+m[0].lastIndexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'护照号','INT-passport',/^\d+$/u.test(m[1])?.82:.88,'passport');}
 const national=/\b(?:national\s+(?:id|identification)|identity\s+card|id\s+card|citizen\s+id|personal\s+id|identification\s+(?:no|number)|id\s+(?:no|number))(?:\s+(?:no|number|num)\.?)?\.?\s*[:#]?\s*/giu;
 for(const m of text.matchAll(national)){if(/(?:contract|agreement|order|invoice|reference|account|document|case|tax|employer)\s+$/iu.test(text.slice(Math.max(0,m.index-24),m.index)))continue;const start=m.index+m[0].length,raw=text.slice(start,start+48).match(/^([A-Za-z0-9][A-Za-z0-9-]*(?:[ \t\r\n]+[A-Za-z0-9-]+){0,5})/u)?.[1];if(!raw)continue;const groups:string[]=[];for(const g of raw.trim().split(/\s+/u)){if(groups.length&&!/^\d[\d-]*$/u.test(g)||([...groups,g].join('').replace(/-/gu,'').length)>20)break;groups.push(g);}const value=groups.join(' '),compact=value.replace(/[\s-]/gu,'');if(compact.length<6||compact.length>20||!/[0-9]/u.test(compact)||/^(.)\1+$/u.test(compact)||/^(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])$/u.test(compact))continue;
  // Original whitespace is retained; normalized grouping must never move the end offset.
  const original=text.slice(start).match(new RegExp('^'+groups.map(g=>g.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&')).join('[ \\t\\r\\n]+'),'u'))?.[0];if(original)addCandidate(out,text,start,start+original.length,'国际身份证号','INT-national-id',.86,'international_id');
 }
 const phone=/(?<![A-Za-z0-9_+-])(\+?\d{1,3}[\s.-]?\(?\d{1,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?:[\s.-]?\d{1,4})?|\(\d{3}\)\s*\d{3,4}[\s.-]?\d{4}|\d{3}[\s.-]\d{3}[\s.-]\d{4})(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?/gu;
 for(const m of text.matchAll(phone)){const value=m[1],numeric=digits(value),plus=value.startsWith('+'),labeled=/(?:phone|telephone|tel\.?|mobile|fax|facsimile|contact(?:\s+number)?|电话|联系电话|手机|传真)\s*[:#：]?\s*$/iu.test(text.slice(Math.max(0,m.index-32),m.index));if(numeric.length<7||numeric.length>15||!plus&&value.includes('.')&&(!/^\(?\d{3}\)?\.\d{3}\.\d{4}$/u.test(value)||!labeled)||!plus&&numeric.length===11&&/^1[3-9]/u.test(numeric)||/^\d{2}-\d{7,8}$/u.test(value)||!plus&&!/[()\s.-]/u.test(value)&&(numeric.length===9||numeric.length>=12)||!plus&&/^\d{10}$/u.test(value)&&!labeled)continue;addCandidate(out,text,m.index,m.index+value.length,plus?'手机号':'固定电话','INT-phone',.85,plus?'mobile':'landline');}
}
const formKind:Record<string,ReferenceKind>={name_cn:'姓名',org_name:'机构',address:'地址',id_card:'身份证号',phone:'固定电话',bank_card:'银行账号',uscc:'信用代码',contract_amount:'金额'};
export function referenceSceneSignals(text:string){const formLabels=['姓名','性别','民族','出生日期','身份证号','户籍地址','调查人','申请人','当事人','工作单位','联系电话','营业执照','注册号','开户行','账号','银行帐号','金额','发票抬头','纳税人名称','合同联系人','银行账号'];return {form:formLabels.filter(l=>text.includes(l)).length>=3,transaction:/微信支付|支付宝|转账|收款|付款|交易|订单|商户|商家|余额|零钱|账单|社会保险|参保证明|社保电脑号|参保人姓名|缴费明细/u.test(text)};}
function formAndTransactions(text:string,out:ReferenceCandidate[]){const {form,transaction}=referenceSceneSignals(text);if(!form&&!transaction)return;
 if(form)for(const field of ruleData.formFields){const re=new RegExp(field.label.source,field.label.flags);for(const m of text.matchAll(re)){let start=m.index+m[0].length,raw=text.slice(start,start+field.maxLength).split(/[\n\r\t]/u)[0],value=raw.trim();start+=raw.length-raw.trimStart().length;if(value.length<2)continue;let kind=formKind[field.type];if(!kind)throw new Error('REFERENCE_KIND_MISSING:'+field.type);
  if(field.type==='name_cn'){value=value.match(/^[\u4e00-\u9fa5·]+/u)?.[0]??'';if(value.length<2)continue;}
  if(field.type==='org_name'&&!/公司|单位|律师事务所|法院|检察院|机关|部门|中心|协会|银行|学校|便利店|超市|商城|商店|专卖店|连锁店|会员店|会员商店|商行|店铺/u.test(value))continue;
  if(field.type==='address'){const cleaned=cleanAddress(text,start,start+value.length);value=cleaned.value;start=cleaned.start;if(value.length<6)continue;}
  if(field.type==='bank_card'){const compact=normalizeDigits(value),numeric=digits(compact);if(numeric.length<8||numeric.length>25||numeric.length/compact.length<.5)continue;}
  if(field.type==='phone'&&/^1[3-9]\d{9}$/u.test(digits(value)))kind='手机号';
  addCandidate(out,text,start,start+value.length,kind,'SCENE-form-'+field.type,.95,field.type);
 }}
 if(!transaction)return;
 const merchant=/(?<![向因被由经对给为从至到在于与和及同跟本该某])([\u4e00-\u9fa5（）()]{2,30}(?:有限责任公司|股份有限公司|有限公司|集团有限公司|集团公司|股份公司|联营公司|连锁便利店|连锁超市|会员商店|会员店|专卖店|旗舰店|便利店|超市|商城|商店|商行|店铺|店|支付|银行|商业银行|农村商业银行|律师事务所|法律服务所|会计师事务所|学院|大学|研究院|研究所|基金会|协会|医院|中心))/gu;
 for(const m of text.matchAll(merchant)){const value=m[1];if(/^(?:本|该|某|一|二|三)|(?:等|及|和|与|或)$|^(?:微信|支付宝|银联|云闪付)$|^(?:如|若|假如|倘若|当).*(?:银行|支付)|^(?:国内|国外|境内|境外|省内|省外|市内)(?:支付|银行|转账)$/u.test(value))continue;addCandidate(out,text,m.index,m.index+value.length,'机构','SCENE-transaction-merchant',/有限公司|股份公司|集团公司/u.test(value)?.92:/连锁|会员|专卖|旗舰/u.test(value)?.85:/便利店|超市|商城/u.test(value)?.78:.75,'org_name');}
 const truncated=/([\u4e00-\u9fa5]{6,20}(?:科技|能源|通信|网络|信息|技术|智能|数据|软件|电子|传媒|文化|教育|医疗|金融|投资|贸易|物流|建筑|装饰|设计|咨询|管理|服务))(?:\.{2,}|…)/gu;
 for(const m of text.matchAll(truncated))if(!out.some(c=>c.kind==='机构'&&Math.abs(c.start-m.index)<5))addCandidate(out,text,m.index,m.index+m[0].length,'机构','SCENE-transaction-truncated-company',.85,'org_name');
 const persons=[/(?:微信红包|红包)-来自([^\-\n\s\.]{2,10})(?:[-\n\s\.]|$)/gu,/(?:扫二维码付款|转账|付款)-(?:转)?给([^\-\n\s\.]{2,10})(?:[-\n\s\.]|$)/gu,/(?:转账|红包|付款)给([^\-\n\s\.]{2,10})(?:[-\n\s\.]|$)/gu,/收款来自([^\-\n\s\.]{2,10})(?:[-\n\s\.]|$)/gu,/([^\n\s]{2,10})发了一个红包/gu,/([^\n\s]{2,10})发起转账/gu];
 for(const re of persons)for(const m of text.matchAll(re)){const value=m[1];if(/^(?:本人|自己|我|您|他|她|对方|商家|店铺|卖家|买家)$|[0-9]{2,}|^(?:微信|支付宝|银联|云闪付)|(?:有限公司|便利店|超市|商店)$/u.test(value)||! /^[\u4e00-\u9fa5a-zA-Z·]{2,10}$/u.test(value))continue;const start=m.index+m[0].indexOf(value);addCandidate(out,text,start,start+value.length,'姓名','SCENE-transaction-name',.88,'name_cn');}
 for(const m of text.matchAll(/(?:参保人姓名|姓\s*名)(?:[：:\s]+)([\u4e00-\u9fa5]{2,4})(?:\s|\n|$)/gu)){const start=m.index+m[0].indexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'姓名','SCENE-social-insurance-name',.92,'name_cn');}
 for(const m of text.matchAll(/(?:社保电脑号|社保号|电脑号)(?:[：:\s]+)(\d{9})(?:\s|\n|$)/gu)){const start=m.index+m[0].indexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'社保号','SCENE-social-insurance-number',.95,'social_security_number');}
 for(const m of text.matchAll(/(\d{8})\s*[/／]\s*\n?\s*([\u4e00-\u9fa5（）()]{5,40}(?:有限责任公司|股份有限公司|有限公司|集团有限公司|集团公司|会员商店有限公司|技术有限公司|科技有限公司|产业.*?集团有限公司))/gu)){if(m[2].length>40)continue;const start=m.index+m[0].indexOf(m[2]);addCandidate(out,text,start,start+m[2].length,'机构','SCENE-social-insurance-company',.9,'org_name');}
}
function receipt(text:string,out:ReferenceCandidate[],screenshot=false){if(!text.includes('微信号')&&!screenshot)return;if([/申请方|申请时间|申请人/u.test(text),/转账|支付|电子凭证|交易记录/u.test(text),/收款方|付款方|转账对方|对方微信号/u.test(text)].filter(Boolean).length<2)return;
 const noise=/申请|收款|付款|转账|微信|支付|时间|明细|记录|场景|说明|状态|金额|方式|类型|单号|时段|具体|交易|证明|对方|信息|修改|涂改|参考|账户/u;
 for(const m of text.matchAll(/(付款方|收款方|申请方|申请人|转账对方)(?:姓名)?(?:微信号)?([A-Za-z0-9_*-]{5,20})(?:姓名)?([\u4e00-\u9fa5·]{2,4})(?=收款方|付款方|申请方|转账对方|交易|元|说明|状态|时间|$)/gu)){if(noise.test(m[3])||/^\d+$/u.test(m[2])||!/[A-Za-z0-9]/u.test(m[2]))continue;const ws=m.index+m[0].indexOf(m[2]),ns=m.index+m[0].lastIndexOf(m[3]);addCandidate(out,text,ws,ws+m[2].length,'微信号','SCENE-receipt-wechat-pair',.95,'wechat_id');addCandidate(out,text,ns,ns+m[3].length,'姓名','SCENE-receipt-name-pair',.95,'name_cn');}
 for(const m of text.matchAll(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})([\u4e00-\u9fa5·]{2,4})/gu)){if(noise.test(m[2]))continue;const start=m.index+m[0].lastIndexOf(m[2]);addCandidate(out,text,start,start+m[2].length,'姓名','SCENE-receipt-timestamp-name',.85,'name_cn');}
 for(const m of text.matchAll(/(__[A-Za-z0-9_-]{3,18}__|[a-z][a-z*]{4,18}[a-z]{1,2})/gu)){const value=m[1];if(!/[A-Za-z0-9]/u.test(value)||!value.startsWith('__')&&!value.includes('*'))continue;addCandidate(out,text,m.index,m.index+value.length,'微信号','SCENE-receipt-standalone-wechat',.95,'wechat_id');}
}
export type ReferenceDocumentClassification={type:NonNullable<ReferenceOptions['documentType']>;confidence:number;scores:Record<NonNullable<ReferenceOptions['documentType']>,number>};
export function classifyReferenceDocumentDetail(text:string,filename=''):ReferenceDocumentClassification{
 const score:ReferenceDocumentClassification['scores']={complaint:0,reply:0,judgment:0,contract:0,official_letter:0,other:1};
 for(const [kind,patterns]of Object.entries(ruleData.documentScores))for(const p of patterns)score[kind as keyof typeof score]+=p.weight*(text.match(new RegExp(p.source,p.flags))?.length??0);
 const requests=text.match(/请求.*?人民法院/gu)?.length??0,contextRequests=text.match(/(?:当事人|根据[^。]{0,20})的?请求[^。]{0,50}人民法院/gu)?.length??0;score.complaint+=5*Math.max(0,requests-contextRequests);
 let filenameType:ReferenceDocumentClassification['type']|undefined,filenameBoost=0;
 const title=filename.replace(/\.(docx?|pdf)$/iu,'');
 if(title){
  if(/起诉状|申请书/u.test(title)){filenameType='complaint';filenameBoost=30;}
  else if(/(?:讯问|询问|辨认|勘验|检查|搜查|庭审|调查|谈话|听证|调解|实验文本)?笔录/u.test(title)&&!/判决书|裁定书|调解书|裁判文书/u.test(title)){filenameType='complaint';filenameBoost=35;}
  else if(/答辩状/u.test(title)){filenameType='reply';filenameBoost=30;}
  else if(!/判决书|裁定书|裁判文书/u.test(title)&&/反诉状|申请执行书|申请财产保全|申请证人出庭|代理词|证据目录|证据清单|人身安全保护令|保护令|撤销之诉/u.test(title)){filenameType='complaint';filenameBoost=30;}
  else if(/判决书|裁定书|裁判文书|[（(]20\d{2}[)）].*?[民刑行].*?[终申再初辖抗]|[（(]20\d{2}[)）].*?(民|刑|行|知|商|破).*?号|__20\d{2}_.*?[刑民行].*?[初终申再辖抗]?\d+号|_(?:刑初|刑终|刑申|刑再|刑抗)\d+号/u.test(title)){filenameType='judgment';filenameBoost=30;}
  else if(/合同|协议/u.test(title)&&!/服务协议|用户协议|许可协议|纠纷(?:案|案件)?|判决|裁定|裁判文书/u.test(title)){filenameType='contract';filenameBoost=30;}
  else if(/所函|律师函|律师事务所函|公函|检察院函|法院函|通知书|决定书|清单|工作证明|任命通知|调取证据通知书|证据移送清单/u.test(title)&&!/监理合同/u.test(title)||/公证书|尽职调查报告/u.test(title)){filenameType='official_letter';filenameBoost=30;}
  else if(/法律意见书/u.test(title)){filenameType='contract';filenameBoost=30;}
  else if(/辩护词/u.test(title)){filenameType='reply';filenameBoost=30;}
  else if(/仲裁申请书|强制执行申请书|财产保全申请书/u.test(title)){filenameType='complaint';filenameBoost=25;}
  else if(/刑事起诉书/u.test(title)){filenameType='complaint';filenameBoost=30;}
  else if(/民事起诉状|民事上诉状|民事答辩状|刑事上诉状/u.test(title)){filenameType=/答辩状/u.test(title)?'reply':'complaint';filenameBoost=30;}
 }
 const first1000=text.slice(0,1000),first1600=text.slice(0,1600),legalDocument=/人民法院|本院认为|判决如下|裁定如下|审判员|书记员/u.test(text);
 if(/^(?:\s*)?(用户许可协议|软件许可协议|服务协议|用户协议|使用协议|授权协议)\s*$/mu.test(first1000)&&!legalDocument&&filenameType!=='judgment')return {type:'other',confidence:.9,scores:{complaint:0,reply:0,judgment:0,contract:0,official_letter:0,other:10}};
 const numberHeader=/[\u4e00-\u9fa5]{1,12}〔20\d{2}〕\d{1,6}号/u.test(first1600),officialTitle=/(?:关于.{1,100}(?:通知|通告|公告|确认函|函|意见|决定)|(?:人事)?任命通知|工作证明|在职证明|情况说明|告知书|通报)/u.test(first1600),organizationHeader=/^\s*[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,60}(?:人民政府|委员会|商务局|教育局|发展和改革委员会|有限责任公司|股份有限公司|有限公司|集团有限公司|集团|银行)(?:办公室)?(?:文件)?/u.test(first1600),recipients=/(?:各[\u4e00-\u9fa5、，,]{1,40}|[\u4e00-\u9fa5A-Za-z0-9（）()·]{2,40}(?:项目部|分行|部门|单位|企业))[：:]/u.test(first1600),officialShape=numberHeader&&(officialTitle||organizationHeader)||officialTitle&&organizationHeader||/^(?:工作证明|在职证明)[\s\n]/u.test(first1600);
 score.official_letter+=(numberHeader?10:0)+(officialTitle?8:0)+(organizationHeader?5:0)+(recipients?3:0);
 if(filenameType)score[filenameType]+=filenameBoost;
 const {complaint:c,reply:r,judgment:j,contract:k,official_letter:o}=score,total=Math.max(1,Object.values(score).reduce((a,b)=>a+b,0)),maximum=Math.max(...Object.values(score));
 const prosecutor=/人民检察院.*?(?:起\s*诉\s*书|公\s*诉)/u.test(text),judgmentReasons=(text.match(/本院认为|判决如下|裁定如下|依照.*?规定|经审理查明/gu)?.length??0)>=2,judgmentTitle=/(?:民事|刑事|行政|商事)?(?:判决书|裁定书|调解书)/u.test(text.slice(0,600))&&(text.match(/原告|被告|上诉人|被上诉人|申请人|被申请人/gu)?.length??0)>=2;
 const transcriptTitle=/(?:^|[\r\n])\s*(?:第[一二三四五六七八九十\d]+次)?(?:讯问|询问|辨认|勘验|检查|搜查|庭审|调查|谈话|听证|调解)?笔录(?:\s|$)/mu.test(first1600),transcriptContext=[/(?:^|[\r\n])\s*(?:问|答)[：:]/mu,/(?:讯问|询问|记录)人[：:]/u,/被讯问人|被询问人|犯罪嫌疑人/u,/讯问时间|询问时间|开始时间|结束时间|讯问地点|询问地点/u].filter(p=>p.test(first1600)).length,transcript=filenameType==='complaint'&&/笔录/u.test(filename)||transcriptTitle&&transcriptContext>=2;
 let type:ReferenceDocumentClassification['type']='other';
 if(j>=15&&judgmentReasons&&!prosecutor)type='judgment';
 else if(j>=10&&judgmentReasons&&!prosecutor){if(j>=k&&j>=c)type='judgment';}
 else if(filenameType==='judgment'&&judgmentReasons&&j>=5||j>=10&&judgmentReasons&&c<.5*j||judgmentTitle&&j>=5&&!prosecutor&&j>=.5*c&&j>=k)type='judgment';
 else if(transcript)type='complaint';
 else if(filenameType==='official_letter'||(o>=12||o>=8&&officialShape)&&o>1.5*j&&o>1.2*k&&c<.6*o&&!prosecutor&&!['contract','complaint','reply','judgment'].includes(filenameType??''))type='official_letter';
 else if(c>=8){if(prosecutor||c>1.2*j||j>c&&!judgmentReasons)type='complaint';}
 else if(j>=6&&judgmentReasons&&j>c)type='judgment';
 else if(r>=3){if(r>.6*j||/答辩状|答辩人|答辩称/u.test(text))type='reply';}
 else if(k>=5&&(k>1.5*j||/协议书|财产.*?协议|许可协议/u.test(text)))type='contract';
 else if(j>5&&judgmentReasons&&!prosecutor)type='judgment';
 else if(o>6&&/律师事务所函|律函字第|特此函告|检察院函|法院函/u.test(text))type='official_letter';
 else if(c>3&&/具状人|起诉状|诉讼请求/u.test(text))type='complaint';
 else if(r>3&&/答辩状|答辩人|答辩称/u.test(text))type='reply';
 else if(k>j&&/甲方|乙方|协议书/u.test(text))type='contract';
 let forcedJudgment=false,forcedContract=false;
 if(filenameType==='judgment'&&type!=='judgment'){type='judgment';forcedJudgment=true;}
 if(filenameType==='official_letter'&&filenameBoost>=25&&type!=='official_letter'&&j<20)type='official_letter';
 if(filenameType==='reply'&&filenameBoost>=25&&type!=='reply'&&(j<20||/答辩状|辩护词/u.test(filename)&&!/判决书|裁定书|调解书|裁判文书/u.test(filename)))type='reply';
 if(filenameType==='complaint'&&filenameBoost>=25&&type!=='complaint'&&(j<20||/起诉状|上诉状|申请书|仲裁申请书|强制执行申请书|财产保全申请书|刑事起诉书|笔录/u.test(filename)&&!/判决书|裁定书|调解书|裁判文书/u.test(filename)))type='complaint';
 if(filenameType==='contract'&&filenameBoost>=25&&type!=='contract'&&(j<20||/法律意见书|核查意见|财务顾问报告/u.test(filename))){type='contract';forcedContract=true;}
 if(/证券代码[：:\s]*\d{6}/u.test(first1600)&&/公告编号|证券简称|股票简称/u.test(first1600)||/股份有限公司/u.test(first1600)&&/深圳证券交易所|上海证券交易所|自律监管指引|独立董事|审计委员会|本公司及董事会|信息披露义务人|述职报告|监督职责/u.test(first1600))type='contract';
 let confidence=maximum/total;confidence=maximum>=30?Math.min(.98,1.1*confidence):maximum>=20?Math.min(.92,1.05*confidence):maximum>=10?Math.min(.85,confidence):maximum>=5?Math.min(.75,.95*confidence):Math.min(.65,.9*confidence);if(forcedJudgment)confidence=Math.max(confidence,.72);if(forcedContract&&type==='contract')confidence=Math.max(confidence,.72);if(filenameType==='judgment'&&type==='judgment')confidence=Math.max(confidence,.78);return {type,confidence:Math.max(0,Math.min(1,confidence)),scores:score};
}
export function classifyReferenceDocument(text:string,filename=''){return classifyReferenceDocumentDetail(text,filename).type;}
function explicitAndOfficial(text:string,out:ReferenceCandidate[],official:boolean){
 const name=/(?:姓名|联系人|联络人|法定代表人|负责人|经办人|收件人|受送达人|送达人|收货人|开户人|户名|签字人|签署人)[：:]\s*([\u4e00-\u9fa5·]{2,4})(?=律师|先生|女士|经理|主任|同志|教授|医生|法官|检察官|$|[\s，,。；;、）)])/gu;
 for(const m of text.matchAll(name)){if(!validReferenceName(m[1]))continue;const start=m.index+m[0].lastIndexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'姓名','SCENE-explicit-name',.96,'name_cn');}
 const org=/(?:单位名称|公司名称|机构名称|工作单位|任职单位|用人单位|所属单位|发文机关)[：:]\s*([\u4e00-\u9fa5A-Za-z0-9（）()·]{3,50})(?=$|[\s，,。；;])/gu;
 for(const m of text.matchAll(org)){if(!validReferenceOrganization(m[1],.96,'general-explicit-org'))continue;const start=m.index+m[0].lastIndexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'机构','SCENE-explicit-org',.96,'org_name');}
 if(!official)return;
 const groups:[string[],number,string][]=[[['签发人','审批人','批准人','负责人','经办人'],.9,'signer'],[['抄送','主送','报送'],.85,'recipient'],[['签字','被通知人','当事人','经办人签字','制表人'],.88,'signatory']];
 for(const [labels,confidence,id]of groups){const re=new RegExp('(?:'+labels.join('|')+')[：: \\t]*([\\u4e00-\\u9fa5]{2,4})(?=律师|先生|女士|同志|$|[\\s，,。；;、）)])','gu');for(const m of text.matchAll(re)){if(!validReferenceName(m[1],true))continue;const start=m.index+m[0].lastIndexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'姓名','OFFICIAL-'+id,confidence,'name_cn');}}
 const subject=/兹(?:证明|介绍)([\u4e00-\u9fa5]{2,4}?)(?=先生|女士|同志|同学|，|,|身份证|现任|系)/gu;
 for(const m of text.matchAll(subject)){if(!validReferenceName(m[1],true))continue;const start=m.index+m[0].indexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'姓名','OFFICIAL-cert-subject',.96,'name_cn');}
 const orgTail='(?:有限责任公司|股份有限公司|有限公司|集团有限公司|集团|银行|人民政府|发展和改革委员会|委员会|商务局|教育局|人民检察院|检察院|公安局分局|公安局|法院|办公室)';
 const officialOrgSpecs:[RegExp,number,string][]=[[new RegExp('^([\\u4e00-\\u9fa5A-Za-z0-9（）()·]{2,60}?'+orgTail+')(?=(?:办公室)?(?:文件)?[\\u4e00-\\u9fa5]{1,12}〔20\\d{2}〕\\d{1,6}号|关于|人事任命通知)','gu'),.98,'header-org'],[new RegExp('([\\u4e00-\\u9fa5A-Za-z0-9（）()·]{2,60}?'+orgTail+')(?=(?:工程管理部|行政人事部|办公室)?20\\d{2}年\\d{2}月\\d{2}日)','gu'),.97,'footer-org'],[/([\u4e00-\u9fa5A-Za-z0-9（）()·]{3,60}(?:人民检察院|检察院|公安局分局|公安局|人民法院|法院|银行(?:[\u4e00-\u9fa5]{0,12}(?:分行|支行))?))(?=：)/gu,.96,'recipient-org']];
 for(const [re,confidence,id]of officialOrgSpecs)for(const m of text.matchAll(re)){let value=m[1];if(id==='recipient-org')value=value.replace(/^.*?(?:证据移送清单|调取证据通知书|立案决定书|通知书|决定书)/u,'');const start=m.index+m[0].lastIndexOf(value);addCandidate(out,text,start,start+value.length,'机构','OFFICIAL-'+id,confidence,'org_name');}
 const staff=/(?:行政人事部|制表人|复核人|审核)[：:]([\u4e00-\u9fa5]{2,4}|姓名\d+)(?=审核|复核|20\d{2}年|印发|$)/gu;
 for(const m of text.matchAll(staff)){if(!/^姓名\d+$/u.test(m[1])&&!validReferenceName(m[1],true))continue;const start=m.index+m[0].lastIndexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'姓名','OFFICIAL-staff-name',.95,'name_cn');}
 const casePersons=[/(?:本院在侦查|我局办理的|你院交办\/我局办理的)([\u4e00-\u9fa5]{2,4}|姓名\d+)(?=涉嫌)/gu,/犯罪嫌疑人([\u4e00-\u9fa5]{2,4}|姓名\d+)(?=[（(]|身份证|自20|，|,)/gu,/(?:收到[\u4e00-\u9fa5]{2,4}报案\))([\u4e00-\u9fa5]{2,4}|姓名\d+)(?=涉嫌)/gu];
 for(const re of casePersons)for(const m of text.matchAll(re)){const start=m.index+m[0].lastIndexOf(m[1]);addCandidate(out,text,start,start+m[1].length,'姓名','OFFICIAL-case-person',.96,'name_cn');}
 for(const m of text.matchAll(/机构\d+(?:有限公司|公司|银行|法院|检察院|公安局|委员会)?/gu))addCandidate(out,text,m.index,m.index+m[0].length,'机构','OFFICIAL-placeholder-org',.95,'org_name');
}
export function detectReferenceRules(text:string,options:ReferenceOptions={}):ReferenceCandidate[]{if(!text.isWellFormed())throw new Error('INVALID_TEXT');const out:ReferenceCandidate[]=[];if(options.sceneMode!=='only'){baseline(text,out);urlsAndOcrEmail(text,out);international(text,out);out.push(...detectReferenceAmounts(text));}if(options.sceneMode!=='off'){receipt(text,out,options.screenshot);formAndTransactions(text,out);}if(options.sceneMode!=='only')explicitAndOfficial(text,out,(options.documentType??classifyReferenceDocument(text,options.filename))==='official_letter');const result=new Map<string,ReferenceCandidate>();for(const c of out){const key=c.start+':'+c.end+':'+c.kind+':'+c.ruleId;if(!result.has(key))result.set(key,c);if(result.size>MAX_MARKS)throw new Error('MARK_LIMIT');}const offset=options.windowOffset??0;if(!Number.isSafeInteger(offset)||offset<0)throw new Error('REFERENCE_POSITION_INVALID');return [...result.values()].sort((a,b)=>a.start-b.start||a.end-b.end||a.ruleId.localeCompare(b.ruleId)).map(c=>({...c,start:c.start+offset,end:c.end+offset}));}
/** StrictName differs from the combined exact-name blacklist; regex-pattern YAML entries remain literal strings. */
export function isReferenceNameBlacklistedStrict(value:string){const names=combine(blacklistData.name_blacklist);if(names.has(value)||/交付房屋|单方委托|多处出现|全部诉讼|交付手续|交付违约|应当携带|继续履行|保修范围|保修期限|房屋贬值|房屋阳台|综合认定|任用前|任用中|任用终|安全要求|解其职责|高级职员|全体董事|会议以上|前述人士|公司改制|保密资料|构成相|开放相|不排除其|创始人有|材料|记录|诉讼|证明|提交/u.test(value)||/投资人|创始人|受益人|发起人|出资人|控制人|高级职员|全体董事|前述人士|会员/u.test(value))return true;for(const name of names)if(name.length>=2&&value.includes(name)&&/材料|出现|记录|提交|证明|诉讼|单方|问题|情况|安排|处置|综合认定|请求|主张|判决|裁定/u.test(name))return true;return false;}
export function isReferenceNoisyAddress(value:string){const v=value.trim();if(/^[\d\-\s+（）()]+$/u.test(v)&&/\d{4,}/u.test(v.replace(/[\-\s]/gu,''))||/^(?:上海|深圳|北京|香港)$/u.test(v)||/^[\u4e00-\u9fa5]{2,3}[省市]$/u.test(v)&&v.length<=3||/^(?:地址|住所|住所地|注册地|注册地址|通讯地址|联系地址|办公地址|居住地|所在地)$/u.test(v))return true;const lines=v.split(/\r?\n/u).map(l=>l.trim()).filter(Boolean),reports=/法律意见书|律师工作报告|尽职调查报告|审计报告|评估报告|招股说明书/u,address=/省|市|自治区|特别行政区|区|县|旗|乡|镇|村|社区|街道|路|街|巷|弄|胡同|大道|号|室|楼|栋|座/u;if(lines.length>1&&lines.slice(0,-1).some(l=>reports.test(l)||/(?:有限责任公司|股份有限公司|集团有限公司|集团公司|有限公司|律师事务所|会计师事务所|事务所|证券交易所|人民法院|人民检察院)$/u.test(l))&&lines.slice(1).some(l=>address.test(l)))return true;return v.length>=20&&reports.test(v)&&address.test(v);}
function noisyDirectName(v:string){return /(?:法律意见书|律师工作报告|尽职调查报告|审计报告|评估报告|招股说明书|(?:民事|刑事|行政|商事)?(?:判决书|裁定书|调解书|起诉状|答辩状|申请书)|授权委托书|讯问笔录|询问笔录|调查笔录|工作证明|在职证明)$/u.test(v)||/^(?:金融|科技|信息|数据|资产|资本|证券|保险|信托|互联网|电子商务)[\u4e00-\u9fa5]$/u.test(v)||/^(?:身份|法定|联系|经办|经手|代办|委托|代理|收款|付款|发货|收货|签收|承保|投保|开户|出纳|财务|会计|大智慧|东方财|同花顺|支付宝|微信|钉钉|先生|女士|同志|老板|经理|主任|科长|部长|处长|局长|校长|院长|教授|医生|律师|法官)$/u.test(v);}
function noisyDirectOrganization(v:string){return /^\d{4}年(?:度|第[一二三四]季度|\d{1,2}月|\d{1,2}-\d{1,2}月?)$|^\d{4}(?:-\d{4})?年?$|^(?:吸收合并方|被合并方|被吸收合并方|交易对方|交易标的|发行对象|认购对象|受让方|转让方|收购方|被收购方|标的公司|合并后公司|存续公司|新设公司|本期|上期|报告期|本报告期|上年同期|去年同期|款项的性质|评估\/估值对象|评估\/估值结果|差异|差異|账面价值|公允价值|评估值|中华人民共和国|中华民国|中国|美国|日本|韩国|英国|法国|德国|俄罗斯|国务院|全国人大|全国人民代表大会|全国政协|中央政治局|国家监委|货款代理|印花税公司)$/u.test(v)||/(?:准备期末余|减值损失|减值准备|坏账准备|累计折旧|递延所得税|应付职工薪酬|未分配利润|垫资款|管理系统|操作系统|支付系统|结算系统|交易系统|信息平台|公示系统|公开网|资讯网|信息网|查询网|信用中国|股东|实际控制人|一致行动人|最终受益人)$/u.test(v)||v.replace(/\s/gu,'').length<=2&&!/(?:公司|银行|法院|集团|中心)$/u.test(v)||/^理合伙企业/u.test(v)||v.length<=8&&/(?:董事会|股东会|监事会|理事会|管理委员会|委员会)$/u.test(v);}
function repairReferenceProvince(text:string,start:number,end:number){const compact=text.slice(start,end).replace(/\s/gu,'');if(start<1||compact.length<6||!/(省|市|自治区|特别行政区|区|县|旗)/u.test(compact)||!/(路|街|大道|大街|巷|弄|村|社区|小区|号|栋|幢|座|单元|楼|层|室|房|园区|开发区|大厦|中心|广场|花园|公寓)/u.test(compact))return start;const provinces=String(ruleData.literals.ht).split('|');for(let p=Math.max(0,start-16);p<start;p++){for(const province of provinces){const suffixes=['北京','天津','上海','重庆'].includes(province)?['市']:['香港','澳门'].includes(province)?['特别行政区']:['内蒙古','广西','西藏','宁夏','新疆'].includes(province)?['自治区']:['省'];if(province==='广西')suffixes.push('壮族自治区');if(province==='宁夏')suffixes.push('回族自治区');if(province==='新疆')suffixes.push('维吾尔自治区');for(const suffix of suffixes){const re=new RegExp('^'+[...province+suffix].join('[ \\t\\u3000]*(?:\\r?\\n[ \\t\\u3000]*)?'),'u'),match=text.slice(p,Math.min(end,start+16)).match(re)?.[0];if(match&&p+match.length>start&&(match.match(/\r\n|[\r\n]/gu)?.length??0)<=1&&!/[\t\f\u2028\u2029]/u.test(match))return p;}}}return start;}
export type ReferenceNerEntity={start:number;end:number;kind:'姓名'|'机构'|'地址';score:number};
export function filterReferenceNerCandidates(text:string,entities:ReferenceNerEntity[],anchors:readonly Anchor[]=[]):ReferenceCandidate[]{const out:ReferenceCandidate[]=[];
 for(const a of anchors)if(!Number.isSafeInteger(a.start)||!Number.isSafeInteger(a.end)||a.start<0||a.end<a.start||a.end>text.length||!safeBoundary(text,a.start)||!safeBoundary(text,a.end))throw new Error('REFERENCE_POSITION_INVALID');for(const entity of entities){if(!Number.isSafeInteger(entity.start)||!Number.isSafeInteger(entity.end)||entity.start<0||entity.end<=entity.start||entity.end>text.length||!Number.isFinite(entity.score)||entity.score<0||entity.score>1||!safeBoundary(text,entity.start)||!safeBoundary(text,entity.end))throw new Error('REFERENCE_POSITION_INVALID');// Repairs are confined to the narrowest original object containing the model span.
 const anchor=anchors.filter(a=>a.start<=entity.start&&a.end>=entity.end).sort((a,b)=>(a.end-a.start)-(b.end-b.start))[0];
 if(anchors.length&&!anchor)continue;
 const base=anchor?.start??0,window=anchor?text.slice(anchor.start,anchor.end):text;
 let start=entity.kind==='地址'?base+repairReferenceProvince(window,entity.start-base,entity.end-base):entity.start,end=entity.end;const raw=text.slice(start,end),v=raw.replace(/\u3000/gu,'').trim();if(!v||v.replace(/\s/gu,'').length<=1||!/[\u4e00-\u9fa5a-zA-Z]/u.test(v))continue;if(entity.kind==='姓名'&&(isReferenceBlacklisted(v,'name')||noisyDirectName(v))||entity.kind==='机构'&&(isReferenceBlacklisted(v,'organization')||noisyDirectOrganization(v))||entity.kind==='地址'&&isReferenceNoisyAddress(v)&&!isShortReferenceLocation(v))continue;
 // Trim only real edge whitespace, and keep internal OCR whitespace in the original span.
 start+=raw.length-raw.trimStart().length;end-=raw.length-raw.trimEnd().length;addCandidate(out,text,start,end,entity.kind,'NER-reference-postfilter',entity.score,entity.kind==='姓名'?'name_cn':entity.kind==='机构'?'org_name':'address');if(entity.kind==='地址'&&isShortReferenceLocation(v))out.at(-1)!.sources[0].uncertain=true;}return out;}

const emailLocalCharacters=new Uint8Array(128),emailDomainCharacters=new Uint8Array(128),hostCharacters=new Uint8Array(128);
for(const c of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._%+-')emailLocalCharacters[c.charCodeAt(0)]=1;
for(const c of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.-'){emailDomainCharacters[c.charCodeAt(0)]=1;hostCharacters[c.charCodeAt(0)]=1;}
function allowed(table:Uint8Array,text:string,index:number){const code=text.charCodeAt(index);return code<128&&table[code]===1;}
function detectLinearEmail(text:string,out:ReferenceCandidate[]){let from=0,at:number;while((at=text.indexOf('@',from))>=0){from=at+1;let start=at,end=at+1;while(start>0&&allowed(emailLocalCharacters,text,start-1))start--;while(end<text.length&&allowed(emailDomainCharacters,text,end))end++;if(start===at)continue;const candidate=text.slice(start,end),m=candidate.match(/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu);if(!m)continue;let value=m[0];const prefix=value.match(/^(1[3-9]\d{9})(?=[A-Z][A-Z0-9._%+-]*@)/iu)?.[1];if(prefix&&out.some(c=>c.kind==='手机号'&&c.start===start&&c.end===start+prefix.length)){start+=prefix.length;value=value.slice(prefix.length);}addCandidate(out,text,start,start+value.length,'邮箱','REF41-email',.97,'email');}}
function linearBareDomains(text:string){const result:{start:number;end:number}[]=[],tlds=new Set(strings(ruleData.literals.ct));let index=0;while(index<text.length){if(!allowed(hostCharacters,text,index)){index++;continue;}const start=index;while(index<text.length&&allowed(hostCharacters,text,index))index++;const end=index;if(start>0&&/[A-Za-z0-9_@.\-]/u.test(text[start-1]))continue;const raw=text.slice(start,end);if(!raw.includes('.'))continue;const labels=raw.split('.');let position=start,hostEnd=-1;for(let n=0;n<labels.length;n++){const label=labels[n];if(!/^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/u.test(label))break;position+=label.length;if(n>=1&&/^[A-Za-z]{2,24}$/u.test(label))hostEnd=position;position++;}if(hostEnd<0)continue;const domain=text.slice(start,hostEnd),tld=domain.slice(domain.lastIndexOf('.')+1).toLowerCase();if(!tlds.has(tld))continue;let valueEnd=hostEnd;if(text[valueEnd]===':'){let p=valueEnd+1;while(p<text.length&&/\d/u.test(text[p]))p++;const port=text.slice(valueEnd+1,p);if(port&&(port.length>5||Number(port)<1||Number(port)>65535))continue;if(port)valueEnd=p;}if(/[/?#]/u.test(text[valueEnd]??'')){valueEnd++;while(valueEnd<text.length&&!/[\s<>"'“”‘’，。；、！？]/u.test(text[valueEnd]))valueEnd++;}let value=text.slice(start,valueEnd).replace(/[，。；、！？,.；;!！?？：:]+$/u,'');while(/[)）\]】]$/u.test(value)&&((value.match(/[)）\]】]/gu)?.length??0)>(value.match(/[(（\[【]/gu)?.length??0)))value=value.slice(0,-1);try{const parsed=new URL('https://'+value);if(parsed.hostname.includes('.'))result.push({start,end:start+value.length});}catch{continue;}}return result;}
function isShortReferenceLocation(value:string){return /^(?:上海|深圳|北京|香港)$/u.test(value)||/^[\u4e00-\u9fa5]{2,3}[省市]$/u.test(value);}
