import {entityIdentity,entityLabel,entitySpanKey} from '../../packages/core/entity-identity.ts';
import React, {useRef, useState, useEffect} from 'react';
import type { DocumentView, Mark } from '../../packages/contracts/index.ts';
import type { PolicyDirective, ReplacementPolicies } from '../../packages/contracts/policies.ts';
export function replacementPolicyTypeTarget(marks:Mark[],identity:string){const target=marks.find(m=>entityIdentity(m)===identity);if(!target)throw new Error('POLICY_TARGET_NOT_FOUND');return target;}
export function ReplacementPoliciesEditor({doc,marks,update,api,run,disabled,canUseAliases}:{doc:DocumentView;marks:Mark[];update:(marks:Mark[])=>void;api:<T>(path:string,method?:string,body?:unknown)=>Promise<T>;run:(action:()=>Promise<void>)=>Promise<void>;disabled:boolean;canUseAliases:boolean}) {
  const [scope,setScope]=useState('overall'),[kind,setKind]=useState(marks[0]?entityIdentity(marks[0]):'姓名'),[selectedValue,setSelectedValue]=useState(marks[0]?entitySpanKey(marks[0]):""),[mode,setMode]=useState<PolicyDirective['mode']>('type'),[prefix,setPrefix]=useState(0),[suffix,setSuffix]=useState(0),[value,setValue]=useState('已隐藏'),[keepExplicit,setKeepExplicit]=useState(true);
  const context=useRef({marks,id:doc.id,revision:doc.revision,generation:0});
  if (context.current.marks!==marks||context.current.id!==doc.id||context.current.revision!==doc.revision) context.current={marks,id:doc.id,revision:doc.revision,generation:context.current.generation+1};
  useEffect(()=>()=>{context.current.generation++;},[]);
  async function apply(){
    const current=context.current;
    const rule:PolicyDirective=mode==='mask'?{mode,prefix,suffix}:mode==='custom'?{mode,value}:mode==='reference-mask'?{mode,variant:'default'}:{mode};
    const policies:ReplacementPolicies={types:[],values:[],keepExplicit};
    if(scope==='overall')policies.overall=rule;
    else if(scope==='type'){const target=replacementPolicyTypeTarget(marks,kind);policies.types=[{kind:target.kind,...target.rawEntityType!==undefined?{rawEntityType:target.rawEntityType}:{},rule}];}
    else {const mark=marks.find(m=>entitySpanKey(m)===selectedValue);if(!mark)throw new Error('POLICY_TARGET_NOT_FOUND');policies.values=[{start:mark.start,end:mark.end,kind:mark.kind,...mark.rawEntityType!==undefined?{rawEntityType:mark.rawEntityType}:{},rule}];}
    const result=await api<{revision:number;marks:Mark[]}>(`/documents/${current.id}/replacement-policies`,'POST',{revision:current.revision,marks:current.marks,policies});
    if(context.current.generation!==current.generation)throw new Error('草稿已变化，请重新应用');
    update(result.marks);
  }
  return <fieldset disabled={disabled} className="bulk-review"><legend>批量设置脱敏方式</legend>
    <label>作用范围<select value={scope} onChange={e=>setScope(e.target.value)}><option value="overall">整份材料</option><option value="type">某个类型</option><option value="value">相同原值的全部位置</option></select></label>
    {scope==='type'&&<label>类型<select value={kind} onChange={e=>setKind(e.target.value)}>{[...new Map(marks.map(m=>[entityIdentity(m),entityLabel(m)])).entries()].map(([id,label])=><option key={id} value={id}>{label}</option>)}</select></label>}
    {scope==='value'&&<label>原值<select value={selectedValue} onChange={e=>setSelectedValue(e.target.value)}>{marks.map((m,i)=><option key={entitySpanKey(m)} value={entitySpanKey(m)}>{entityLabel(m)} · {doc.markTexts?.[`${m.start}:${m.end}`]??`位置 ${m.start+1}`}</option>)}</select></label>}
    <label>脱敏方式<select value={mode} onChange={e=>setMode(e.target.value as PolicyDirective['mode'])}><option value="clear">完整遮盖</option><option value="type">类型占位符</option><option value="full">全字符星号</option><option value="reference-mask">按类型遮盖</option><option value="mask">部分遮盖</option><option value="custom">自定义替换</option><option value="alias" disabled={!canUseAliases}>项目假名</option></select></label>
    {mode==='mask'&&<><label>保留前几字<input type="number" min="0" max="100" value={prefix} onChange={e=>setPrefix(Number(e.target.value))}/></label><label>保留后几字<input type="number" min="0" max="100" value={suffix} onChange={e=>setSuffix(Number(e.target.value))}/></label></>}
    {mode==='custom'&&<label>替换文字<textarea value={value} rows={2} onChange={e=>setValue(e.target.value)}/></label>}
    <label className="checkbox"><input type="checkbox" checked={keepExplicit} onChange={e=>setKeepExplicit(e.target.checked)}/>保留逐项设置的例外</label>
    <button className="secondary" disabled={!marks.length||mode==='alias'&&!canUseAliases} onClick={()=>void run(apply)}>应用到复核草稿</button>
    <p className="muted">相同原值、类型、整份材料依次生效；保留项不变。应用后仍需确认标记并保存复核。</p>
  </fieldset>;
}
