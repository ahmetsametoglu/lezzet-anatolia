import { captionOf } from './caption';

/*
  ÜSTBAŞLIK KÜNYESİNİN TEK KURALI — ölçülemeyen parça YAZILMAZ.

  Dosya saf ve testi de saf; korunan şey biçim değil DAVRANIŞ: bir gün "boş dizeyi de geçirelim"
  ya da "eksik parçaya tire koyalım" diye sadeleştiren biri, beş üstbaşlıkta birden ortada duran
  bir " · " ya da uydurma bir değer üretir (CLAUDE §1).
*/

describe('captionOf — künye satırı', () => {
  it('elde olan parçaları ` · ` ile birleştirir', () => {
    expect(captionOf('Deniz Arslan', 'Strasbourg Merkez')).toBe('Deniz Arslan · Strasbourg Merkez');
  });

  it('ölçülemeyen parça satırdan DÜŞER — yerine boşluk ya da tire konmaz', () => {
    expect(captionOf('28 Ağustos', null)).toBe('28 Ağustos');
    expect(captionOf('28 Ağustos', undefined, 'Kehl Depo')).toBe('28 Ağustos · Kehl Depo');
  });

  it('BOŞ DİZE de düşer — bir biçimlendiricinin boş dönmesi "değer yok" demenin öteki yoludur', () => {
    expect(captionOf('DEPO', '')).toBe('DEPO');
  });

  it('hiç parça kalmazsa satır HİÇ DOĞMAZ (`undefined`)', () => {
    // Başlık komponentleri `undefined` gördüğünde satırı çizmez; boş dize bir satır çizerdi.
    expect(captionOf(null, undefined, '')).toBeUndefined();
  });
});
