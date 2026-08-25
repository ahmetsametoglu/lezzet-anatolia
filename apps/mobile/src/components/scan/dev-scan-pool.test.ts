import { DEV_SCAN_POOL } from './dev-scan-pool';

/*
  SİMÜLASYON HAVUZU ↔ FİZİKSEL ETİKET SETİ (24.08 kararı).

  Havuz, `scripts/seed/test-labels.ts`teki sabit setin AYNASIDIR — scripts paketi mobile'a
  bağlanamadığı için bilinçli kopya. Kopyanın bedeli sessiz ayrışmadır: kodlar kayarsa çip
  "tanınmayan"a düşer, akış anlamlı kalır ama ÇİPE BASMAK İLE KÂĞIDI OKUTMAK aynı şeyi test
  etmemeye başlar — ve bunu kimse fark etmez.

  Buradan seti import EDEMEYİZ; ama kopyanın taşıması gereken ÖZELLİKLERİ ölçebiliriz: kodlar
  kâğıda basılabilir olmalı (EAN-13 sağlama basamağı geçerli), benzersiz olmalı ve dört yolu
  temsil etmeli. Kod elle değiştirilirse bu testler kırılır.
*/

/** `scripts/barcode-svg.ts` › `ean13CheckDigit`in aynası — kopya, çünkü scripts mobile'a bağlanmaz. */
function ean13CheckDigit(body12: string): number {
  return (10 - ([...body12].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0) % 10)) % 10;
}

/** `gtin14CheckDigit`in aynası — ağırlıklar EAN'ın TERSİ (3,1,3,1…). */
function gtin14CheckDigit(body13: string): number {
  return (10 - ([...body13].reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 3 : 1), 0) % 10)) % 10;
}

describe('DEV_SCAN_POOL', () => {
  it('her çip KÂĞIDA basılabilir bir koda karşılık gelir', () => {
    // Kâğıtta EAN-13 (13 hane) ya da ITF-14 (14 hane) olarak basılıyorlar; sağlama basamağı
    // tutmayan kodu okuyucu sessizce yutar, yani kâğıt çalışmaz ve sebebi görünmez.
    // Düşen iddia hangi çipe ait olduğunu söylemeli: jest `expect(value, mesaj)` biçimini
    // desteklemiyor (vitest'in aksine), o yüzden kusur ETİKETİYLE birlikte toplanıp bir kez
    // karşılaştırılıyor — "beklenen []" çıktısı hangi çipin bozuk olduğunu doğrudan yazar.
    const kusurlu = DEV_SCAN_POOL.filter(({ code }) => {
      if (!/^\d+$/.test(code) || ![13, 14].includes(code.length)) return true;
      const beklenen = code.length === 13 ? ean13CheckDigit(code.slice(0, 12)) : gtin14CheckDigit(code.slice(0, 13));
      return Number(code.at(-1)) !== beklenen;
    }).map(({ label, code }) => `${label} (${code})`);

    expect(kusurlu).toEqual([]);
  });

  it('kodlar BENZERSİZ — iki çip aynı yolu tetiklemez', () => {
    const kodlar = DEV_SCAN_POOL.map((entry) => entry.code);
    expect(new Set(kodlar).size).toBe(kodlar.length);
  });

  it('taramanın BEŞ yolunu birden taşır — biri düşerse o yol kamerasız sınanamaz', () => {
    // Etiketler kalıcı ve sıraları setin sırasıyla aynı; ad değişebilir ama YOL sayısı değişmemeli.
    expect(DEV_SCAN_POOL).toHaveLength(5);
    expect(DEV_SCAN_POOL.map((entry) => entry.label)).toEqual([
      'Paket',
      'Koli ×24',
      'Toplama',
      'Yabancı ürün',
      'Tanınmayan',
    ]);
  });

  it('çip etiketi KODU söylemez, YOLU söyler', () => {
    // Etikette kod yazsaydı depocu (ve tur kuran ajan) hangi hâli tetiklediğini okuyamazdı;
    // simülasyonun tek işi o hâli seçebilmek.
    for (const { label, code } of DEV_SCAN_POOL) {
      expect(label).not.toContain(code);
    }
  });
});
