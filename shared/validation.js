export const THEME_REQUIREMENTS = Object.freeze({
  storybook_meadow: 0, sunstone_dynasty: 300000, marble_republic: 1000000,
  sakura_valley: 2500000, nordic_frost: 5000000,
});
export const POWERUP_TYPES = Object.freeze(['undo', 'swap', 'sweeper']);
export const MAX_SCORE = 999999999;

export function validateUsername(value) {
  const username = typeof value === 'string' ? value.trim().normalize('NFKC') : '';
  if ([...username].length < 3 || [...username].length > 16) return { ok: false, error: 'نام کاربری باید بین ۳ تا ۱۶ نویسه باشد.' };
  if (!/^[A-Za-z0-9۰-۹٠-٩آاأإءؤئبپتثجچحخدذرزژسشصضطظعغفقکكگلمنوهةیيىۀ_]+$/u.test(username)) {
    return { ok: false, error: 'فقط حروف فارسی یا انگلیسی، عدد و زیرخط (_) مجاز است.' };
  }
  return { ok: true, username };
}

export function usernameLower(value) {
  return value.trim().normalize('NFKC').toLowerCase().replace(/ك/g, 'ک').replace(/[يى]/g, 'ی')
    .replace(/[۰-۹٠-٩]/g, (digit) => String(digit.charCodeAt(0) % 16));
}

export function tehranDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tehran', calendar: 'gregory',
    year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map((key) => parts.find((part) => part.type === key).value).join('-');
}
