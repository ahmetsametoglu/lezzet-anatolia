import {
  customerAppColors,
  customerAppGradient,
  customerAppRadius,
  customerAppShadow,
  customerAppText,
  customerColors,
  customerRadius,
  customerText,
} from '@lezzet/design-tokens';

import { appFontAssets } from './fonts';
import { lightTheme } from './unistyles';

// Bağlantı kanıtı: tema değerleri design-tokens paketinden GELİYOR — beklenenler de paketten
// türetilir (ham değer teste de yazılmaz), böylece token değişince test tanım gereği ayak uydurur.
describe('Unistyles teması ↔ @lezzet/design-tokens kompozisyonu', () => {
  it('tabanın yalnız uygulamada olmayan anahtarlarını taşır', () => {
    expect(lightTheme.colors.ink).toBe(customerColors.ink);
    expect(lightTheme.colors.olive).toBe(customerColors.olive);
    expect(lightTheme.radius.soft).toBe(Number.parseFloat(customerRadius.soft));
    expect(lightTheme.text.body).toBe(Number.parseFloat(customerText.body));
  });

  it('aynı addaki anahtarda UYGULAMA kazanır (fark token’ları)', () => {
    // Beş fark rengi + iki fark yarıçapı: tabanla aynı ad, başka değer.
    expect(lightTheme.colors['sand-300']).toBe(customerAppColors['sand-300']);
    expect(lightTheme.colors['sand-300']).not.toBe(customerColors['sand-300']);
    expect(lightTheme.colors.star).toBe(customerAppColors.star);
    expect(lightTheme.colors['olive-line']).toBe(customerAppColors['olive-line']);
    expect(lightTheme.colors['closed-bg']).toBe(customerAppColors['closed-bg']);
    expect(lightTheme.colors['disabled-fill']).toBe(customerAppColors['disabled-fill']);

    expect(lightTheme.radius.card).toBe(Number.parseFloat(customerAppRadius.card));
    expect(lightTheme.radius.card).not.toBe(Number.parseFloat(customerRadius.card));
    expect(lightTheme.radius.pill).toBe(Number.parseFloat(customerAppRadius.pill));
  });

  it('uygulamaya-yeni aileleri ekler (hata · örtü · marka · kum kademeleri)', () => {
    expect(lightTheme.colors.error).toBe(customerAppColors.error);
    expect(lightTheme.colors.scrim).toBe(customerAppColors.scrim);
    expect(lightTheme.colors['sand-150']).toBe(customerAppColors['sand-150']);
    expect(lightTheme.colors['sand-250']).toBe(customerAppColors['sand-250']);
    expect(lightTheme.colors['brand-google']).toBe(customerAppColors['brand-google']);
    expect(lightTheme.radius.badge).toBe(Number.parseFloat(customerAppRadius.badge));
    expect(lightTheme.radius.control).toBe(Number.parseFloat(customerAppRadius.control));
  });

  it('üstbaşlığın ÜÇ alt-anahtarı da uygulamadan gelir (yarım ezme yok)', () => {
    expect(lightTheme.text.eyebrow).toBe(Number.parseFloat(customerAppText.eyebrow));
    expect(lightTheme.text['eyebrow--font-weight']).toBe(Number(customerAppText['eyebrow--font-weight']));
    expect(lightTheme.text['eyebrow--letter-spacing']).toBe(customerAppText['eyebrow--letter-spacing']);
    // Web'in kendi mobil forku tabandan gelmeye devam eder; uygulama onu kullanmaz.
    expect(lightTheme.text['eyebrow-sm']).toBe(Number.parseFloat(customerText['eyebrow-sm']));
  });

  it('px kademeleri sayıya (dp) çevrilir, em harf aralığı olduğu gibi kalır', () => {
    expect(lightTheme.text['screen-title']).toBe(Number.parseFloat(customerAppText['screen-title']));
    expect(lightTheme.text['h1--line-height']).toBe(Number(customerText['h1--line-height']));
    expect(lightTheme.text.button).toBe(Number.parseFloat(customerAppText.button));
    expect(lightTheme.text['button--font-weight']).toBe(700);
  });

  it('gölge token dizgesini AYNEN taşır (RN boxShadow CSS söz dizimini kabul eder)', () => {
    expect(lightTheme.shadow.hard).toBe(customerAppShadow.hard);
    expect(lightTheme.shadow.soft).toBe(customerAppShadow.soft);
    expect(lightTheme.shadow.badge).toBe(customerAppShadow.badge);
  });

  it('krem cam ailesi ve tükendi örtüsü temaya geçer (Token Kararlari #17, #18)', () => {
    expect(lightTheme.colors['cream-glass']).toBe(customerAppColors['cream-glass']);
    expect(lightTheme.colors['cream-glass-soft']).toBe(customerAppColors['cream-glass-soft']);
    expect(lightTheme.colors['scrim-72']).toBe(customerAppColors['scrim-72']);
    // "TAKİP" çipinin ikilisi de envanterde (#19) — çip varyantı henüz yok, token var.
    expect(lightTheme.colors['accent-leaf']).toBe(customerAppColors['accent-leaf']);
    expect(lightTheme.colors['ink-deep']).toBe(customerAppColors['ink-deep']);
  });

  it('fotoğraf-üstü ROL ikilisi uygulamada aynı aileden okunur (#14 + #15)', () => {
    // Ad tabandan (`on-image`), altyazı uygulamadan (`on-image-soft` ezildi) — ikisi bir ÇİFT.
    expect(lightTheme.colors['on-image']).toBe(customerColors['on-image']);
    expect(lightTheme.colors['on-image-soft']).toBe(customerAppColors['on-image-soft']);
    expect(lightTheme.colors['on-image-soft']).not.toBe(customerColors['on-image-soft']);
  });

  it('FONT SEAM ağırlıkla indekslenir ve yüklenen aile adlarını verir (Token Kararlari #24)', () => {
    /* RN'de ağırlık ailenin ADININ İÇİNDEDİR; seam ağırlıkla indekslenmezse `fontWeight` ile
       aile ayrışır ve cihaz sahte kalın üretir. Anahtarlar `appFontAssets`in anahtarlarıdır —
       yani yüklenmeyen bir aileye stil bağlanamaz (bağ derlemede de kurulu). */
    expect(lightTheme.font.display[600]).toBe('Lora_600SemiBold');
    expect(lightTheme.font.body[lightTheme.text['button--font-weight']]).toBe('Karla_700Bold');
    expect(Object.keys(appFontAssets).sort()).toEqual([
      'Karla_400Regular',
      'Karla_600SemiBold',
      'Karla_700Bold',
      'Lora_400Regular',
      'Lora_600SemiBold',
    ]);
  });

  it('İTALİK ve kullanılmayan ağırlıklar YÜKLENMEZ (paket boyu + açılış süresi)', () => {
    // Karar 24'ün açık hükmü: yalnız Lora 400·600 ve Karla 400·600·700.
    expect(Object.keys(appFontAssets).some((name) => name.includes('Italic'))).toBe(false);
    expect(appFontAssets).not.toHaveProperty('Lora_700Bold');
  });

  it('gradyanlar expo-linear-gradient prop’larına çevrilmiş hâlde durur', () => {
    // Renkler token dizgesinden birebir çıkar; durak yerleri yüzdeden orana döner.
    expect(lightTheme.gradient.photoTop.colors).toEqual([
      'rgba(21, 23, 15, 0.28)',
      'rgba(21, 23, 15, 0)',
    ]);
    expect(lightTheme.gradient.photoTop.locations).toEqual([0, 0.32]);
    expect(lightTheme.gradient.photoBottom.locations).toEqual([0.4, 1]);
    // 180deg = yukarıdan aşağı.
    expect(lightTheme.gradient.photoBottom.start).toEqual({ x: 0.5, y: 0 });
    expect(lightTheme.gradient.photoBottom.end).toEqual({ x: 0.5, y: 1 });
    // Token değişirse çeviri de değişsin: kaynak dizgeden bağımsız bir sabit yazılmadı.
    expect(customerAppGradient['photo-top']).toContain('rgba(21, 23, 15, 0.28)');
  });
});
