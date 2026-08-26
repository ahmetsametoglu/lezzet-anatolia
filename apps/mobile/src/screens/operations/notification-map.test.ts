import { agoOf, toOperationsNotification } from './notification-map';

/*
  OPERASYON EŞLEMESİ (14.13) — uçtan gelen satır → kabuğun bildirimi. Çivilenenler:
  · `document_undeliverable` yönetim/alert'e düşer ve başlık referansı taşır (yasal belge insana
    düştü — operatör "hangi sipariş" sorusunu satırdan okumalı)
  · bilinmeyen tür SESSİZCE DÜŞMEZ: yönetim/quiet + genel başlık
  · göreli zaman v2'nin biçimi (dk · sa · g), dakika altı "şimdi"
*/

const NOW = new Date('2026-08-26T12:00:00Z');

const row = (over: Record<string, unknown> = {}) => ({
  id: 'n-1',
  kind: 'document_undeliverable',
  targetType: 'order' as const,
  targetId: 'o-1',
  payload: { referenceNo: 'LA-26-X1' } as Record<string, unknown>,
  createdAt: '2026-08-26T11:58:00Z',
  readAt: null,
  ...over,
});

describe('toOperationsNotification', () => {
  it('ulaştırılamayan belge: yönetim · alert · başlıkta referans', () => {
    const sonuc = toOperationsNotification(row(), NOW);
    expect(sonuc).toMatchObject({ section: 'management', dot: 'alert', ago: '2 dk' });
    expect(sonuc.title).toContain('LA-26-X1');
    expect(sonuc.title).toContain('e-postası yok');
  });

  it('bilinmeyen tür genel satıra düşer — sessizce kaybolmaz', () => {
    const sonuc = toOperationsNotification(row({ kind: 'yeni_personel_turu', payload: {} }), NOW);
    expect(sonuc).toMatchObject({ section: 'management', dot: 'quiet' });
    expect(sonuc.title.length).toBeGreaterThan(5);
  });
});

describe('agoOf', () => {
  it('dakika altı "şimdi"; dk → sa → g eşikleri v2 biçiminde', () => {
    expect(agoOf('2026-08-26T11:59:40Z', NOW)).toBe('şimdi');
    expect(agoOf('2026-08-26T11:51:00Z', NOW)).toBe('9 dk');
    expect(agoOf('2026-08-26T09:00:00Z', NOW)).toBe('3 sa');
    expect(agoOf('2026-08-23T12:00:00Z', NOW)).toBe('3 g');
  });
});
