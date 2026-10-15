import { isWordFormat } from '../../packages/core/document-format.ts';
import React, { useEffect, useRef, useState } from 'react';
import type { DocumentView } from '../../packages/contracts/index.ts';
import type { DocumentConfiguration } from '../../packages/contracts/document-policy.ts';
import { useConfirmAction } from './confirm-action.tsx';

type ProfileOption = { id: string; name: string };
type LoadState = { key: string; phase: 'loading' | 'ready' | 'error'; configuration: DocumentConfiguration; profiles: ProfileOption[] };
const emptyLoad: LoadState = { key: '', phase: 'loading', configuration: {}, profiles: [] };

export function DocumentConfigurationEditor({ doc, api, run, onChanged, disabled }: {
  doc: DocumentView;
  api: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  run: (fn: () => Promise<void>) => Promise<void>;
  onChanged: () => Promise<void>;
  disabled: boolean;
}) {
  const confirm = useConfirmAction(), epoch = useRef(0);
  const [loaded, setLoaded] = useState<LoadState>(emptyLoad);
  const [attempt, setAttempt] = useState(0), [notice, setNotice] = useState('');
  const key = `${doc.id}:${doc.revision}`;
  const ready = loaded.key === key && loaded.phase === 'ready';
  const configuration: DocumentConfiguration = ready ? loaded.configuration : {};
  const profiles = ready ? loaded.profiles : [];
  const unavailableProfile = configuration.profileId && !profiles.some(p => p.id === configuration.profileId);
  function change(update: (old: DocumentConfiguration) => DocumentConfiguration) {
    setLoaded(current => current.key === key && current.phase === 'ready'
      ? { ...current, configuration: update(current.configuration) } : current);
  }
  useEffect(() => {
    const token = ++epoch.current;
    setNotice('');
    setLoaded({ key, phase: 'loading', configuration: {}, profiles: [] });
    void Promise.all([
      api<{ configuration: DocumentConfiguration }>(`/documents/${doc.id}/configuration`),
      api<{ items: { settings: ProfileOption }[] }>('/presets/profiles'),
    ]).then(([settings, templates]) => {
      if (token !== epoch.current) return;
      setLoaded({ key, phase: 'ready', configuration: settings.configuration, profiles: templates.items.map(p => p.settings) });
    }).catch(() => {
      if (token !== epoch.current) return;
      setLoaded({ key, phase: 'error', configuration: {}, profiles: [] });
    });
    return () => { epoch.current++; };
  }, [doc.id, doc.revision, attempt]);

  return <details>
    <summary>本材料识别与脱敏设置</summary>
    {loaded.key === key && loaded.phase === 'error' && <p role="alert" className="error">材料设置或方案目录读取失败。当前设置未更改，请重试加载后再保存。</p>}
    {loaded.key === key && loaded.phase === 'error' && <button className="secondary" onClick={() => setAttempt(n => n + 1)}>重试加载材料设置</button>}
    {!ready && (loaded.key !== key || loaded.phase === 'loading') && <p role="status">正在读取材料设置…</p>}
    <fieldset disabled={disabled || !ready}>
      <label>材料类型<select value={configuration.documentType ?? 'auto'} onChange={e => change(c => ({ ...c, documentType: e.target.value as DocumentConfiguration['documentType'] }))}>{Object.entries({ auto: '自动判断', general: '一般材料', contract: '合同', disclosure: '公开披露材料', judgment: '裁判文书', pleading: '诉讼文书', official_letter: '公文函件', screenshot: '截图材料' }).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>识别策略<select value={configuration.referenceStrategy ?? 'modern'} onChange={e => change(c => ({ ...c, referenceStrategy: e.target.value as 'modern' | 'legacy' }))}><option value="modern">标准识别</option><option value="legacy">兼容识别</option></select></label>
      {configuration.referenceStrategy === 'legacy' && <label className="checkbox"><input type="checkbox" checked={configuration.fragmentRecomposer ?? false} onChange={e => change(c => ({ ...c, fragmentRecomposer: e.target.checked }))} />姓名碎片重组</label>}
      <label>使用方案<select value={configuration.profileId ?? ''} onChange={e => change(c => ({ ...c, profileId: e.target.value || undefined }))}><option value="">沿用项目方案</option>{unavailableProfile && <option value={configuration.profileId}>已应用方案快照（原方案不在个人目录）</option>}{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <label>处理方式<select value={configuration.exportMode ?? ''} onChange={e => change(c => ({ ...c, exportMode: e.target.value ? e.target.value as DocumentConfiguration['exportMode'] : undefined, pseudonymRules: undefined }))}><option value="">沿用方案设置</option><option value="default_star">按类型遮盖</option><option value="full_star">全字符星号</option><option value="custom_pseudonym">项目假名</option><option value="selective_pseudonym">按类型设置假名</option></select></label>
      {isWordFormat(doc.format) && <fieldset><legend>Word 导出格式</legend>
        <label><input type="checkbox" checked={configuration.outputFormats?.includes('docx') ?? true} onChange={e => change(c => ({ ...c, outputFormats: e.target.checked ? [...new Set([...(c.outputFormats ?? []), 'docx' as const])] : (c.outputFormats ?? ['docx']).filter(v => v !== 'docx') }))} />DOCX</label>
        {doc.format === 'doc' && <label><input type="checkbox" checked={configuration.outputFormats?.includes('doc') ?? false} onChange={e => change(c => ({ ...c, outputFormats: e.target.checked ? [...new Set([...(c.outputFormats ?? ['docx']), 'doc' as const])] : (c.outputFormats ?? []).filter(v => v !== 'doc') }))} />DOC 原格式（严格回读核验）</label>}
        <label><input type="checkbox" checked={configuration.outputFormats?.includes('md') ?? false} onChange={e => change(c => ({ ...c, outputFormats: e.target.checked ? [...new Set([...(c.outputFormats ?? ['docx']), 'md' as const])] : (c.outputFormats ?? []).filter(v => v !== 'md') }))} />附带 Markdown</label>
      </fieldset>}
      <p className="muted">修改设置会重新识别本材料，原复核记录仍保留；生成新的副本前需要重新复核。</p>
      <button className="secondary" onClick={async () => {
        const token = epoch.current;
        if (!ready || !await confirm('保存本材料设置并重新识别？当前复核决定不会自动沿用。') || token !== epoch.current) return;
        void run(async () => {
          const changed = await api<{ revision: number }>(`/documents/${doc.id}/configuration`, 'POST', { revision: doc.revision, configuration });
          await api(`/documents/${doc.id}/recognize`, 'POST', { revision: changed.revision, ner: !!doc.nerEnabled });
          if (token !== epoch.current) return;
          setNotice('已提交重新识别');
          await onChanged();
        });
      }}>保存设置并重新识别</button>
      {notice && <p role="status">{notice}</p>}
    </fieldset>
  </details>;
}
