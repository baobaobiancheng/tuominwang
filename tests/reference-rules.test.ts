import {describe,it,expect} from 'vitest';
import {detectReferenceRules,detectReferenceAmounts,validReferenceName,validReferenceOrganization,isReferenceBlacklisted,REFERENCE_RULE_INVENTORY,REFERENCE_CONFIG_COUNTS} from '../packages/core/reference-rules.ts';
const fixtures:[string,string][]=[
 ['id_card','身份证号：110101199001011234'],['mobile','手机：138 1234 5678'],['wechat_labeled','微信号：_alice123'],['wechat_wxid','wxid_abc123'],['bank','银行账号：1234567890123456'],['bank_labeled','银行账号：1234 5678 9O12 3456'],['email','alice@example.com'],['email_ocr','邮箱：alice @ example . com'],['url','官网：www.example.com/path'],['uscc','统一社会信用代码：91330100MA12345678'],['tax_labeled','税号：123456789012345'],['landline','010-12345678'],['local_phone','联系电话：23456789'],['contact_name','联系人：张三，'],['transcript_name','被询问人：李四男'],['officer_names','询问人：张三、李四工作单位'],['self_name','我叫王五，男'],['address_labeled_door','联系地址：北京市朝阳区建国路88号101室'],['address_labeled_no_door','住址：浙江省杭州市西湖区文三路'],['venue_labeled','会议地点：北京市某某会议中心'],['address_unlabeled','北京市朝阳区建国路88号101室'],['garage','北京市朝阳区建国路88号地下车库12号'],['property_base','北京市朝阳区建国路88号负一层住宅'],['attached_door','北京市朝阳区建国路88号附1号'],['context_place','位于北京市海淀区阳光花园'],['unit_range','北京市朝阳区阳光花园88号1单元至3单元'],['plate','粤A123456'],['securities_account','资金账号：1234567890'],['case_no','（2026）京0101民初123号'],['admin_no','京政发〔2026〕第123号'],['realty_cert','京（2026）北京市不动产权第123456号'],['patent','PCT/CN2026/123456'],['patent_labeled','专利号：202612345678'],['icp','京ICP备12345678号'],['filing_beizi','粤备字第123456号'],['filing_labeled','备案号：AB123456'],['land_cert','京国用（2026）字第123456号'],['housing_permit','京房权证字第123456号'],['realty_unit','123456789012GA12345F12345678'],['certificate_labeled','施工许可证号：AB123456'],['parcel','（2026）第123号地块']
];
describe('full recovered basic inventory',()=>{
 it('has exactly every stable basic group and all blacklist categories/items',()=>{expect(REFERENCE_RULE_INVENTORY.filter(x=>x.id.startsWith('REF41-'))).toHaveLength(41);expect(REFERENCE_CONFIG_COUNTS).toMatchObject({categories:108,arrayItems:3012});});
 for(const[id,text]of fixtures)it(id,()=>{const c=detectReferenceRules(text);expect(c.some(c=>c.ruleId==='REF41-'+id||id==='url'&&c.ruleId.startsWith('REF41-url-')),JSON.stringify(c)).toBe(true);for(const m of c){expect(m.decision).toBe('pending');expect(text.slice(m.start,m.end).length).toBeGreaterThan(0);}});
 it('retains exact original UTF16 spans across emoji and OCR whitespace',()=>{const text='😀 邮箱：alice @ example . com\nNational ID: AB123\t456';const c=detectReferenceRules(text);expect(c.find(c=>c.ruleId==='REF41-email_ocr')).toMatchObject({start:text.indexOf('alice')});const id=c.find(c=>c.ruleId==='INT-national-id')!;expect(text.slice(id.start,id.end)).toBe('AB123\t456');});
 it('keeps new international/administrative/social types distinct',()=>{const text='EIN: 12-3456789\nNational ID: AB123456\n社会保险 社保电脑号：123456789\n京政发〔2026〕第123号';const kinds=detectReferenceRules(text).map(c=>c.kind);expect(kinds).toContain('雇主识别号');expect(kinds).toContain('国际身份证号');expect(kinds).toContain('社保号');});
 it('requires receipt context and detects all three receipt families',()=>{const text='微信号 转账申请人 收款方付款方\n付款方alice123张三收款方\n2026-10-14 12:00:00李四\n__masked_id__';const c=detectReferenceRules(text);expect(c.some(c=>c.ruleId==='SCENE-receipt-wechat-pair')).toBe(true);expect(c.some(c=>c.ruleId==='SCENE-receipt-timestamp-name')).toBe(true);expect(c.some(c=>c.ruleId==='SCENE-receipt-standalone-wechat')).toBe(true);expect(detectReferenceRules('__masked_id__').some(c=>c.ruleId.startsWith('SCENE-receipt'))).toBe(false);});
 it('uses whole input offsets in forms and signed certificate subjects',()=>{const text='😀 工作证明\n兹证明张三先生，\n姓名：李四\n性别：男\n身份证号：110101199001011234';const c=detectReferenceRules(text,{documentType:'official_letter'});expect(c.find(c=>c.ruleId==='OFFICIAL-cert-subject')?.start).toBe(text.indexOf('张三'));expect(c.find(c=>c.ruleId==='SCENE-form-name_cn')?.start).toBe(text.indexOf('李四'));});
 it('activates source form branch when bank account uses 帐号 spelling as third label',()=>{const text='姓名：张三\n金额：1000元\n银行帐号：12345678';const forms=detectReferenceRules(text).filter(c=>c.ruleId.startsWith('SCENE-form-'));expect(forms.map(c=>[c.ruleId,text.slice(c.start,c.end)])).toEqual([['SCENE-form-name_cn','张三'],['SCENE-form-contract_amount','1000元'],['SCENE-form-bank_card','12345678']]);});
 it('keeps known blacklists as actual filters and validates compound surnames',()=>{expect(isReferenceBlacklisted('董事会','name')).toBe(true);expect(validReferenceName('张三')).toBe(true);expect(validReferenceName('欧阳明月')).toBe(true);expect(validReferenceName('投资人')).toBe(false);expect(validReferenceOrganization('腾讯')).toBe(true);expect(validReferenceOrganization('该公司')).toBe(false);expect(validReferenceOrganization('注册资本')).toBe(false);});
 it('suppresses timestamps, labeled dates, percent, areas, shares and rate branches',()=>{for(const s of ['时间：1750000000000','金额：2026年','合同金额：5%','建筑面积：12,345平方米','合同金额：10000股','年利率：3.5%'])expect(detectReferenceAmounts(s),s).toEqual([]);});
 it('splits a digits/uppercase pair and excludes percent parenthesis',()=>{const text='合同金额：10000元（壹万元整）\n合同金额：5000元（税率3%）';const c=detectReferenceAmounts(text);expect(c.map(m=>text.slice(m.start,m.end))).toEqual(['10000元','壹万元整','5000元']);});
 it('does not apply upstream masks or approval to candidates',()=>{const text='手机13812345678';const c=detectReferenceRules(text);expect(c.every(c=>c.decision==='pending'&&!('masked' in c)&&!('replacement' in c))).toBe(true);});
});
describe('all 12 amount branch families',()=>{
 const samples:[string,string][]=[['label','合同金额：10000元'],['currency','￥10000'],['uppercase','大写：壹万元整'],['standalone','支付了 12万元'],['table_summary','合计：1000'],['labeled_bare_number','金额人民币：10000'],['post_yuan_bare_number','车辆价款'+'说明'.repeat(24)+'元'+'人民币'.repeat(10)+'10000'],['conversation_payment','还我500块钱'],['standalone_yuan','需500元'],['per_share_price','12.50港元/股'],['thousand_sep','1,234,567'],['standalone_uppercase','壹万贰仟元整']];
 for(const[id,text]of samples)it(id,()=>expect(detectReferenceAmounts(text).some(c=>c.ruleId==='AMOUNT-'+id),JSON.stringify(detectReferenceAmounts(text))).toBe(true));
});
import goldenDocumentTypes from './fixtures/reference-document-types.json' with {type:'json'};
import {classifyReferenceDocumentDetail,filterReferenceNerCandidates,isReferenceNameBlacklistedStrict,isReferenceNoisyAddress} from '../packages/core/reference-rules.ts';
describe('full source-scored routing and NER postprocessing',()=>{
 it('matches all 120 frozen static classification cases, including scores and confidence',()=>{for(const row of goldenDocumentTypes)expect(classifyReferenceDocumentDetail(row.text,row.filename),row.filename+' / '+row.text).toEqual(row.expected);});
 it('treats regex-pattern blacklist YAML items literally and applies strict semantic noise independently',()=>{expect(isReferenceNameBlacklistedStrict('提交材料')).toBe(true);expect(isReferenceNameBlacklistedStrict('张三')).toBe(false);});
 it('repairs an OCR-split province into the original span and rejects noisy multi-line addresses',()=>{const text='联系地址：广东\n省广州市天河区合成路88号';const start=text.indexOf('省广'),c=filterReferenceNerCandidates(text,[{start,end:text.length,kind:'地址',score:.9}]);expect(c[0].start).toBe(text.indexOf('广东'));expect(text.slice(c[0].start,c[0].end)).toBe('广东\n省广州市天河区合成路88号');expect(isReferenceNoisyAddress('合成有限公司\n北京市海淀区合成路88号')).toBe(true);});
 it('rejects invalid model spans and scores, preserves pending candidates and whitespace offsets',()=>{expect(()=>filterReferenceNerCandidates('😀 张三',[{start:1,end:4,kind:'姓名',score:.9}])).toThrow('REFERENCE_POSITION_INVALID');expect(()=>filterReferenceNerCandidates('张三',[{start:0,end:2,kind:'姓名',score:NaN}])).toThrow('REFERENCE_POSITION_INVALID');const text='  张三  ';expect(filterReferenceNerCandidates(text,[{start:0,end:text.length,kind:'姓名',score:.9}])[0]).toMatchObject({start:2,end:4,decision:'pending'});});
});

it('filters document-title name noise omitted by upstream direct NER while retaining people',()=>{const text='法律意见书 张三',c=filterReferenceNerCandidates(text,[{start:0,end:5,kind:'姓名',score:.99},{start:6,end:8,kind:'姓名',score:.99}]);expect(c).toHaveLength(1);expect(text.slice(c[0].start,c[0].end)).toBe('张三');});

it('trims trailing separators on phones while retaining interior OCR spacing',()=>{const text='Phone 13800138000 - public synthetic sample';const c=detectReferenceRules(text).filter(c=>c.kind==='手机号');expect(c).toHaveLength(1);expect(text.slice(c[0].start,c[0].end)).toBe('13800138000');expect(detectReferenceRules('手机 138 0013 8000 -')[0].end).toBe(16);});
it('scans the complete maximum-sized email-free and invalid-domain document linearly',()=>{const text='x'.repeat(50*1024*1024);expect(detectReferenceRules(text)).toEqual([]);expect(detectReferenceRules(text+'.x')).toEqual([]);},30000);
it('preserves valid bare domains and explicit email offsets with repeated @ boundaries',()=>{const text='abc@def@site.com and example.com:443/path?x=1；裸域 sub.example.com.';const c=detectReferenceRules(text);expect(c.filter(m=>m.kind==='邮箱').map(m=>text.slice(m.start,m.end))).toContain('def@site.com');expect(c.filter(m=>m.kind==='网址').map(m=>text.slice(m.start,m.end))).toContain('example.com:443/path?x=1');expect(c.filter(m=>m.kind==='网址').map(m=>text.slice(m.start,m.end))).toContain('sub.example.com');});
it('retains short NER locations as uncertain pending evidence to preserve existing coverage',()=>{const text='😀张三在北京工作';const c=filterReferenceNerCandidates(text,[{start:5,end:7,kind:'地址',score:.99}]);expect(c).toHaveLength(1);expect(c[0].sources[0].uncertain).toBe(true);expect(text.slice(c[0].start,c[0].end)).toBe('北京');});

 it('confines NER province repair to the narrowest original object while allowing one-page OCR repair',()=>{
 const text='广东\n省广州市天河区合成路88号',entity={start:3,end:text.length,kind:'地址' as const,score:.9};
 const objects=[{start:0,end:2,kind:'cell' as const},{start:3,end:text.length,kind:'cell' as const}];
 const confined=filterReferenceNerCandidates(text,[entity],[{start:0,end:text.length,kind:'text'},...objects]);
 expect(confined).toHaveLength(1);expect(confined[0].start).toBe(3);
 const page=filterReferenceNerCandidates(text,[entity],[{start:0,end:text.length,kind:'page'}]);expect(page[0].start).toBe(0);
 expect(filterReferenceNerCandidates(text,[{...entity,start:0}],objects)).toEqual([]);
 expect(()=>filterReferenceNerCandidates(text,[entity],[{start:-1,end:text.length,kind:'cell'}])).toThrow('REFERENCE_POSITION_INVALID');
 });

// Append to tests/reference-rules.test.ts after the existing amount-family block.
// Fixed source-line fixtures; no rule-data lookup is used as a test oracle.
describe('five independently effective source amount branches',()=>{
 const positive=[
  {line:2037,text:'😀 合同金额：壹仟万元整',start:8,end:13,value:'壹仟万元整',ruleId:'AMOUNT-label',confidence:.93},
  {line:2049,text:'😀 RMB 20000',start:3,end:12,value:'RMB 20000',ruleId:'AMOUNT-currency',confidence:.92},
  {line:2054,text:'😀 人民币30000元',start:3,end:12,value:'人民币30000元',ruleId:'AMOUNT-currency',confidence:.92},
  {line:2059,text:'😀 合同金额：（壹万元整）',start:8,end:14,value:'（壹万元整）',ruleId:'AMOUNT-uppercase',confidence:.91},
  {line:2078,text:'😀 20000元人民币',start:3,end:12,value:'20000元人民币',ruleId:'AMOUNT-currency',confidence:.9},
 ] as const;
 for(const row of positive)it(`main.js L${row.line} emits the exact pending span`,()=>{
  const found=detectReferenceAmounts(row.text);
  expect(found).toHaveLength(1);
  expect(found[0]).toEqual({start:row.start,end:row.end,kind:'金额',referenceType:'contract_amount',ruleId:row.ruleId,confidence:row.confidence,decision:'pending',sources:[{layer:'rules',code:row.ruleId}]});
  expect(row.text.slice(found[0].start,found[0].end)).toBe(row.value);
  expect(Object.hasOwn(found[0],'masked')).toBe(false);
  expect(Object.hasOwn(found[0],'approval')).toBe(false);
  expect(Object.hasOwn(found[0],'replacement')).toBe(false);
 });
 for(const [line,text] of [
  [2037,'😀 合同金额：壹万元整'],
  [2049,'😀 RMB 2'],
  [2054,'😀 人民币3平方米'],
  [2059,'😀 （壹万元整）'],
 ] as const)it(`main.js L${line} rejects its focused boundary`,()=>expect(detectReferenceAmounts(text)).toEqual([]));
 it('main.js L2078 needs at least three digits while 12元 stays valid standalone_yuan',()=>{
  const text='😀 12元人民币',found=detectReferenceAmounts(text);
  expect(found).toEqual([{start:3,end:6,kind:'金额',referenceType:'contract_amount',ruleId:'AMOUNT-standalone_yuan',confidence:.8,decision:'pending',sources:[{layer:'rules',code:'AMOUNT-standalone_yuan'}]}]);
  expect(text.slice(found[0].start,found[0].end)).toBe('12元');
  expect(Object.hasOwn(found[0],'masked')).toBe(false);
  expect(Object.hasOwn(found[0],'approval')).toBe(false);
  expect(Object.hasOwn(found[0],'replacement')).toBe(false);
 });
});

it('retains standalone amount source boundaries and consumes numeric parentheses once',()=>{
 const spans=(s:string)=>detectReferenceAmounts(s).map(m=>s.slice(m.start,m.end));
 expect(spans('壹123万元')).toEqual(['23万元']);
 expect(spans('说明：1, 234.50万元；2亿元正')).toEqual(['1, 234.50万元','2亿元正']);
 expect(spans('说明：12万元（包含34万元）后付56万元')).toEqual(['12万元（包含34万元）','56万元']);
 expect(spans('说明：1万2万元')).toEqual([]);
});

it('finishes long rejected numeric runs without retrying the amount suffix at each digit',async()=>{
 const {spawnSync}=await import('node:child_process');
 const child=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',`
  import {detectReferenceAmounts} from './packages/core/reference-rules.ts';
  for(const run of ['1'.repeat(100000),'1,'.repeat(50000)]){
   if(detectReferenceAmounts('说明：'+run+'X').length)throw new Error('unexpected amount');
  }
  const valid='1'.repeat(100000)+'万元';
  const marks=detectReferenceAmounts('说明：'+valid);
  if(marks.length!==1||marks[0].start!==3||marks[0].end!==valid.length+3)throw new Error('amount span changed');
 `],{encoding:'utf8',timeout:5000});
 expect(child.error?.message??child.stderr).toBe('');expect(child.status).toBe(0);
},10000);
