// Minimal, deterministic, public synthetic PDFs; no private source documents.
export function pdfFixture(options: { pages?: number; text?: string; rotation?: number; author?: string; x?: number; y?: number; width?: number; height?: number } = {}) {
  const count = options.pages ?? 1;
  const quote = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>", `<< /Author (${quote(options.author ?? "public fixture")}) >>`];
  const kids: string[] = [];
  for (let page = 0; page < count; page++) {
    const pageId = objects.length + 1, streamId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const content = `BT /F1 20 Tf ${options.x ?? 40} ${options.y ?? 720} Td (${quote(options.text ?? "Phone 13800138000 - public synthetic sample")}) Tj ET`;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${options.width ?? 612} ${options.height ?? 792}] /Rotate ${options.rotation ?? 0} /Resources << /Font << /F1 3 0 R >> >> /Contents ${streamId} 0 R >>`);
    objects.push(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${count} /Kids [${kids.join(" ")}] >>`;
  let source = "%PDF-1.7\n", offsets = [0];
  for (let i = 0; i < objects.length; i++) { offsets.push(Buffer.byteLength(source)); source += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`; }
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` + offsets.slice(1).map(n => `${String(n).padStart(10, "0")} 00000 n \n`).join("");
  source += `trailer\n<< /Root 1 0 R /Info 4 0 R /Size ${objects.length + 1} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(source);
}
