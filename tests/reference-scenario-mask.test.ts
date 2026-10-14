import {it,expect} from 'vitest';
import {referenceLegacyOrganizationMask,referenceLegacyAddressMask} from '../packages/core/reference-scenario-mask.ts';
it('consumes the full alternate organization suffix/prefix inventories and optional fallback settings',()=>{
 expect(referenceLegacyOrganizationMask('合成技术职业技术学校')).toBe('合成**职业技术学校');
 expect(referenceLegacyOrganizationMask('中国移动合成科技有限公司')).toBe('中国**有限公司');
 expect(referenceLegacyOrganizationMask('中铁合成有限公司')).toBe('中铁**有限公司');
 expect(referenceLegacyOrganizationMask('合成机构有限公司',{enableFallbackPrefix:false})).toBe('**有限公司');
 expect(referenceLegacyOrganizationMask('合成机构有限公司',{fallbackPrefixLength:3})).toBe('合成机**有限公司');
 expect(referenceLegacyOrganizationMask('合成机构有限公司',{minOrgNameLength:100})).toBe('**');
 expect(referenceLegacyOrganizationMask('合成机构有限公司',{fallbackPrefixLength:0})).toBe('**有限公司');
 expect(referenceLegacyOrganizationMask('😀合成有限公司',{fallbackPrefixLength:1})).toBe('**有限公司');
 expect(()=>referenceLegacyOrganizationMask('合成',{fallbackPrefixLength:-1})).toThrow('INVALID_REPLACEMENT');
 expect(referenceLegacyAddressMask('广东省深圳市南山区合成路88号')).toBe('广东省深圳市****');
});
