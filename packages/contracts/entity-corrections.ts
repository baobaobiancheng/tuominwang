import{z}from'zod';import{id,markSchema}from'./index.ts';
const text=z.string().trim().min(1).refine(v=>v.isWellFormed()&&!v.includes('\0'));
const box=z.object({x:z.number().finite().nonnegative(),y:z.number().finite().nonnegative(),width:z.number().finite().positive(),height:z.number().finite().positive()}).strict();
export const entityCorrectionRequestSchema=z.object({recognizedText:text,correctedText:text,targetType:text,source:z.enum(['highlight-context-menu','manual-draw']),sourceDocumentId:id.optional(),sourceEntity:markSchema.pick({start:true,end:true,kind:true,rawEntityType:true}).extend({markIndex:z.number().int().nonnegative().optional()}).optional(),sourceRegionId:id.optional(),sourceAnchor:z.object({page:z.number().int().nonnegative(),box}).strict().optional()}).strict().refine(r=>r.source!=='manual-draw'||!!(r.sourceDocumentId&&r.sourceAnchor));
export type EntityCorrectionRequest=z.infer<typeof entityCorrectionRequestSchema>;
