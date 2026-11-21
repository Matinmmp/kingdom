import * as storybookMeadow from '../../theme/storybook_meadow.js';
import * as sunstoneDynasty from '../../theme/sunstone_dynasty.js';
import * as marbleRepublic from '../../theme/marble_republic.js';
import * as sakuraValley from '../../theme/sakura_valley.js';
import * as nordicFrost from '../../theme/nordic_frost.js';

export const THEMES = Object.freeze([
  { id: 'storybook_meadow', title: 'چمنزار قصه‌ها', unlockRequirement: 0, multiplier: 1.0, module: storybookMeadow },
  { id: 'sunstone_dynasty', title: 'سلسله آفتاب', unlockRequirement: 300000, multiplier: 1.1, module: sunstoneDynasty },
  { id: 'marble_republic', title: 'جمهوری مرمر', unlockRequirement: 1000000, multiplier: 1.2, module: marbleRepublic },
  { id: 'sakura_valley', title: 'دره شکوفه', unlockRequirement: 2500000, multiplier: 1.3, module: sakuraValley },
  { id: 'nordic_frost', title: 'دهکده برفی', unlockRequirement: 5000000, multiplier: 1.4, module: nordicFrost },
].map(Object.freeze));

export const DEFAULT_THEME_ID = THEMES[0].id;
export const getTheme = (id) => THEMES.find((theme) => theme.id === id);
export const formatNumber = (number) => Number(number).toLocaleString('fa-IR');
export const populationBonus = (theme) => `+${formatNumber(Math.round((theme.multiplier - 1) * 100))}٪ جمعیت`;
