import { sourceFormatSchema } from '../contracts/index.ts';

// Original directory scanner predicates (main.js Vf/Cf/Df), with the Web
// adapter's already-supported TXT, CSV and XLSX formats retained.
const temporary = /^(?:~\$|\.~lock\.)|(?:\.tmp|\.temp|\.part|\.crdownload)$/iu;
const system = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);
export type SkippedFolderEntry = { sourceRelativePath: string; extension?: string; reasonCode: string; reason: string };

export function folderDirectorySkip(path: string, name: string): SkippedFolderEntry | null {
  return name.startsWith('.') || system.has(name.toLocaleLowerCase())
    ? { sourceRelativePath: path, reasonCode: 'hidden_or_system', reason: '隐藏或系统条目' }
    : null;
}

export function folderSkip(path: string, name: string, size: number): SkippedFolderEntry | null {
  const extension = name.match(/\.[^.]+$/u)?.[0].toLowerCase() ?? '';
  const item = (reasonCode: string, reason: string): SkippedFolderEntry => ({ sourceRelativePath: path, extension, reasonCode, reason });
  if (path.split('/').slice(1).some(part => part.startsWith('.') || system.has(part.toLocaleLowerCase()))) return item('hidden_or_system', '隐藏或系统条目');
  if (temporary.test(name)) return item('temporary_file', '临时文件');
  const format = extension.slice(1) === 'markdown' ? 'md' : extension.slice(1);
  if (!sourceFormatSchema.safeParse(format).success) return item('unsupported_format', '格式暂不支持');
  if (size === 0) return item('EMPTY_FILE', '空文件无法导入，处理失败');
  return null;
}
