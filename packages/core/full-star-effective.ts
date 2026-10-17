import type {Mark} from '../contracts/index.ts';

/** rr2/ur2 effective full-star view; iy2 leaves the editable draft unchanged. */
export function fullStarEffectiveMarks(marks:Mark[]):Mark[]{
  return marks.map(mark=>mark.decision==='redact'
    ? {...mark,replacement:{mode:'full' as const},replacementOrigin:'overall' as const,rasterReplacement:false}
    : mark);
}
