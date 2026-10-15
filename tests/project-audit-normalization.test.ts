import {test,expect} from 'vitest';
import {sourceAuditContains,sourceAuditSameValue} from '../apps/api/project-entities.ts';

test('source Xf contains stays case sensitive and never folds fullwidth Latin',()=>{
 expect(sourceAuditContains('ABC', 'abc')).toBe(false);
 expect(sourceAuditContains('ＡＢＣ','ABC')).toBe(false);
 expect(sourceAuditContains('甲\u200b（乙）','甲(乙)')).toBe(true);
 expect(sourceAuditContains('甲\u00ad乙','甲乙')).toBe(true);
});
test('source iv equality lowers case after Xf but never NFKC folds',()=>{
 expect(sourceAuditSameValue('ABC','abc')).toBe(true);
 expect(sourceAuditSameValue('ＡＢＣ','ABC')).toBe(false);
 expect(sourceAuditSameValue('甲\u200b（乙）','甲(乙)')).toBe(true);
});
