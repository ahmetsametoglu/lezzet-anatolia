import { dateDigitsDelete, dateDigitsFrom, dateDigitsPress, dateFromDigits, dateMask } from './date-keypad-value';

/*
  Tarih tuş takımının değer kuralları: altı rakamda durur, maske eksiği gösterir, olmayan gün
  ISO'ya dönmez (31.02 gibi) — eski klavye girişinin iki arızası (olmayan gün, belirsiz biçim)
  burada kapıda kalır.
*/
describe('date-keypad-value', () => {
  it('rakam ekler, altıda durur, siler', () => {
    let digits = '';
    for (const key of ['1', '2', '0', '9', '2', '7', '9']) digits = dateDigitsPress(digits, key);
    expect(digits).toBe('120927');
    expect(dateDigitsPress(digits, ',')).toBe('120927');
    expect(dateDigitsDelete(digits)).toBe('12092');
  });

  it('maske eksik haneleri alt çizgiyle gösterir', () => {
    expect(dateMask('')).toBe('__.__.__');
    expect(dateMask('120')).toBe('12.0_.__');
    expect(dateMask('120927')).toBe('12.09.27');
  });

  it('altı rakam ISO olur; eksik ya da takvimde olmayan tarih null', () => {
    expect(dateFromDigits('120927')).toBe('2027-09-12');
    expect(dateFromDigits('12092')).toBeNull();
    expect(dateFromDigits('310227')).toBeNull();
    expect(dateFromDigits('290228')).toBe('2028-02-29');
  });

  it('ISO açılış değeri rakama döner; tanınmayan boş', () => {
    expect(dateDigitsFrom('2027-09-12')).toBe('120927');
    expect(dateDigitsFrom('')).toBe('');
  });
});
