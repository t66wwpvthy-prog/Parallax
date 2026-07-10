export const GOAL_AREAS=[['travel','Travel'],['home','Home'],['family','Family'],['health','Health'],['purpose','Purpose'],['other','Other']];
export const GOAL_AREA_LBL=Object.fromEntries(GOAL_AREAS);

/* Goals Horizon icon + color palette.
   Each area maps to an SVG path (16x16 viewBox) and a muted hue triple.
   fi = fill alpha on band, gl = glow alpha on box-shadow, st = icon stroke. */
export const GOAL_ICONS_SVG = {
  travel:  `<path d="M2 9.5l12-5-4.2 6.5-1.6-2.2L2 9.5ZM8.2 8.8 7 13l1.2-3"/>`,
  home:    `<path d="M2.5 7.5 8 3l5.5 4.5M4.3 6.5V13h7.4V6.5"/>`,
  family:  `<path d="M2.5 6.5h11V13h-11zM2.5 6.5h11M8 6.5V13M8 6.5C6 6.5 5 5.5 5 4.4 5 3.6 5.6 3 6.4 3 7.6 3 8 5 8 6.5ZM8 6.5C10 6.5 11 5.5 11 4.4 11 3.6 10.4 3 9.6 3 8.4 3 8 5 8 6.5Z"/>`,
  health:  `<path d="M8 13.5C4 11 2 8.5 2 5.8 2 4 3.4 2.6 5.2 2.6c1.1 0 2.1.6 2.8 1.5.7-.9 1.7-1.5 2.8-1.5C12.6 2.6 14 4 14 5.8c0 2.7-2 5.2-6 7.7Z"/>`,
  purpose: `<path d="M8 2l1.8 3.6 4 .6-2.9 2.8.7 4L8 11l-3.6 1.9.7-4L2.2 6.2l4-.6z"/>`,
  other:   `<circle cx="8" cy="8" r="4.5"/>`,
};

// rgb = "R,G,B" string; fi = band fill alpha; gl = glow alpha; st = icon stroke hex
export const GOAL_COLOR_MAP = {
  travel:  { rgb:'196,154,94',  fi:.55, gl:.30, st:'#d2ac72' },
  home:    { rgb:'127,155,181', fi:.50, gl:.26, st:'#9bb6cc' },
  family:  { rgb:'194,154,122', fi:.50, gl:.24, st:'#d2ac8c' },
  health:  { rgb:'111,161,160', fi:.50, gl:.40, st:'#86b3b2' },
  purpose: { rgb:'146,134,182', fi:.45, gl:.40, st:'#aaa0c8' },
  other:   { rgb:'139,149,196', fi:.42, gl:.30, st:'#a3abd2' },
};
