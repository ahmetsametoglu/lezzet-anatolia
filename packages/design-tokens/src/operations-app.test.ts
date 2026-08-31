/*
  KOMPOZİSYON SÖZLEŞMESİ — `operations-app.ts`in güvencesi (21.9).

  Operasyon mobil teması ÜÇ katmanın birleşimidir: ortak taban (`customer.ts`) → mobil müşteri
  seti (`customer-app.ts`) → operasyon mobil farkları (bu dosyanın konusu); aynı addaki anahtarda
  EN SON katman kazanır. Bu test o kuralın üç yönünü birden sabitler:
    · fark anahtarları gerçekten operasyon değerini veriyor mu (ezme ÇALIŞIYOR mu),
    · alt katmanların geri kalanı olduğu gibi geçiyor mu (ezme SIZMIYOR mu),
    · setin ANTİ-KOPYA kuralı tutuyor mu — operasyona-yeni bir rengin değeri, alt katmanlarda
      zaten duran bir değerle BİREBİR aynı olamaz. Bu üçüncüsü yorumla anlatılan disiplinin
      makineyle doğrulanan hâlidir: aynı tonun iki adla yaşaması ancak burada yakalanır.

  Parite testinden AYRI: o test `globals.css` ikizini denetler ve bu dosyayı hiç görmez.
  DB'siz, saf: birim projesinde koşar.
*/
import { describe, expect, it } from 'vitest';
import {
  customerColors,
  customerRadius,
  customerSand,
  customerText,
} from './customer';
import {
  customerAppBlur,
  customerAppColors,
  customerAppRadius,
  customerAppShadow,
  customerAppText,
} from './customer-app';
import { operationsBrand } from './operations';
import {
  operationsAppColors,
  operationsAppGradient,
  operationsAppInk,
  operationsAppLine,
  operationsAppOverrides,
  operationsAppRadius,
  operationsAppShadow,
  operationsAppSurface,
  operationsAppText,
} from './operations-app';

/** Operasyon mobil temasının kurduğu birleşimin ta kendisi — tüketici (Unistyles) da böyle kurar. */
const baseColors = { ...customerColors, ...customerAppColors };
const baseText = { ...customerText, ...customerAppText };
const baseRadius = { ...customerRadius, ...customerAppRadius };

const composedColors = { ...baseColors, ...operationsAppColors };
const composedText = { ...baseText, ...operationsAppText };
const composedRadius = { ...baseRadius, ...operationsAppRadius };

/** Bir haritanın öteki haritayla ORTAK olan anahtarları (fark token'ları). */
function sharedKeys(base: Record<string, string>, layer: Record<string, string>): string[] {
  return Object.keys(layer).filter((key) => key in base);
}

describe('operations-app ↔ müşteri katmanları kompozisyonu', () => {
  it('fark anahtarları operasyon değerini verir (son katman TABANI EZER)', () => {
    expect(composedColors.cream).toBe('#f2f0e8'); // taban #faf6ec
    expect(composedColors['olive-bg']).toBe('#e3ecd2'); // taban #eef2e2
    /* TONLU KARTIN HATA ZEMİNİ (30.08) — taban #f4e3e0 bu yüzeyde fazla koyu: v3'ün kalıbı çok
       açık zemin + renkli kenar, dolu bir pembe kutuyu uyarı bandına çevirirdi. Rol birebir aynı
       olduğu için yeni ad AÇILMADI, değer ezildi. */
    expect(composedColors['error-bg']).toBe('#fdf6f4');
    expect(sharedKeys(baseColors, operationsAppColors)).toEqual(['cream', 'olive-bg', 'error-bg']);
  });

  it('operasyona-YENİ anahtarlar iki taban katmanında da yok, birleşimde var', () => {
    /* `error-line` bu listeden ÇIKTI (30.08): tabana taşındı (`customerAppError`) çünkü paylaşılan
       kitin `error` tonu iki yüzeyde birden yaşıyor. Artık operasyona-yeni değil, MİRAS. */
    for (const key of ['panel', 'neutral-bg', 'ink-inset', 'warehouse', 'tab-inactive']) {
      expect(baseColors, `${key} taban katmanlarında olmamalı`).not.toHaveProperty(key);
      expect(composedColors, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
    for (const key of ['meta', 'tag']) {
      expect(baseText, `${key} taban katmanlarında olmamalı`).not.toHaveProperty(key);
      expect(composedText, `${key} birleşimde olmalı`).toHaveProperty(key);
    }
    expect(baseRadius).not.toHaveProperty('tight');
    expect(composedRadius.tight).toBe('8px');
  });

  it('ANTİ-KOPYA: yeni renk/yarıçap durağı, taban katmanlarındaki bir değerin ikinci adı DEĞİL', () => {
    /* Setin tek varlık sebebi FARKI taşımaktır; birebir aynı bir değeri yeni bir adla yazmak,
       aynı tonu iki yerden yönetmek demektir (CLAUDE §1). Fark anahtarları bilerek dışarıda —
       onların işi zaten var olan bir ADI ezmek. */
    /* `Set<string>` bilinçli: sabit birleşimle kurulsaydı TypeScript `has()` çağrısını "bu değer
       zaten kümede olamaz" diye REDDEDER ve kural derleme anında sessizce kanıtlanmış olurdu —
       ama kopya EKLENDİĞİ gün derleyici de susardı. Çalışma zamanı kontrolü kuralın bekçisidir. */
    const baseColorValues = new Set<string>(Object.values(baseColors));
    for (const [key, value] of Object.entries({
      ...operationsAppSurface,
      ...operationsAppInk,
      ...operationsAppLine,
    })) {
      expect(baseColorValues.has(value), `${key} (${value}) tabanda zaten var — yeni ad açılmamalı`)
        .toBe(false);
    }
    const baseRadiusValues = new Set<string>(Object.values(baseRadius));
    for (const [key, value] of Object.entries(operationsAppRadius)) {
      expect(baseRadiusValues.has(value), `${key} (${value}) tabanda zaten var`).toBe(false);
    }
  });

  it('YAZI ölçeğinde değer paylaşımı serbesttir, rol paylaşımı değil', () => {
    /* `tag` (11px) ile tabanın `eyebrow-sm`i aynı ÖLÇÜYÜ taşır — anti-kopya kuralı tipografide
       geçmez, çünkü taban da aynı ölçüyü birden çok rolde taşır (lead 18 = card-title-sm 18;
       body-sm 14 = chip 14). Ayrım alt anahtarlardadır: `eyebrow-sm` 600 + .1em ile bir DEMET,
       `tag` yalnız ölçüdür ve ağırlığı çağıran verir. */
    expect(composedText.tag).toBe('11px');
    expect(composedText['eyebrow-sm']).toBe('11px');
    expect(composedText).not.toHaveProperty('tag--font-weight');
    expect(composedText).not.toHaveProperty('tag--letter-spacing');
    expect(composedText).not.toHaveProperty('meta--font-weight');
    // Tasarımda 10,5 diye bir değer birleşimde YOKTU; yarım piksel yuvarlanmadı.
    expect(composedText.meta).toBe('10.5px');
    expect(Object.values(baseText)).not.toContain('10.5px');
  });

  it('yazı ölçeği operasyon mobilde YENİDEN KURULMAZ — merdiven mobil müşterininki', () => {
    /* Tasarımda 18 ayrı boy ölçüldü; 16'sı buradan gelir, ikisi (`meta`, `tag`) yukarıda ayrıca
       sınandı. Bu satırlar o devralmanın bekçisi: biri kayarsa operasyon ekranları da kayar. */
    expect(composedText.eyebrow).toBe('10px'); // üstbaşlık (10/700/.18em)
    expect(composedText['eyebrow--letter-spacing']).toBe('0.18em');
    expect(composedText['badge-sm']).toBe('10px'); // sayaç rozeti, kart etiketi
    expect(composedText.helper).toBe('12px');
    expect(composedText['field-label']).toBe('12.5px');
    expect(composedText.note).toBe('13px');
    expect(composedText.control).toBe('13.5px');
    expect(composedText['body-sm']).toBe('14px');
    /* `button` operasyonda EZİLDİ (30.08): 14,5 → 13,5. Değer `control` ile aynı çıkıyor ve bu
       bir kopya DEĞİL — ikisi ayrı rol (biri girdi/kontrol ölçüsü, öteki düğme etiketi) ve eşik
       kuralı yeni ANAHTAR açmayı yönetir, farkı değil (dosyanın kendi künyesi). */
    expect(composedText.button).toBe('13.5px'); // düğme etiketi — operasyon farkı
    expect(composedText.body).toBe('15px');
    expect(composedText.step).toBe('16px');
    expect(composedText['screen-title']).toBe('17px'); // Lora 600 ekran başlığı
    expect(composedText['card-title-sm']).toBe('18px');
    expect(composedText['sheet-title']).toBe('19px');
    expect(composedText['h2-sm']).toBe('20px'); // Lora 600 adres başlığı
    expect(composedText['icon-sm']).toBe('20px'); // "›"
    expect(composedText.icon).toBe('22px'); // "‹"
    expect(composedText['card-title']).toBe('24px'); // Lora 600 hub başlığı
    expect(composedText.micro).toBe('11.5px');
    // Sayılar 800 ağırlıkla SEKİZ ayrı boyda yazılıyor: 800 bir kademe değil, kademe üstü ağırlık.
    expect(operationsAppText).not.toHaveProperty('amount');
  });

  it('tasarımın devraldığı RENK durakları yerinde — bu dosya onları kopyalamadığı için', () => {
    expect(composedColors.card).toBe('#ffffff'); // girdi zemini + dolu düğme metni
    expect(composedColors['on-image']).toBe('#f5f1e6'); // koyu yüzeyde krem metin
    expect(composedColors['sand-150']).toBe('#efdfc2'); // koyu CTA içindeki rozet metni
    expect(composedColors['sand-500']).toBe('#cdc4a8'); // standart kenarlık (#c9c2ae buraya bağlandı)
    expect(composedColors['sand-300']).toBe('#e2d8bd'); // satır ayracı (#ddd6c4 buraya bağlandı)
    expect(composedColors['sand-600']).toBe('#b3ab97'); // yön oku "›"
    expect(composedColors['olive-line']).toBe('#cddbb0'); // zeytin çip kenarı (#cdd8b6 buraya)
    expect(composedColors['disabled-fill']).toBe('#b9b29e'); // kapalı CTA
    expect(composedColors.error).toBe('#a44a3f');
    expect(composedColors['terracotta-bg']).toBe('#f9ede2');
    expect(composedColors['olive-dark']).toBe('#4a6121');
    expect(composedColors.body).toBe('#6d7261');
    // Sekme çubuğu = krem cam + 8px bulanıklık; ikisi de mobil müşteri setinden gelir.
    expect(composedColors['cream-glass']).toBe('rgba(243, 239, 226, 0.96)');
    expect(customerAppBlur.glass).toBe('8px');
    // WhatsApp yeşili operasyon markasından; bu dosyada ikinci bir kaydı YOK.
    expect(operationsBrand['brand-whatsapp']).toBe('#128c4b');
    expect(operationsAppColors).not.toHaveProperty('brand-whatsapp');
  });

  it('v3 ölçümleri: üçüncü gri güncellendi, tonlu kartın kenarı açıldı', () => {
    /* v2'nin #a49b85'i v3 şablonunda HİÇ geçmiyor; yerini alan ton 91 kullanımla hem seçilmeyen
       sekmenin hem de dipnot satırının rengi. Değer korunsaydı ekranın en çok yazılan yardımcı
       satırı tasarımdan bir kademe koyu çizilirdi. */
    expect(composedColors['tab-inactive']).toBe('#a8a191');
    /* Tonlu kartın kimliği ZEMİNDE değil KENARDA: hata zemini (#fdf6f4) `panel`e Δ2/4/0
       uzaklıkta, yani ayrı bir durak açmaya değmez — ayıran şey bu kenarlıktır. */
    expect(composedColors['error-line']).toBe('#e0b9b2');
    expect(composedColors['error-line']).not.toBe(composedColors['terracotta-line']);
    /* UYARI kenarı (30.08) — hata kenarından AYRI bir durak: ikisi farklı şey söylüyor ("bir
       şey bozuk" ⟷ "bir şey eksik"). `terracotta-line`e bağlanamaz (Δ13/32/4, ikinci kanal
       eşiğin çok üstünde) ve o zaten turuncu ailenin kenarıdır. */
    expect(composedColors['warning-line']).toBe('#d9a97f');
    expect(composedColors['warning-line']).not.toBe(composedColors['error-line']);
    expect(Object.keys(operationsAppLine)).toEqual(['warning-line']);
  });

  it('YARIÇAP: resmî 4\'lü set devralınır, altına yalnız bir durak eklenir', () => {
    expect(composedRadius.badge).toBe('12px');
    expect(composedRadius.control).toBe('16px'); // tasarımın en sık yarıçapı (55 kullanım)
    expect(composedRadius.card).toBe('20px');
    expect(composedRadius.pill).toBe('22px'); // daireler ve ince haplar bunun kırpılmasıyla doğar
    expect(Object.keys(operationsAppRadius)).toEqual(['tight']);
  });

  it('`hard-on-ink` kum skalasından TÜRER — ikinci kez yazılmamıştır', () => {
    // Mürekkep gölge mürekkep düğmenin altında görünmez; koyu CTA'nın gölgesi pasif kum tonudur.
    expect(operationsAppShadow['hard-on-ink']).toContain(customerSand['sand-600']);
    expect(operationsAppShadow['hard-on-ink']).toBe('3px 3px 0 #b3ab97');
    // Açık zeminli CTA'ların sert gölgesi mobil müşteri setinden gelir, burada tekrarlanmaz.
    expect(customerAppShadow.hard).toContain('#343b41');
    expect(operationsAppShadow).not.toHaveProperty('hard');
  });

  it('yapışkan solma gradyanı sayfa zemininden türer; şeffaf durak `transparent` değil', () => {
    const fade = operationsAppGradient['sticky-fade'];
    expect(fade).toContain(operationsAppOverrides.cream);
    expect(fade).not.toContain('transparent');
    expect(fade).toContain(', 0)');
  });

  it('fark/yeni dağılımı sabit: 4 fark + 17 yeni', () => {
    expect(sharedKeys(baseColors, operationsAppColors)).toHaveLength(3);
    // `button` 30.08'de farka döndü: operasyon düğmeleri müşterininkinden bir punto küçük.
    expect(sharedKeys(baseText, operationsAppText)).toHaveLength(1);
    expect(sharedKeys(baseRadius, operationsAppRadius)).toHaveLength(0);

    const total =
      Object.keys(operationsAppColors).length +
      Object.keys(operationsAppText).length +
      Object.keys(operationsAppRadius).length +
      Object.keys(operationsAppShadow).length +
      Object.keys(operationsAppGradient).length;
    /* 3 fark + 17 operasyona-yeni. `error-line` 30.08'de TABANA taşındı (paylaşılan kitin `error`
       tonu iki yüzeyde birden yaşıyor) — sayı bir azaldı ve azalması gerekiyordu: aynı değeri iki
       katmanda tanımlamak "ikinci ad" olurdu, anti-kopya testi onu zaten reddediyor.
       30.08'de dört durak açıldı: `shadow.glow` (v3'ün TEK gölge
       benzeri durağı — yapışkan okutma CTA'sının zeytin ışıması), `warning-line` (uyarı kartının
       kenarı) ve TONLU KARTIN İKİ ZEMİNİ — `error-bg` (fark: tabanın #f4e3e0'ı ezildi) +
       `warning-bg` (yeni). Son ikisi §4'ün eşiğine takılıp bilerek AÇILMAMIŞTI; kullanıcı cihazda
       farkı gördü ve varsayım çürüdü — gerekçesi `operations-app.ts`te kanal dengesi ölçümüyle
       yazılı. Sayı bilerek elle yazılıyor — türetilseydi test "kaç durak var"ı ölçmez, kendini
       ölçerdi; yeni bir durak açan buraya uğrayıp gerekçesini yazmak zorunda kalsın diye böyle. */
    expect(total).toBe(21);
  });

  it('birleşim taban katmanlarını BÜYÜTÜR, küçültmez', () => {
    for (const key of Object.keys(baseColors)) expect(composedColors).toHaveProperty(key);
    expect(Object.keys(composedColors)).toHaveLength(
      Object.keys(baseColors).length + Object.keys(operationsAppColors).length - 3,
    );
  });
});
