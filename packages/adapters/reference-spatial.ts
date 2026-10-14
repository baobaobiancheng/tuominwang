import type { Anchor, ParsedPage, Mark } from '../contracts/index.ts';
import type { Glyph } from '../core/ocr.ts';
import { detectReferenceSpatialRelations, referenceSpatialTokensFromGlyphs } from '../core/reference-spatial.ts';
import { hash, readArtifact } from './storage.ts';

/** Use authenticated canonical OCR coordinates, never an invented source offset. */
export async function documentSpatialMarks(text: string, anchors: Anchor[], pages: ParsedPage[], overrides = new Map<number,Glyph[]>()): Promise<Mark[]> {
  const tokens = [];
  for (const page of pages) {
    const anchor = anchors.find(a => a.kind === 'page' && a.page === page.index || a.kind === 'object' && a.object === 'image-text' && a.part === page.part);
    if (!anchor) throw new Error('PAGE_POSITION_MISSING');
    let glyphs = overrides.get(page.index);
    if (!glyphs) {
      const bytes = await readArtifact(page.mapId);
      if (hash(bytes) !== page.mapHash) throw new Error('SOURCE_MISMATCH');
      glyphs = JSON.parse(bytes) as Glyph[];
    }
    tokens.push(...referenceSpatialTokensFromGlyphs(text,anchor,glyphs,page.index,page));
  }
  return detectReferenceSpatialRelations(text,tokens).candidates.map(({start,end,kind,decision,sources}) => ({start,end,kind,decision,sources}));
}
