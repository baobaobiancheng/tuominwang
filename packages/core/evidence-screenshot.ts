import type {Anchor,Mark,SourceFormat} from '../contracts/index.ts';
import type {DocumentConfiguration} from '../contracts/document-policy.ts';
import {MAX_MARKS} from '../contracts/index.ts';
import {detectReferenceRules,referenceSceneSignals,type ReferenceDocumentClassification} from './reference-rules.ts';
import {mergeCandidates} from './redaction.ts';
import {entitySpanKey} from './entity-identity.ts';

/** Static 0.5.9 applyEvidenceScreenshotPatterns gate, confined to its PDF/image callers. */
export type EvidenceSceneSelection={controlled:boolean;mode:'none'|'chat'|'form';explicitScreenshot:boolean};
const legal=new Set(['contract','judgment','complaint','reply','official_letter']);
const legalChatMarkers=['人民法院','人民检察院','起诉书','起诉状','判决书','裁定书','被告人','被告单位','公诉人','辩护人','原告','被告','犯罪事实','刑事责任','量刑建议','依法判处','提起公诉','审判长','审判员','检察官','检察员','书记员','案号','执行裁定','民事判决','刑事判决','行政判决','委托诉讼代理人','法定代表人'];
const strongChatMarkers=['【腾讯云】','【阿里云】','【华为云】','您的账号','账号ID','【验证码】','验证码为','短信验证','注册验证','登录验证','通讯录','个人收藏','拨号键盘','语音留言','微信电脑版','查看详情','共享的姓名','共享已关闭','信息·短信'];
const broadChatMarkers=['尊敬的用户','昵称','身份验证','验证码','发送时间','接收时间','聊天记录','消息记录','通讯记录','中国农业银行','中国银行','工商银行','建设银行','招商银行','转账成功','转账失败','余额变动','账户变动','交易提醒','通知','提醒','公告','温馨提示','短信'];
export function isEvidenceChatText(text:string){
 if(text.length<10||legalChatMarkers.filter(x=>text.includes(x)).length>=2)return false;
 return strongChatMarkers.some(x=>text.includes(x))||broadChatMarkers.filter(x=>text.includes(x)).length>=3||/【[^【】]{2,15}】.*?(您好|你好)/u.test(text)||text.length<1000&&/[【】]/u.test(text)&&/(您好|你好|请问)/u.test(text)||/\+86[\s\d]{10,}/u.test(text)||text.length<500&&/(你|我)(究竟|又去|电话|现在|给我)/u.test(text);
}
function routedClassification(classification:ReferenceDocumentClassification,configuration?:DocumentConfiguration){
 const route=configuration?.documentType;
 if(route&&route!=='auto')return {type:route==='pleading'?'complaint':route==='general'||route==='disclosure'||route==='screenshot'?'other':route,confidence:1};
 // Public router uses the default strategy below its 0.75 document threshold.
 return {type:classification.confidence>=.75?classification.type:'other',confidence:classification.confidence};
}
export function selectEvidenceScene(text:string,format:SourceFormat|undefined,classification:ReferenceDocumentClassification,configuration?:DocumentConfiguration):EvidenceSceneSelection{
 if(!format||!['pdf','png','jpg','jpeg'].includes(format))return{controlled:false,mode:'none',explicitScreenshot:false};
 const explicitScreenshot=configuration?.documentType==='screenshot',detected=routedClassification(classification,configuration);
 if(!explicitScreenshot&&legal.has(detected.type)&&detected.confidence>=.5)return{controlled:true,mode:'none',explicitScreenshot};
 if(isEvidenceChatText(text))return{controlled:true,mode:'chat',explicitScreenshot};
 const scene=referenceSceneSignals(text);
 return{controlled:true,mode:explicitScreenshot||scene.form||scene.transaction?'form':'none',explicitScreenshot};
}
const chatName=(value:string)=>/^[\u4e00-\u9fa5]{2,4}$/u.test(value)&&!new Set(['先生','女士','同学','老师','您好','你好','谢谢','收到','请问','服务','客服','系统']).has(value);
const chatOrg=(value:string)=>value.length>=2&&value.length<=20&&(value.match(/[\u4e00-\u9fa5]/gu)?.length??0)>=2&&!/(验证码|校验码|金额|元|小时|分钟|秒|\d{4,})/u.test(value);
function chatCandidates(text:string,anchors:readonly Anchor[],seeds:Mark[]):Mark[]{
 // Public n4 begins with upstream matches, so they take priority on same-kind overlap.
 const out:Mark[]=[...seeds],inside=(start:number,end:number)=>anchors.some(a=>a.start<=start&&end<=a.end);
 const add=(start:number,end:number,kind:'姓名'|'机构',code:string,score:number)=>{
  if(start<0||end<=start||!inside(start,end)||out.some(c=>c.kind===kind&&c.start<end&&start<c.end))return;
  out.push({start,end,kind,decision:'pending',sources:[{layer:'rules',code:'SCENE-chat-'+code,score}]});
  if(out.length>MAX_MARKS)throw new Error('MARK_LIMIT');
 };
 const title=text.match(/^[\s\S]{0,50}?([\u4e00-\u9fa5]{2,4}(?:律师|医生)?)\s*(?:\n|$)/u);
 if(title&&chatName(title[1].replace(/律师|医生/u,''))){const start=text.indexOf(title[1],title.index);if(start>=0&&start<100)add(start,start+title[1].length,'姓名','chat_title_name',.85);}
 for(const m of text.matchAll(/([\u4e00-\u9fa5a-zA-Z0-9]{2,30}(?:股份)?有限[\s\n]*(?:责任)?[\s\n]*公司)[\s\S]{0,50}?\.(?:docx|pdf|xlsx|pptx|doc|xls|ppt|txt)/giu)){const start=m.index;if(m[1].replace(/[\s\n]+/gu,'').length>=4)add(start,start+m[1].length,'机构','filename_company',.88);}
 for(const m of text.matchAll(/【([^【】\n]{2,20})】/gu)){const value=m[1].trim();if(chatOrg(value))add(m.index+1,m.index+1+value.length,'机构','bracket_org',.9);}
 for(const m of text.matchAll(/(中国农业银行|中国工商银行|中国建设银行|中国银行|交通银行|招商银行|浦发银行|兴业银行|民生银行|光大银行|中信银行|华夏银行|广发银行|平安银行|邮政储蓄银行)/gu))add(m.index,m.index+m[1].length,'机构','bank_name',.95);
 for(const m of text.matchAll(/([\u4e00-\u9fa5a-zA-Z0-9]{2,20}(?:股份)?有限[\s\n]*(?:责任)?[\s\n]*公司|[\u4e00-\u9fa5a-zA-Z0-9]{2,20}集团(?:有限[\s\n]*(?:责任)?[\s\n]*公司)?|[\u4e00-\u9fa5a-zA-Z0-9]{4,20}(?:律师事务所|法律服务所))/gu))add(m.index,m.index+m[1].length,'机构','company_name',.88);
 for(const [re,code,score,group] of [
  [/】\s*([\u4e00-\u9fa5]{2,4})\s*(您好|你好|先生|女士)/gu,'name_after_bracket',.88,1],
  [/(尊敬的|亲爱的)([\u4e00-\u9fa5]{2,4})(?:[，,、\s]|$)/gu,'respectful_name',.92,2],
  [/([\u4e00-\u9fa5]{2,4})(律师|医生|教授|主任|经理|总监|老师|工程师|会计师)/gu,'name_title',.9,1],
  [/(?:^|[\n\r\t，,。；;：:])\s*([\u4e00-\u9fa5]{2,4})\s*(您好|你好)/gu,'name_greeting',.82,1],
 ] as const)for(const m of text.matchAll(re)){const value=m[group];if(chatName(value)){const start=m.index+m[0].lastIndexOf(value);add(start,start+value.length,'姓名',code,score);}}
 for(const [re,code,score] of [
  [/昵称[：:\s]*([^\n\s，,。）)】}{]{2,10})(?:[\n\s，,。）)】}{]|$)/gu,'nickname',.92],
  [/账号ID[:\s]*[0-9]+[，,、\s]+昵称[：:\s]*([^\n\s，,。）)】]{2,10})(?:[\n\s，,。）)】]|$)/gu,'account_nickname',.95],
 ] as const)for(const m of text.matchAll(re)){
  const value=m[1].trim();
  if((value.match(/[\u4e00-\u9fa5]/gu)?.length??0)<2||!/^[\u4e00-\u9fa5a-zA-Z0-9]{2,10}$/u.test(value))continue;
  const start=m.index+m[0].lastIndexOf(value);add(start,start+value.length,'姓名',code,score);
 }
 return out.filter(c=>c.kind!=='姓名'||!out.some(o=>o.kind==='机构'&&text.slice(o.start,o.end).includes(text.slice(c.start,c.end))));
}
function protectedSeed(mark:Mark){return mark.decision!=='pending'||mark.sources?.some(s=>s.layer==='manual'||s.code==='project-dictionary'||s.code==='project-whitelist')===true;}
function sourceFormPostprocess(text:string,marks:Mark[]):Mark[]{
 // Public ur filters long multiline addresses, then chooses the longest overlapping
 // same-type candidate (higher confidence on equal length). This is confined to
 // fresh PDF/image evidence candidates; review and dictionary slots stay intact.
 const remaining=marks.filter(mark=>mark.kind!=='地址'||(text.slice(mark.start,mark.end).match(/\n/gu)?.length??0)<3);
 const kept:Mark[]=[],family=(mark:Mark)=>mark.kind==='手机号'||mark.kind==='固定电话'&&mark.sources?.some(source=>source.code==='SCENE-form-phone')?'phone':mark.kind;
 const score=(mark:Mark)=>Math.max(0,...(mark.sources??[]).map(source=>source.score??0));
 for(const mark of remaining.sort((a,b)=>a.start-b.start||a.end-b.end)){
  const overlaps=kept.map((prior,index)=>({prior,index})).filter(({prior})=>family(prior)===family(mark)&&prior.start<mark.end&&mark.start<prior.end);
  if(!overlaps.length){kept.push(mark);continue;}
  let winner=mark;
  for(const {prior} of overlaps){const priorLength=prior.end-prior.start,winnerLength=winner.end-winner.start;if(priorLength>winnerLength||priorLength===winnerLength&&score(prior)>score(winner))winner=prior;}
  for(const {index} of overlaps.reverse())kept.splice(index,1);
  kept.push(winner);
 }
 return kept.sort((a,b)=>a.start-b.start||a.end-b.end);
}
export function applyEvidenceScene(text:string,anchors:readonly Anchor[],seeds:Mark[],selection:EvidenceSceneSelection):Mark[]{
 if(!selection.controlled||selection.mode==='none')return seeds;
 if(selection.mode==='chat')return chatCandidates(text,anchors,seeds);
 const added=detectReferenceRules(text,{sceneMode:'only',screenshot:selection.explicitScreenshot}).filter(c=>anchors.some(a=>a.start<=c.start&&c.end<=a.end)).map(c=>({start:c.start,end:c.end,kind:c.kind,decision:'pending' as const,sources:c.sources.map(s=>({...s,score:c.confidence}))}));
 const locked=seeds.filter(protectedSeed),fresh=mergeCandidates(text,seeds.filter(seed=>!protectedSeed(seed)),added);
 const {form,transaction}=referenceSceneSignals(text),postprocessed=form||transaction?sourceFormPostprocess(text,fresh):fresh;
 const lockedKeys=new Set(locked.map(entitySpanKey));return [...postprocessed.filter(mark=>!lockedKeys.has(entitySpanKey(mark))),...locked].sort((a,b)=>a.start-b.start||a.end-b.end);
}
