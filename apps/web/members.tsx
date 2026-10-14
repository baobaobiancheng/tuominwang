import { useConfirmAction } from "./confirm-action.tsx";
import React, { useEffect, useRef, useState } from "react";
import { permissionLabels, permissionSchema, type Permission } from "../../packages/contracts/index.ts";
type Calls = { run: (action: () => Promise<void>) => Promise<void>; api: <T>(path: string, method?: string, body?: unknown) => Promise<T> };
type Account = { id: string; username: string; role: "owner" | "admin" | "member"; enabled: boolean; revision: number };
type Grant = Omit<Account, "revision"> & { revision: number | null; owner: boolean; permissions: Permission[] };
type Event = { id: string; user_id: string; event: string; object_id: string; created_at: string; details?: { permissions?: Permission[] } };
const eventLabels: Record<string, string> = { project_created: "创建项目", text_submitted: "提交文本", file_uploaded: "上传文件", review_saved: "保存复核", export_requested: "生成副本", download_issued: "签发下载链接", artifact_downloaded: "下载副本", job_cancelled: "取消任务", job_retried: "重试任务", project_member_updated: "修改项目权限", organization_renamed: "修改组织名称", organization_account_created: "创建账号", organization_member_updated: "修改组织成员", mapping_created: "创建假名", mapping_viewed: "查看假名映射", aliases_restored: "还原假名", dictionary_updated: "修改词表", recognition_requested: "重新识别" };
Object.assign(eventLabels, { download_verified: "核验并签发下载链接", text_restored: "还原假名", dictionary_exported: "导出项目词表", material_deleted: "删除材料", capacity_updated: "调整材料配额" });
function usePendingGuard(dirty: boolean) {
  useEffect(() => { const guard = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; }; if (dirty) window.addEventListener("beforeunload", guard); return () => window.removeEventListener("beforeunload", guard); }, [dirty]);
}

function Capacity({ run, api }: Calls) {
  type Limits = { revision: number; byte_limit: string; used_bytes: string; document_limit: number; used_documents: number };
  const [value, setValue] = useState<Limits | null>(null), [bytes, setBytes] = useState(""), [count, setCount] = useState(0), [error, setError] = useState("");
  async function load() { const v = await api<Limits>("/organization/capacity"); setValue(v); setBytes(String(Number(v.byte_limit) / 1048576)); setCount(v.document_limit); }
  return <section className="organization-accounts"><div className="actions"><h3>材料配额</h3><button className="secondary" onClick={() => void run(async () => { try { await load(); setError(""); } catch (e) { setError((e as Error).message); } })}>查看材料配额</button></div>
    {error && <p className="error" role="alert">{error}</p>}{value && <form onSubmit={e => { e.preventDefault(); void run(async () => { try { await api("/organization/capacity", "PUT", { revision: value.revision, byteLimit: Math.round(Number(bytes) * 1048576), documentLimit: count }); await load(); setError(""); } catch (e) { setError((e as Error).message); } }); }}><p className="muted">已保存 {value.used_documents} 份材料，原始数据计量 {(Number(value.used_bytes) / 1048576).toFixed(2)} MiB。历史文本按加密前大小上界计量。不含派生副本与模型文件，请同时留足磁盘空间。</p><label>容量上限（MiB）<input type="number" min="0" max="1048576" step="any" required value={bytes} onChange={e => setBytes(e.target.value)} /></label><label>材料数上限<input type="number" min="0" max="1000000" required value={count} onChange={e => setCount(Number(e.target.value))} /></label><button disabled={Math.round(Number(bytes) * 1048576) === Number(value.byte_limit) && count === value.document_limit}>保存材料配额</button></form>}
  </section>;
}

export function AuditPanel({ project, run, api, active, activate }: Calls & { project?: string; active?: boolean; activate?: () => void }) {
  const [events, setEvents] = useState<Event[] | null>(null), [more, setMore] = useState(false);
  async function load(append = false) {
    const next = await api<Event[]>(`${project ? `/projects/${project}` : "/organization"}/audit?limit=20&offset=${append ? events?.length ?? 0 : 0}`);
    setEvents(old => append ? [...old ?? [], ...next] : next); setMore(next.length === 20);
  }
  const visible = active === undefined ? events !== null : active && events !== null;
  return <section className="audit-section"><button className="secondary" aria-expanded={visible} onClick={() => visible ? setEvents(null) : events !== null ? activate?.() : void run(async () => { await load(); activate?.(); })}>{visible ? "收起操作记录" : "操作记录"}</button>
    {visible && events && <div className="panel"><div className="actions"><h2>操作记录</h2><button className="quiet" onClick={() => void run(() => load())}>刷新操作记录</button></div>
      {!events.length ? <p className="muted">暂无操作记录。</p> : <table className="data-table"><thead><tr><th>时间</th><th>操作</th><th>账号编号</th><th>对象编号</th></tr></thead><tbody>{events.map(e => <tr key={e.id}><td>{new Date(e.created_at).toLocaleString("zh-CN")}</td><td>{eventLabels[e.event] ?? "操作记录"}{e.details?.permissions && <small className="audit-detail">{e.details.permissions.map(p => permissionLabels[p]).join("、") || "撤销全部权限"}</small>}</td><td title={e.user_id}>{e.user_id.slice(0, 8)}</td><td title={e.object_id}>{e.object_id.slice(0, 8)}</td></tr>)}</tbody></table>}
      {more && <button className="quiet" onClick={() => void run(() => load(true))}>更多操作记录</button>}
    </div>}
  </section>;
}

export function ProjectMembers({ project, username, run, api, onPending, active, activate }: Calls & { project: string; username: string; onPending: (dirty: boolean) => void; active: boolean; activate: () => void }) {
  const confirmAction = useConfirmAction();
  const [list, setList] = useState<Grant[] | null>(null), [selected, setSelected] = useState(""), [permissions, setPermissions] = useState<Permission[]>([]);
  const member = list?.find(m => m.id === selected), dirty = !!member && JSON.stringify([...member.permissions].sort()) !== JSON.stringify([...permissions].sort());
  usePendingGuard(dirty);
  useEffect(() => { onPending(dirty); return () => onPending(false); }, [dirty, onPending]);
  function pick(m?: Grant) { setSelected(m?.id ?? ""); setPermissions(m?.permissions ?? []); }
  async function load() { const next = await api<Grant[]>(`/projects/${project}/members`); setList(next); pick(next.find(m => m.id === selected)); }
  const editable = member && !member.owner && member.username !== username;
  return <section className="member-section"><button className="secondary" aria-expanded={active && list !== null} onClick={async () => { if (active && list !== null) { if (!dirty || await confirmAction("放弃未保存的成员权限？")) setList(null); } else if (list !== null) activate(); else void run(async () => { await load(); activate(); }); }}>{active && list !== null ? "收起项目成员" : "项目成员"}</button>
    {active && list !== null && <div className="panel"><h2>项目成员</h2><p className="muted">逐项授予权限。组织成员不会自动获得项目资料权限；清空全部权限后将无法访问此项目。已签发的下载链接在到期前仍可用。</p>
      <label>选择成员<select aria-label="选择项目成员" value={selected} onChange={async e => { const nextId = e.target.value; if (!dirty || await confirmAction("放弃未保存的成员权限？")) pick(list.find(m => m.id === nextId)); }}><option value="">请选择组织成员</option>{list.map(m => <option key={m.id} value={m.id}>{m.username}{m.owner ? "（项目所有者）" : !m.enabled ? "（已停用）" : ""}</option>)}</select></label>
      {member && <><fieldset className="permission-grid" disabled={!editable}><legend>允许的操作</legend>{permissionSchema.options.map(p => <label key={p}><input type="checkbox" checked={permissions.includes(p)} disabled={!member.enabled && !permissions.includes(p)} onChange={e => setPermissions(old => e.target.checked ? [...old, p] : old.filter(v => v !== p))} />{permissionLabels[p]}</label>)}</fieldset>
        {!editable && <p className="muted">项目所有者权限固定；不能修改自己的权限。</p>}
        <div className="actions"><button className="quiet" disabled={!editable || !permissions.length} onClick={() => setPermissions([])}>清空权限</button><button disabled={!editable || !dirty} onClick={async () => { if (await confirmAction(`确认更新 ${member.username} 的项目权限？`)) void run(async () => { await api(`/projects/${project}/members/${member.id}`, "PUT", { revision: member.revision, permissions }); await load(); }); }}>保存成员权限</button></div>
      </>}
      <button className="quiet" onClick={async () => { if (!dirty || await confirmAction("放弃未保存的成员权限？")) void run(load); }}>刷新成员</button>
    </div>}
  </section>;
}

export function OrganizationDialog({ run, api }: Calls) {
  const confirmAction = useConfirmAction();
  const dialog = useRef<HTMLDialogElement>(null), [org, setOrg] = useState<{ name: string; revision: number; role: string } | null>(null), [name, setName] = useState("");
  const [members, setMembers] = useState<Account[]>([]), [more, setMore] = useState(false), [username, setUsername] = useState(""), [password, setPassword] = useState(""), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const manage = ["owner", "admin"].includes(org?.role ?? ""), dirty = !!org && (name !== org.name || !!username || !!password);
  usePendingGuard(dirty);
  async function action(fn: () => Promise<void>) { await run(async () => { setError(""); setNotice(""); try { await fn(); } catch (e) { setError((e as Error).message); } }); }
  async function loadMembers(append = false) { const next = await api<Account[]>(`/organization/members?limit=20&offset=${append ? members.length : 0}`); setMembers(old => append ? [...old, ...next] : next); setMore(next.length === 20); }
  async function load() { const next = await api<NonNullable<typeof org>>("/organization"); setOrg(next); setName(next.name); if (["owner", "admin"].includes(next.role)) await loadMembers(); else setMembers([]); }
  async function close() { if (dirty && !await confirmAction("放弃未保存的组织信息和账号输入？")) return; dialog.current?.close(); setOrg(null); setUsername(""); setPassword(""); setError(""); setNotice(""); }
  return <><button className="quiet organization-button" onClick={() => void action(async () => { await load(); dialog.current?.showModal(); })}>组织管理</button>
    <dialog className="restore-dialog organization-dialog" ref={dialog} onCancel={e => { e.preventDefault(); close(); }}><div className="actions"><h2>组织管理</h2><button className="quiet" onClick={close}>关闭组织管理</button></div>
      {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
      <form onSubmit={e => { e.preventDefault(); void action(async () => { await api("/organization", "PUT", { name, revision: org!.revision }); await load(); setNotice("组织名称已保存"); }); }}><label>组织名称<input maxLength={100} value={name} disabled={!manage} onChange={e => setName(e.target.value)} required /></label>{manage && <button disabled={name === org?.name}>保存组织名称</button>}</form>
      {manage ? <><section className="organization-accounts"><h3>成员账号</h3><p className="muted">组织管理员可管理账号，但仍须单独获得项目权限。停用账号会结束其登录会话和处理任务。</p>
        <table className="data-table"><thead><tr><th>账号</th><th>组织角色</th><th>状态</th><th>操作</th></tr></thead><tbody>{members.map(m => <tr key={m.id}><td>{m.username}</td><td>{m.role === "owner" ? "所有者" : <select aria-label={`${m.username} 组织角色`} value={m.role} onChange={async e => { const role = e.target.value; if (await confirmAction(`确认调整 ${m.username} 的组织角色？`)) void action(async () => { await api(`/organization/members/${m.id}`, "PUT", { revision: m.revision, role, enabled: m.enabled }); await loadMembers(); }); }}><option value="member">成员</option><option value="admin">管理员</option></select>}</td><td>{m.enabled ? "正常" : "已停用"}</td><td>{m.role !== "owner" && <button className="quiet" aria-label={`${m.enabled ? "停用" : "启用"} ${m.username}`} onClick={async () => { if (await confirmAction(`确认${m.enabled ? "停用" : "启用"}账号 ${m.username}？`)) void action(async () => { await api(`/organization/members/${m.id}`, "PUT", { revision: m.revision, role: m.role, enabled: !m.enabled }); await loadMembers(); }); }}>{m.enabled ? "停用" : "启用"}</button>}</td></tr>)}</tbody></table>
        <div className="organization-account-actions">{more && <button className="quiet" onClick={() => void action(() => loadMembers(true))}>更多组织成员</button>}<button className="quiet" onClick={() => void action(loadMembers)}>刷新账号</button></div>
      </section><form className="account-create" onSubmit={e => { e.preventDefault(); void action(async () => { await api("/organization/members", "POST", { username, password }); setUsername(""); setPassword(""); await loadMembers(); setNotice("账号已创建，请通过安全渠道告知成员你设置的密码，并在项目中分配权限。"); }); }}><h3>添加成员</h3><label>成员账号<input autoComplete="off" value={username} maxLength={80} required onChange={e => setUsername(e.target.value)} /></label><label>初始密码<input type="password" autoComplete="new-password" value={password} minLength={12} maxLength={128} required onChange={e => setPassword(e.target.value)} /></label><p className="muted">请设置并妥善传达至少 12 位密码。密码不会再次展示。</p><button>创建成员账号</button></form>
        <Capacity run={run} api={api} /><AuditPanel run={run} api={api} />
      </> : <p className="muted">账号和组织信息由组织管理员维护。</p>}
    </dialog>
  </>;
}
