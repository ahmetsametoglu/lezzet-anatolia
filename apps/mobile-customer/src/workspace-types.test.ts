import { LocalizedTextSchema, resolveLocalizedText } from '@lezzet/types';

// Paket-paylaşım kanıtı: @lezzet/types Zod şeması mobil test hattında AYNEN çalışıyor —
// "şema tek kaynak" değişmezi mobile genişler, elle DTO yazılmaz (docs/uygulama/02 §3.2).
describe('@lezzet/types workspace paylaşımı', () => {
  it('LocalizedTextSchema geçerli çok dilli metni parse eder ve yedek zinciri çalışır', () => {
    const parsed = LocalizedTextSchema.parse({ tr: 'Fıstıklı baklava', fr: 'Baklava à la pistache' });

    expect(resolveLocalizedText(parsed, 'fr')).toBe('Baklava à la pistache');
    // `de` boş: yedek zinciri kanonik sıraya (TR → FR → DE) düşer.
    expect(resolveLocalizedText(parsed, 'de')).toBe('Fıstıklı baklava');
  });

  it('tüm dilleri boş metni reddeder (en az bir dil kuralı — refine mobilde de işler)', () => {
    const result = LocalizedTextSchema.safeParse({ tr: '', fr: '   ' });

    expect(result.success).toBe(false);
  });
});
