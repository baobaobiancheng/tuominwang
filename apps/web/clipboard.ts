export type ClipboardResult = { success: true } | { success: false; error: string };

/** A successful write alone does not prove the clipboard accepted this text. */
export async function writeVerifiedClipboard(value: unknown): Promise<ClipboardResult> {
  if (typeof value !== 'string' || !value || value.length > 4096) {
    return { success: false, error: '剪贴板内容为空或过长' };
  }
  if (!globalThis.isSecureContext || !navigator.clipboard?.writeText || !navigator.clipboard?.readText) {
    return { success: false, error: '当前浏览器无法验证剪贴板，请手动复制' };
  }
  try {
    await navigator.clipboard.writeText(value);
    return await navigator.clipboard.readText() === value
      ? { success: true }
      : { success: false, error: '系统剪贴板未接受写入内容' };
  } catch {
    return { success: false, error: '无法写入并核验剪贴板，请允许浏览器剪贴板权限或手动复制' };
  }
}
