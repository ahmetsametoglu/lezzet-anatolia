import { describe, expect, it } from 'vitest';
import { alertAllowed, hasNewInbound, MESSAGE_ALERT_COOLDOWN_MS } from './message-alert';

// 15.34 · 15.35 — yeni mesaj sesi ne zaman çalar. Web ve mobil aynı kararı okuyor; bu yüzden burada sınanıyor.

describe('hasNewInbound — ses yalnız müşteriden YENİ mesaj gelince', () => {
  it('açılıştaki ilk ölçüm taban çizgisidir — bekleyen eski mesajlar ses çaldırmaz', () => {
    expect(hasNewInbound(undefined, '2026-09-15T08:00:00Z')).toBe(false);
  });

  it('en son gelen mesaj anı ilerlediyse yeni mesaj var', () => {
    expect(hasNewInbound('2026-09-15T08:00:00Z', '2026-09-15T08:00:05Z')).toBe(true);
  });

  it('an değişmediyse yok — taslak, çeviri ya da bizim cevabımız zili çaldırır ama bu anı oynatmaz', () => {
    expect(hasNewInbound('2026-09-15T08:00:00Z', '2026-09-15T08:00:00Z')).toBe(false);
  });

  it('hiç mesaj yokken ilk gelen mesaj yenidir', () => {
    expect(hasNewInbound(null, '2026-09-15T08:00:00Z')).toBe(true);
  });

  it('kuyruk boşsa ya da damga okunamıyorsa ses yok', () => {
    expect(hasNewInbound('2026-09-15T08:00:00Z', null)).toBe(false);
    expect(hasNewInbound('2026-09-15T08:00:00Z', 'bozuk')).toBe(false);
    expect(hasNewInbound(null, 'bozuk')).toBe(false);
  });
});

describe('alertAllowed — mesaj selinde tek ses', () => {
  it('daha önce hiç çalmadıysa çalar', () => {
    expect(alertAllowed(null, 1_000)).toBe(true);
  });

  it('bekleme süresi dolmadan ikinci ses yok, dolunca var', () => {
    expect(alertAllowed(10_000, 10_000 + MESSAGE_ALERT_COOLDOWN_MS - 1)).toBe(false);
    expect(alertAllowed(10_000, 10_000 + MESSAGE_ALERT_COOLDOWN_MS)).toBe(true);
  });
});
