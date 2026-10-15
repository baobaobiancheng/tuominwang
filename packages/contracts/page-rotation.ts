import{z}from'zod';
const quarter=z.union([z.literal(90),z.literal(180),z.literal(270)]),pageKey=z.string().regex(/^(?:0|[1-9][0-9]*)$/u);
export const pageRotationStateSchema=z.object({version:z.literal(1),rotations:z.record(pageKey,quarter),manualOnlyPages:z.array(z.number().int().nonnegative())}).strict().refine(s=>new Set(s.manualOnlyPages).size===s.manualOnlyPages.length);
export type PageRotationState=z.infer<typeof pageRotationStateSchema>;
export const emptyPageRotationState=():PageRotationState=>({version:1,rotations:{},manualOnlyPages:[]});
export const pageRotationRequestSchema=z.object({revision:z.number().int().nonnegative(),mode:z.enum(['recognize','manual']),rotations:z.record(pageKey,z.union([z.literal(0),quarter])),pages:z.array(z.number().int().nonnegative()).min(1)}).strict().refine(s=>new Set(s.pages).size===s.pages.length&&Object.keys(s.rotations).every(k=>s.pages.includes(Number(k))));
export type PageRotationRequest=z.infer<typeof pageRotationRequestSchema>;
