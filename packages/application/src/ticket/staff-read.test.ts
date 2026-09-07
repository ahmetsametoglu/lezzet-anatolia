import { describe, expect, it } from 'vitest';
import { previewOf } from './staff-read';

/*
  KUYRUK ÖNİZLEMESİ (21.281) — DB'siz, saf bir dize kuralı; birim projesinde yaşar.

  Üç yüzey bu fonksiyonu okuyor: mobil talep listesi, web'in talepler sayfası ve yönetim hub'ının
  karar kartı. Ekranlarda ayrı ayrı sınamak, aynı kuralı üç kez ve bir gün üç farklı şekilde
  yazmak olurdu.
*/
describe('previewOf', () => {
  it('ilk satırı alır — önizleme bir TARAMA dizesidir, metnin tamamı değil', () => {
    expect(previewOf('Birinci satır\nİkinci satır')).toBe('Birinci satır');
  });

  it('120 karakteri aşınca kırpar ve üç nokta koyar', () => {
    const uzun = 'a'.repeat(200);
    const out = previewOf(uzun);
    expect(out).toHaveLength(120);
    expect(out.endsWith('…')).toBe(true);
  });

  /*
    CİHAZDA GÖRÜLEN ARIZA (07.09): talep listesi açılınca satırda ÇIPLAK işaretler duruyordu.
    21.279 biçimlendirmeyi yedi yüzeyde çizdirdi ama önizleme o yedinin içinde değildi — kimsenin
    saymadığı sekizinci yüzey burasıydı. Önizleme ÇİZİLMEZ, SÖKÜLÜR (fonksiyonun künyesi).
  */
  it('biçimlendirme işaretlerini SÖKER — kalın, italik, üstü çizili', () => {
    expect(previewOf('İki tepsi için *bedelsiz yeniden gönderim* planladık — yarın _09:00_ gibi')).toBe(
      'İki tepsi için bedelsiz yeniden gönderim planladık — yarın 09:00 gibi',
    );
    expect(previewOf('Eski teslim ~bugün 14:00~ iptal edildi')).toBe('Eski teslim bugün 14:00 iptal edildi');
  });

  it('SÖKME ÖNCE, KIRPMA SONRA — kırpma bir işaretin ortasına düşüp çıplak yıldız bırakmaz', () => {
    // İşaret 120. karakterin ötesinde: ters sırada sökülseydi kırpılan uçta tek yıldız kalırdı.
    const metin = `${'a'.repeat(115)} *kalın metin buraya*`;
    expect(previewOf(metin)).not.toContain('*');
  });
});
