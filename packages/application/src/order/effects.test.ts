import { describe, expect, it } from 'vitest';
import { deferredNotices, notifyStatusEffect, providerRefunder, type OrderEffects } from './effects';

describe('deferredNotices', () => {
  it('haber yanıtı bekletmez, koşturucu çalışınca gönderilir; iade beklemede kalır', async () => {
    const sent: string[] = [];
    let release: () => void = () => {};
    const effects: OrderEffects = {
      notifyStatus: (orderId) =>
        new Promise<void>((resolve) => {
          release = () => {
            sent.push(orderId);
            resolve();
          };
        }),
      refunder: async () => ({ status: 'ok', refundId: 're_1' }),
    };
    const later: (() => Promise<void>)[] = [];

    const deferred = deferredNotices(effects, (task) => later.push(task));
    // Gönderim hiç bitmese de geçiş beklemez: haber kuyrukta durur, müşteri yanıtını alır.
    await notifyStatusEffect(deferred, 'siparis-1', 'confirmed');
    expect(later).toHaveLength(1);
    expect(sent).toEqual([]);

    const running = later[0]!();
    release();
    await running;
    expect(sent).toEqual(['siparis-1']);

    // İadenin sonucu çağıranın kararını değiştirir; ertelenseydi kapı iade edilmemiş parayı "iade edildi" sayabilirdi.
    expect(providerRefunder(deferred)).toBe(effects.refunder);
  });
});
