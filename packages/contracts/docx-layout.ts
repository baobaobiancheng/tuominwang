/** JSON-only, inert OOXML projection. Offsets always refer to the stored canonical text. */
export type DocxTextStyle = { font?: string; size?: number; bold?: boolean; italic?: boolean; underline?: boolean; strike?: boolean; color?: string; background?: string; vertical?: "super" | "sub"; deleted?: boolean };
export type DocxParagraphStyle = { align?: "left" | "right" | "center" | "justify"; before?: number; after?: number; left?: number; right?: number; indent?: number; line?: number; breakBefore?: boolean };
export type DocxRun = { kind: "text"; text: string; start: number; end: number; style: DocxTextStyle } | { kind: "break"; page?: boolean } | { kind: "tab" } | { kind: "image"; page: number; width?: number; height?: number };
export type DocxParagraph = { kind: "paragraph"; id: string; part: string; start?: number; end?: number; style: DocxParagraphStyle; runs: DocxRun[] };
export type DocxBlock = DocxParagraph | { kind: "table"; widths: number[]; rows: { cells: { span: number; merge?: "restart" | "continue"; blocks: DocxBlock[] }[] }[] };
export type DocxLayout = { version: 1; page: { width: number; height: number; top: number; right: number; bottom: number; left: number }; blocks: DocxBlock[]; supplements: { part: string; label: string; blocks: DocxBlock[] }[]; warnings: string[]; mappedParagraphs: number; otherObjectCount: number };
