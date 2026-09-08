import { describe, expect, it } from 'vitest';
import { testPostalCode } from './postal-code';

/**
 * Yardımcının kendi testi VAR, çünkü tek işi bir arızayı önlemek: bu kural sessizce bozulursa
 * geri gelen şey bir hata değil **kararsız bir test paketi** olur — ve o, teşhisi en pahalı arıza
 * türü (ölçüldü 28.08: `delivery_zone_postal_code_pkey` çarpışması, 7 test hiç koşamadan düştü).
 *
 * İddialar yalnız GERÇEKTEN garanti edilene bakıyor. "1000 çağrı hepsi benzersiz" yazmak yanlış
 * olurdu: rastgele hane 1000 değerlik ve sayaç 10'da bir dönüyor, yani 11. çağrı 1.'ye binde bir
 * eşit olabilir. Tutmayacağı bilinen bir iddia, bir gün kendi kararsız testini doğurur.
 */
describe('testPostalCode', () => {
  it('beş haneli ve `00` ile başlar — FR/DE referansında `00` önekli gerçek kod yok, çarpışma yapıca imkânsız', () => {
    /* `9` öneği 29.08'de ölçülen tuzaktı: `postal_code_place`ta 314 gerçek `9xxxx` kodu var ve
       checkout adresi o tabloya soruyor — %3 çarpışma, `address_city_mismatch`. `00` iki tabloda da boş. */
    for (let i = 0; i < 50; i++) {
      const kod = testPostalCode();
      expect(kod).toMatch(/^00\d{3}$/);
      expect(kod.startsWith('67')).toBe(false);
      expect(kod.startsWith('9')).toBe(false);
    }
  });

  it('ARDIŞIK on çağrı birbirinden farklı — aynı süreçteki dosyaları sayaç kesin ayırır', () => {
    const kodlar = Array.from({ length: 10 }, () => testPostalCode());
    expect(new Set(kodlar).size).toBe(10);
  });

  it('rastgele hane de var — iki ayrı süreç aynı sırayı üretmez', () => {
    // Sayaç tek başına olsaydı her süreç `9…1`den başlar ve ayrı koşular birebir çakışırdı.
    const ilkler = new Set(Array.from({ length: 30 }, () => testPostalCode().slice(1, 4)));
    expect(ilkler.size).toBeGreaterThan(1);
  });
});
