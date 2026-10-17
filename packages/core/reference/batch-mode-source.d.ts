export type SourceMode='default_star'|'full_star'|'default_pseudonym'|'custom_pseudonym'|'selective_pseudonym';
export function sourceModeFlags(mode:SourceMode):{pseudonym:boolean;customValue:boolean;selective:boolean;fullStar:boolean};
export function sourceNormalizeMode(mode:SourceMode,format:{visual:boolean}):SourceMode;
