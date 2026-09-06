import { describe, expect, it } from 'vitest';
import { maskSecretsInText, SECRET_MASK } from './secret-masking';

/*
  Bu testlerin çivilediği kural: defter KALIR. Log döner, defter kalmaz — bir kez düz yazılan sır
  geçerliliği boyunca her operatörün önünde durur (15.5 bütün konuşmaları okutuyor). Kural 30.07'de
  yazılıp yalnız log tarafında uygulanmıştı; 07.09'da ekranda `LA-WA-…` düz görününce açığa çıktı.
*/

describe('maskSecretsInText', () => {
  it('sırrı siler, cümlenin kalanını bırakır', () => {
    expect(maskSecretsInText('Hesabımı bağlamak istiyorum. LA-WA-PVK7LRQJ9FLG', ['LA-WA-PVK7LRQJ9FLG'])).toBe(
      `Hesabımı bağlamak istiyorum. ${SECRET_MASK}`,
    );
  });

  it('AYNI sır birden çok geçiyorsa hepsini maskeler', () => {
    // Müşteri kodu iki kez yazmış olabilir; tek geçişi maskelemek işi yarım bırakırdı.
    expect(maskSecretsInText('483920 ... yanlış mı? 483920', ['483920'])).toBe(`${SECRET_MASK} ... yanlış mı? ${SECRET_MASK}`);
  });

  it('birden çok sırrı birlikte maskeler', () => {
    expect(maskSecretsInText('LA-WA-ABC123DEF456 ve 483920', ['LA-WA-ABC123DEF456', '483920'])).toBe(
      `${SECRET_MASK} ve ${SECRET_MASK}`,
    );
  });

  it('sırrın HİÇBİR parçası bırakılmaz', () => {
    /* Son haneleri bırakmak bir kısaltmadır, maskeleme değil (`CLAUDE §1`): 6 haneli kodda son
       dördü bırakılsa geriye tahmin edilecek iki hane kalırdı. */
    const maskeli = maskSecretsInText('kod: 483920', ['483920']);
    expect(maskeli).not.toContain('4839');
    expect(maskeli).not.toContain('3920');
    expect(maskeli).not.toContain('20');
  });

  it('sır YOKSA metne dokunmaz', () => {
    // Altı haneli sayı gelen mesajlarda boldur (referans, adet, tutar). Bekleyen bir soru yokken
    // maskelemek defteri okunmaz yapardı — çağıran o kararı verir, burası verileni siler.
    expect(maskSecretsInText('siparişim 123456 nerede?', [null])).toBe('siparişim 123456 nerede?');
    expect(maskSecretsInText('merhaba', [])).toBe('merhaba');
  });

  it('boş ve tanımsız sırları yok sayar', () => {
    // Çağıran çıkarıcıların "bulamadım" cevabını süzmek zorunda kalmasın.
    expect(maskSecretsInText('merhaba', [null, undefined, '', '   '])).toBe('merhaba');
  });

  it('metin YOKSA null döner — medya mesajının metni yoktur', () => {
    expect(maskSecretsInText(null, ['483920'])).toBeNull();
    expect(maskSecretsInText(undefined, ['483920'])).toBeNull();
  });

  it('maskeden uzunluk sızmaz — kısa ve uzun sır aynı işareti alır', () => {
    const kisa = maskSecretsInText('a 483920 b', ['483920']);
    const uzun = maskSecretsInText('a LA-WA-PVK7LRQJ9FLG b', ['LA-WA-PVK7LRQJ9FLG']);
    expect(kisa).toBe(`a ${SECRET_MASK} b`);
    expect(uzun).toBe(`a ${SECRET_MASK} b`);
  });
});
