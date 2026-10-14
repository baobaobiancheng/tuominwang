import React,{useState} from 'react';
export function DocumentUnlock({id,revision,api,onDone,disabled}:{id:string;revision:number;api:<T>(path:string,method?:string,payload?:unknown)=>Promise<T>;onDone:()=>Promise<void>;disabled:boolean}){
 const [password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 return <form className="panel" onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api(`/documents/${id}/unlock`,'POST',{revision,password});setPassword('');await onDone();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}}>
  <p>文件已加密。输入你持有的文件密码，解锁后重新识别。</p>
  <label>文件密码<input type="password" autoComplete="off" value={password} maxLength={4096} onChange={e=>setPassword(e.target.value)} disabled={disabled||busy}/></label>
  <button disabled={disabled||busy||!password}>{busy?'正在解锁…':'解锁文件'}</button>{error&&<p role="alert" className="error">{error}</p>}
 </form>;
}
