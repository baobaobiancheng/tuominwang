import { isWordFormat } from '../../packages/core/document-format.ts';
import { entityTypeIds, type Profile } from '../../packages/contracts/presets.ts';
import React, { useEffect, useRef, useState } from 'react';
import type { DocumentView } from '../../packages/contracts/index.ts';
import type { DocumentConfiguration } from '../../packages/contracts/document-policy.ts';
import { useConfirmAction } from './confirm-action.tsx';
import { entityLabels } from './presets.tsx';

type Format = NonNullable<DocumentConfiguration['outputFormats']>[number];
type ProfileOption = { settings: Profile };
type RuleOption = { settings: { id: string; name: string } };
type Effective = {
  profile: {
    name: string; enabledEntityTypeIds: Profile['enabledEntityTypeIds'];
    pseudonymTypeActions: Profile['pseudonymTypeActions']; mode: NonNullable<DocumentConfiguration['exportMode']>;
    hasAppliedDocumentProfile: boolean; baseSnapshotAvailable: boolean;
    word: { removeImages: boolean; removeHeaderFooter: boolean; commentHandlingMode: NonNullable<DocumentConfiguration['commentHandlingMode']> } | null;
    visualMaskStyle: NonNullable<DocumentConfiguration['maskStyle']> | null;
  };
  ruleset: { selection: 'project' | 'none' | 'material'; applied: { id: string; name: string } | null; fromSealedDocumentSnapshot: boolean };
  additionalOutputs: { markdown: boolean; pdfDocx: boolean; legacyDoc: boolean };
  unifiedPseudonyms: boolean;
};
type LoadState = {
  key: string; phase: 'loading' | 'ready' | 'error'; configuration: DocumentConfiguration;
  original: DocumentConfiguration; effective: Effective | null; batch: boolean;
  profiles: ProfileOption[]; rulesets: RuleOption[];
};
const emptyLoad: LoadState = { key: '', phase: 'loading', configuration: {}, original: {}, effective: null, batch: false, profiles: [], rulesets: [] };
const prefixPattern = /^[\p{L}_-]{1,20}$/u;
const actions = { mask: '仅遮盖', pseudonym: '假名化', partial_star: '部分星号', full_star: '全部星号' } as const;
const modeLabels = { default_star: '按类型遮盖', full_star: '全字符星号', default_pseudonym: '假名化（旧方案）', custom_pseudonym: '项目假名', selective_pseudonym: '按类型设置假名' } as const;
const colours = { black: '黑色', white: '白色', purple: '紫色', lightGray: '浅灰色' } as const;
const materialTypes = { auto: '自动判断', general: '一般材料', contract: '合同', disclosure: '公开披露材料', judgment: '裁判文书', pleading: '诉讼文书', official_letter: '公文函件', screenshot: '截图材料' };
function modeFromProfile(profile: Profile, format: string, batch: boolean) {
  const kind = isWordFormat(format) ? 'docx' : format === 'pdf' ? 'pdf' : ['png', 'jpg', 'jpeg'].includes(format) ? 'image' : 'markdown';
  if (batch) return profile.batch[`${kind}DefaultMode` as 'docxDefaultMode' | 'pdfDefaultMode' | 'imageDefaultMode' | 'markdownDefaultMode'];
  return profile[kind].defaultMode;
}
function primaryFormat(format: string): Format {
  return isWordFormat(format) ? 'docx' : format === 'pdf' ? 'pdf' : ['png', 'jpg', 'jpeg'].includes(format) ? 'png' : format === 'txt' ? 'txt' : format as Format;
}

export function DocumentConfigurationEditor({ doc, api, run, onChanged, disabled }: {
  doc: DocumentView;
  api: <T>(path: string, method?: string, body?: unknown) => Promise<T>;
  run: (fn: () => Promise<void>) => Promise<void>;
  onChanged: () => Promise<void>;
  disabled: boolean;
}) {
  const confirm = useConfirmAction(), epoch = useRef(0);
  const [loaded, setLoaded] = useState<LoadState>(emptyLoad);
  const loadedRef = useRef(loaded);
  loadedRef.current = loaded;
  const [expanded, setExpanded] = useState(false);
  const [attempt, setAttempt] = useState(0), [rebindRuleset, setRebindRuleset] = useState(false), [rebindProfile, setRebindProfile] = useState(false), [notice, setNotice] = useState('');
  const key = `${doc.id}:${doc.revision}`;
  const format = doc.format ?? 'txt';
  const ready = loaded.key === key && loaded.phase === 'ready' && loaded.effective !== null;
  const configuration: DocumentConfiguration = ready ? loaded.configuration : {};
  const effective = ready ? loaded.effective : null;
  const manager = doc.permissions?.includes('manage_dictionary') ?? false;
  const profiles = ready ? loaded.profiles : [];
  const rulesets = ready ? loaded.rulesets : [];
  // The directory may already contain a newer version of the same ID. Show
  // this material's sealed effective snapshot until the user changes selection.
  const profileSelectionChanged = configuration.profileId !== loaded.original.profileId;
  const previewCurrentProfile = profileSelectionChanged || rebindProfile;
  const selectedProfile = previewCurrentProfile ? profiles.find(p => p.settings.id === configuration.profileId)?.settings : undefined;
  const pendingProjectProfile = previewCurrentProfile && configuration.profileId === undefined;
  const unavailableProfile = configuration.profileId && configuration.profileId !== 'system_default' && !profiles.some(p => p.settings.id === configuration.profileId);
  const canReapplyProfile = !!effective?.profile.hasAppliedDocumentProfile && !profileSelectionChanged &&
    (!configuration.profileId || configuration.profileId === 'system_default' || profiles.some(p => p.settings.id === configuration.profileId));
  const profileTypes = selectedProfile?.enabledEntityTypeIds ?? effective?.profile.enabledEntityTypeIds ?? [];
  const enabledTypes = configuration.entityTypes ?? profileTypes;
  const profileActions = selectedProfile?.pseudonymTypeActions ?? effective?.profile.pseudonymTypeActions ?? {};
  const typeActions = configuration.pseudonymRules ?? profileActions;
  const mode = configuration.exportMode ?? (selectedProfile ? modeFromProfile(selectedProfile, format, loaded.batch) : effective?.profile.mode);
  const rulesetChoice = configuration.rulesetId === undefined ? 'project' : configuration.rulesetId === null ? 'none' : configuration.rulesetId;
  const appliedRule = effective?.ruleset.applied;
  const unavailableRule = !!configuration.rulesetId && !rulesets.some(r => r.settings.id === configuration.rulesetId);
  const word = selectedProfile?.docx ?? effective?.profile.word;
  const inheritedMaskStyle = doc.pageReview?.maskStyle ?? (selectedProfile && format === 'pdf' ? selectedProfile.pdf.maskStyle : selectedProfile && ['png', 'jpg', 'jpeg'].includes(format) ? selectedProfile.image.maskStyle : effective?.profile.visualMaskStyle) ?? 'black';
  const profileMarkdown = selectedProfile && isWordFormat(format) ? (loaded.batch ? selectedProfile.batch.exportMarkdownByKind.docx : selectedProfile.docx.exportMarkdown)
    : selectedProfile && format === 'pdf' ? (loaded.batch ? selectedProfile.batch.exportMarkdownByKind.pdf : selectedProfile.pdf.exportMarkdown)
    : selectedProfile && ['png', 'jpg', 'jpeg'].includes(format) ? (loaded.batch ? selectedProfile.batch.exportMarkdownByKind.image : selectedProfile.image.exportMarkdown)
    : undefined;
  const profilePdfDocx = selectedProfile?.pdf.exportPdfAsDocx;
  const inheritedMarkdown = format === 'txt' ? false : profileMarkdown ?? effective?.additionalOutputs.markdown ?? false;
  const inheritedPdfDocx = profilePdfDocx ?? effective?.additionalOutputs.pdfDocx ?? false;
  const configuredFormats = configuration.outputFormats ?? [primaryFormat(format), ...(inheritedMarkdown ? ['md' as const] : []), ...(format === 'pdf' && inheritedPdfDocx ? ['docx' as const] : [])];
  // Even old policies containing only "md" still produce the Word primary.
  const outputFormats = format === 'doc' && !configuredFormats.includes('doc') && !configuredFormats.includes('docx')
    ? ['docx' as const, ...configuredFormats] : configuredFormats;
  const included = (format: Format) => outputFormats.includes(format);
  const hasExtraOutputs = isWordFormat(format) || format === 'pdf' || ['png', 'jpg', 'jpeg', 'txt'].includes(format);
  const invalidPrefixes = Object.values(configuration.pseudonymPrefixes ?? {}).some(value => !prefixPattern.test(value));
  const duplicatePrefixes = new Set(Object.values(configuration.pseudonymPrefixes ?? {})).size !== Object.values(configuration.pseudonymPrefixes ?? {}).length;
  const invalidTypes = ready && enabledTypes.length === 0;
  const invalidActions = mode === 'selective_pseudonym' && (configuration.exportMode === 'selective_pseudonym' || configuration.pseudonymRules !== undefined)
    && !Object.values(typeActions).some(value => value !== 'pseudonym');
  const changed = ready && (JSON.stringify(configuration) !== JSON.stringify(loaded.original) || rebindRuleset || rebindProfile);

  function change(update: (old: DocumentConfiguration) => DocumentConfiguration) {
    setLoaded(current => current.key === key && current.phase === 'ready'
      ? { ...current, configuration: update(current.configuration) } : current);
    setNotice('');
  }
  function toggleFormat(output: Format, checked: boolean) {
    change(current => {
      const next = new Set(current.outputFormats ?? outputFormats);
      if (checked) next.add(output); else next.delete(output);
      // The worker publishes a primary artifact even if a historical policy
      // lists only optional outputs. Keep the UI's explicit list consistent.
      if (format === 'doc') {
        if (!next.has('doc') && !next.has('docx')) next.add('docx');
      } else next.add(primaryFormat(format));
      return { ...current, outputFormats: [...next] };
    });
  }
  function setRuleSelection(value: string) {
    change(current => {
      const { rulesetId: _old, ...rest } = current;
      return value === 'project' ? rest : { ...rest, rulesetId: value === 'none' ? null : value };
    });
    setRebindRuleset(false);
  }
  function setProfileSelection(value: string) {
    change(current => ({ ...current, profileId: value ? value as DocumentConfiguration['profileId'] : undefined }));
    setRebindProfile(false);
  }
  useEffect(() => {
    const token = ++epoch.current;
    if (!expanded || loadedRef.current.key === key && loadedRef.current.phase === 'ready') return () => { epoch.current++; };
    setNotice(''); setRebindRuleset(false); setRebindProfile(false);
    setLoaded({ ...emptyLoad, key });
    void Promise.all([
      api<{ configuration: DocumentConfiguration; revision: number; batch: boolean; effective: Effective }>(`/documents/${doc.id}/configuration`),
      api<{ items: ProfileOption[] }>('/presets/profiles'),
      manager ? api<{ items: RuleOption[] }>('/presets/rulesets') : Promise.resolve({ items: [] }),
    ]).then(([settings, profileCatalogue, ruleCatalogue]) => {
      if (token !== epoch.current) return;
      // Never allow a stale or partial response to become editable state.
      if (settings.revision !== doc.revision || !settings.effective?.additionalOutputs || typeof settings.effective.unifiedPseudonyms !== 'boolean' ||
        typeof settings.effective.profile?.hasAppliedDocumentProfile !== 'boolean' || typeof settings.effective.profile?.baseSnapshotAvailable !== 'boolean') throw new Error('CONFIGURATION_RESPONSE_INCOMPLETE');
      setLoaded({ key, phase: 'ready', configuration: settings.configuration, original: settings.configuration,
        effective: settings.effective, batch: settings.batch, profiles: profileCatalogue.items, rulesets: ruleCatalogue.items });
    }).catch(() => {
      if (token !== epoch.current) return;
      setLoaded({ ...emptyLoad, key, phase: 'error' });
    });
    return () => { epoch.current++; };
  }, [doc.id, doc.revision, attempt, manager, expanded]);

  return <details className="document-configuration" onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary>本材料识别与脱敏设置</summary>
    {loaded.key === key && loaded.phase === 'error' && <p role="alert" className="error">材料设置或目录读取失败。当前设置未更改，请重试加载后再保存。</p>}
    {loaded.key === key && loaded.phase === 'error' && <button className="secondary" onClick={() => setAttempt(n => n + 1)}>重试加载材料设置</button>}
    {!ready && (loaded.key !== key || loaded.phase === 'loading') && <p role="status">正在读取材料设置…</p>}
    <fieldset disabled={disabled || !ready}>
      <label>材料类型<select value={configuration.documentType ?? 'auto'} onChange={e => change(c => ({ ...c, documentType: e.target.value as DocumentConfiguration['documentType'] }))}>{Object.entries(materialTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>识别策略<select value={configuration.referenceStrategy ?? 'modern'} onChange={e => change(c => ({ ...c, referenceStrategy: e.target.value as 'modern' | 'legacy' }))}><option value="modern">标准识别</option><option value="legacy">兼容识别</option></select></label>
      {configuration.referenceStrategy === 'legacy' && <label className="check-label"><input type="checkbox" checked={configuration.fragmentRecomposer ?? false} onChange={e => change(c => ({ ...c, fragmentRecomposer: e.target.checked }))} />姓名碎片重组</label>}

      <label>使用方案<select value={configuration.profileId ?? ''} onChange={e => setProfileSelection(e.target.value)}><option value="">沿用项目方案</option>{unavailableProfile && <option value={configuration.profileId}>本材料正在使用（个人列表中已移除）</option>}{profiles.map(p => <option key={p.settings.id} value={p.settings.id}>{p.settings.name}</option>)}</select></label>
      <p className="muted">当前材料使用：{effective?.profile.name ?? '未读取'}。{effective?.profile.hasAppliedDocumentProfile ? '普通保存会保留本材料已应用的方案内容；若方案后来调整，可选择重新应用并核对新的识别结果。' : '首次保存会应用当前选择的方案，并重新识别本材料。'}</p>
      {effective?.profile.hasAppliedDocumentProfile && !effective.profile.baseSnapshotAvailable && <p className="muted">这份材料使用较早保存的方案。修改识别类型、处理方式等方案覆盖设置前，需要明确重新应用当前方案。</p>}
      {canReapplyProfile && <label className="check-label"><input type="checkbox" checked={rebindProfile} onChange={e => { setRebindProfile(e.target.checked); setNotice(''); }} />重新应用当前方案（保留本材料的单独设置）</label>}
      {effective?.profile.hasAppliedDocumentProfile && !canReapplyProfile && unavailableProfile && <p className="muted">当前方案已不在可选列表中。可继续沿用本材料已应用的设置；若需更新，请选择可用方案。</p>}

      <fieldset><legend>本材料规则库</legend>
        <p className="muted">当前已应用：{appliedRule?.name ?? '无规则库'}{effective?.ruleset.fromSealedDocumentSnapshot ? '（本材料已用版本）' : '（项目设置）'}。{effective?.ruleset.fromSealedDocumentSnapshot ? '只修改其他设置会保留本材料已用的规则；需要更新规则时请勾选下方选项。' : '首次保存会采用当前项目规则；之后修改其他设置仍保留本材料已用的规则。'}</p>
        <label>规则选择<select value={rulesetChoice} disabled={!manager} onChange={e => setRuleSelection(e.target.value)}><option value="project">沿用项目规则</option><option value="none">不使用规则</option>{unavailableRule && <option value={configuration.rulesetId!}>本材料正在使用：{appliedRule?.name ?? '个人列表中已移除的规则'}</option>}{rulesets.map(r => <option key={r.settings.id} value={r.settings.id}>{r.settings.name}</option>)}</select></label>
        {manager && rulesetChoice !== 'none' && <label className="check-label"><input type="checkbox" checked={rebindRuleset} onChange={e => setRebindRuleset(e.target.checked)} />更新为当前规则版本</label>}
        {!manager && <p className="muted">更换或刷新规则库需要规则管理权限；仍可修改其他材料设置。</p>}
      </fieldset>

      {pendingProjectProfile && <p role="status">当前沿用项目方案。保存并重新识别后，可查看更新后的方案选项。</p>}
      <fieldset disabled={pendingProjectProfile}><legend>材料方案覆盖设置</legend>
      <fieldset><legend>识别的信息类型（{enabledTypes.length} 项）</legend>
        <button type="button" className="quiet" disabled={!configuration.entityTypes} onClick={() => change(c => ({ ...c, entityTypes: undefined }))}>恢复沿用方案类型</button>
        <div className="permission-grid">{entityTypeIds.map(type => <label key={type} className="check-label"><input type="checkbox" checked={enabledTypes.includes(type)} onChange={e => change(c => {
          const current = c.entityTypes ?? profileTypes;
          return { ...c, entityTypes: e.target.checked ? [...current, type] : current.filter(item => item !== type) };
        })} />{entityLabels[type]}</label>)}</div>
      </fieldset>
      <label>处理方式<select value={configuration.exportMode ?? ''} onChange={e => change(c => ({ ...c, exportMode: e.target.value ? e.target.value as DocumentConfiguration['exportMode'] : undefined, pseudonymRules: undefined }))}><option value="">沿用方案设置（当前：{mode ? modeLabels[mode] : '未读取'}）</option>{Object.entries(modeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      {mode === 'selective_pseudonym' && <fieldset><legend>按类型的假名策略</legend>{enabledTypes.map(type => <label key={type}>{entityLabels[type]}<select value={typeActions[type] ?? 'pseudonym'} onChange={e => change(c => ({ ...c, exportMode: 'selective_pseudonym', pseudonymRules: { ...(c.pseudonymRules ?? profileActions), [type]: e.target.value as keyof typeof actions } }))}>{Object.entries(actions).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>)}<p className="muted">仅遮盖在 PDF/图片与文字输出的呈现方式不同；保存后以实际复核和副本为准。</p></fieldset>}
      {['default_pseudonym', 'custom_pseudonym', 'selective_pseudonym'].includes(mode ?? '') && <fieldset><legend>新假名的类型前缀</legend>{enabledTypes.filter(type => mode !== 'selective_pseudonym' || (typeActions[type] ?? 'pseudonym') === 'pseudonym').map(type => <label key={type}>{entityLabels[type]}前缀<input value={configuration.pseudonymPrefixes?.[type] ?? ''} maxLength={20} onChange={e => change(c => {
        const prefixes = { ...(c.pseudonymPrefixes ?? {}) };
        if (e.target.value) prefixes[type] = e.target.value; else delete prefixes[type];
        return { ...c, pseudonymPrefixes: Object.keys(prefixes).length ? prefixes : undefined };
      })} /></label>)}<p className="muted">仅用于此后生成的假名；不会重命名已有映射。仅支持文字、下划线与连字符，不允许重复。</p></fieldset>}

      {isWordFormat(format) && <fieldset><legend>Word 附加清理</legend>
        <label className="check-label"><input type="checkbox" checked={configuration.removeImages ?? word?.removeImages ?? false} onChange={e => change(c => ({ ...c, removeImages: e.target.checked }))} />移除 Word 图片</label>
        <label className="check-label"><input type="checkbox" checked={configuration.removeHeaderFooter ?? word?.removeHeaderFooter ?? false} onChange={e => change(c => ({ ...c, removeHeaderFooter: e.target.checked }))} />移除页眉页脚</label>
        <label>Word 批注<select value={configuration.commentHandlingMode ?? word?.commentHandlingMode ?? 'keep'} onChange={e => change(c => ({ ...c, commentHandlingMode: e.target.value as DocumentConfiguration['commentHandlingMode'] }))}><option value="keep">保留</option><option value="remove">删除</option><option value="anonymize">匿名化</option></select></label>
      </fieldset>}
      {(format === 'pdf' || ['png', 'jpg', 'jpeg'].includes(format)) && <><label>本材料遮盖颜色<select aria-describedby={`material-colour-help-${doc.id}`} value={configuration.maskStyle ?? ''} onChange={e => change(c => ({ ...c, maskStyle: e.target.value ? e.target.value as DocumentConfiguration['maskStyle'] : undefined }))}><option value="">沿用复核页或方案颜色（当前：{colours[inheritedMaskStyle]}）</option>{Object.entries(colours).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><small id={`material-colour-help-${doc.id}`}>明确选择材料颜色会覆盖复核页颜色；恢复沿用后复核页颜色优先于方案默认色。</small></>}

      {hasExtraOutputs && <fieldset><legend>副本格式</legend>
        {format === 'doc' ? <><label className="check-label"><input type="checkbox" checked={included('doc')} onChange={e => toggleFormat('doc', e.target.checked)} />DOC 原格式（作为主结果）</label><label className="check-label"><input type="checkbox" checked={included('docx')} disabled={!included('doc')} onChange={e => toggleFormat('docx', e.target.checked)} />同时保留 DOCX</label></> : <p className="muted">主结果：{primaryFormat(format).toUpperCase()}（始终生成）</p>}
        {format === 'pdf' && <label className="check-label"><input type="checkbox" checked={included('docx')} onChange={e => toggleFormat('docx', e.target.checked)} />附加 Word（DOCX）</label>}
        <label className="check-label"><input type="checkbox" checked={included('md')} onChange={e => toggleFormat('md', e.target.checked)} />附带 Markdown</label>
      </fieldset>}
      </fieldset>
      {loaded.batch && ['default_pseudonym', 'custom_pseudonym', 'selective_pseudonym'].includes(mode ?? '') && <label className="check-label"><input type="checkbox" checked={configuration.unifiedPseudonyms ?? effective?.unifiedPseudonyms ?? true} onChange={e => change(c => ({ ...c, unifiedPseudonyms: e.target.checked }))} />本批次统一假名</label>}

      {(invalidTypes || invalidPrefixes || duplicatePrefixes || invalidActions) && <p role="alert" className="error">{invalidTypes ? '至少保留一种识别类型。' : invalidPrefixes || duplicatePrefixes ? '假名前缀格式无效或重复。' : '按类型假名模式至少选择一种非假名动作。'}</p>}
      <p className="muted">设置只应用于本材料。保存后会重新识别，新的结果需要重新复核；已有副本及下载链接不变。若保存时网络中断，请先重新打开材料确认设置。</p>
      <button className="secondary" disabled={!changed || invalidTypes || invalidPrefixes || duplicatePrefixes || invalidActions} onClick={async () => {
        const token = epoch.current, chosen = configuration, rebind = rebindRuleset, refreshProfile = rebindProfile;
        if (!ready || !await confirm(`${refreshProfile ? '重新应用当前方案并保存本材料设置' : '保存本材料设置'}并重新识别？当前复核决定不会自动沿用。`) || token !== epoch.current) return;
        void run(async () => {
          let saved: { id: string; revision: number };
          try {
            saved = await api<{ id: string; revision: number }>(`/documents/${doc.id}/configuration`, 'POST', { revision: doc.revision, configuration: chosen,
              ...(rebind ? { rebindRuleset: true } : {}), ...(refreshProfile ? { rebindProfile: true } : {}) });
          } catch (error) {
            if ((error as { code?: string; status?: number }).code === 'PROFILE_BASE_UNAVAILABLE' && (error as { status?: number }).status === 400) {
              if (token === epoch.current) setNotice(canReapplyProfile
                ? '这份材料需要先重新应用当前方案，才能修改这些设置。请核对方案，勾选“重新应用当前方案”后再保存。'
                : '这份材料需要重新选择可用方案，才能修改这些设置。当前内容未保存。');
              return;
            }
            throw error;
          }
          if (saved.id !== doc.id || saved.revision !== doc.revision + 1) throw new Error('CONFIGURATION_REVISION_MISMATCH');
          try { await api(`/documents/${doc.id}/recognize`, 'POST', { revision: saved.revision, ner: !!doc.nerEnabled }); }
          catch (error) { if (token === epoch.current) { setNotice('设置已保存，但重新识别未提交或未完成。请查看当前材料状态，再重新识别。'); await onChanged(); } throw error; }
          if (token !== epoch.current) return;
          setNotice('已提交重新识别');
          await onChanged();
        });
      }}>保存设置并重新识别</button>
      {notice && <p role="status">{notice}</p>}
    </fieldset>
  </details>;
}
