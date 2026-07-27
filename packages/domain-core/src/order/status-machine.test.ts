import { describe, expect, it } from 'vitest';
import type { OrderStatus } from '@lezzet/types';
import { allowedTransitions, canTransition, isTerminal, producesReferenceNo, stockEffectOf } from './status-machine';

describe('tam yol', () => {
  it('draft → confirmed → preparing → ready → out_for_delivery → delivered → completed', () => {
    const path: OrderStatus[] = ['draft', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'];
    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!)).toEqual({ allowed: true });
    }
  });

  it('preparing ve ready atlanabilir (küçük sipariş, anında hazır)', () => {
    expect(canTransition('confirmed', 'ready').allowed).toBe(true);
    expect(canTransition('confirmed', 'out_for_delivery').allowed).toBe(true);
    expect(canTransition('preparing', 'out_for_delivery').allowed).toBe(true);
  });
});

describe('hızlı satış yolu (kapı önü)', () => {
  it('draft → completed izinli', () => {
    expect(canTransition('draft', 'completed')).toEqual({ allowed: true });
  });

  it('ara durumlara uğramaz ama uğrayabilirdi — yol seçimi çağıranındır', () => {
    expect(canTransition('draft', 'confirmed').allowed).toBe(true);
  });
});

describe('ek geçişler', () => {
  it('iptal yalnız teslimat öncesi durumlardan', () => {
    for (const from of ['draft', 'confirmed', 'preparing', 'ready'] as OrderStatus[]) {
      expect(canTransition(from, 'cancelled').allowed).toBe(true);
    }
    expect(canTransition('out_for_delivery', 'cancelled').allowed).toBe(false);
    expect(canTransition('delivered', 'cancelled').allowed).toBe(false);
  });

  it('ulaşılamadı: out_for_delivery → ready', () => {
    expect(canTransition('out_for_delivery', 'ready')).toEqual({ allowed: true });
  });

  it('reddedildi: out_for_delivery → returned · teslim sonrası iade: delivered → returned', () => {
    expect(canTransition('out_for_delivery', 'returned').allowed).toBe(true);
    expect(canTransition('delivered', 'returned').allowed).toBe(true);
  });

  it('returned → completed: iade süreci kapanır, kalıcı returned yok', () => {
    expect(canTransition('returned', 'completed')).toEqual({ allowed: true });
  });
});

describe('yasak geçişler', () => {
  it('geri gitmek yasak (delivered → preparing gibi)', () => {
    expect(canTransition('delivered', 'preparing')).toEqual({ allowed: false, reason: 'not_allowed' });
    expect(canTransition('ready', 'confirmed')).toEqual({ allowed: false, reason: 'not_allowed' });
    expect(canTransition('out_for_delivery', 'preparing')).toEqual({ allowed: false, reason: 'not_allowed' });
  });

  it('adım atlayıp teslime gitmek yasak (draft → delivered)', () => {
    expect(canTransition('draft', 'delivered')).toEqual({ allowed: false, reason: 'not_allowed' });
  });

  it('terminal durumdan çıkış yok', () => {
    expect(isTerminal('completed')).toBe(true);
    expect(isTerminal('cancelled')).toBe(true);
    expect(canTransition('completed', 'returned')).toEqual({ allowed: false, reason: 'terminal' });
    expect(canTransition('cancelled', 'confirmed')).toEqual({ allowed: false, reason: 'terminal' });
  });

  it('aynı duruma geçiş ayrı bir sebep döndürür (çift tıklama / tekrarlanan webhook)', () => {
    expect(canTransition('preparing', 'preparing')).toEqual({ allowed: false, reason: 'same_status' });
  });

  it('UI yalnız izinli geçişleri sunar — yasak geçiş hiç gösterilmez', () => {
    expect(allowedTransitions('delivered')).toEqual(['completed', 'returned']);
    expect(allowedTransitions('completed')).toEqual([]);
  });
});

describe('stok etkisi', () => {
  it('confirmed: online ödemede stok zaten ayrılmıştır → tekrar ayırmaz', () => {
    expect(stockEffectOf('draft', 'confirmed')).toBe('reserve');
    expect(stockEffectOf('draft', 'confirmed', { alreadyReserved: true })).toBe('none');
  });

  it('teslim: ayrılmıştan + fiiliden düşer · hızlı satış: doğrudan fiiliden', () => {
    expect(stockEffectOf('out_for_delivery', 'delivered')).toBe('consume');
    expect(stockEffectOf('draft', 'completed')).toBe('consume_direct');
  });

  it('iptal/iade: serbest bırakma DEPOYA çıpalı, kapıda değil', () => {
    expect(stockEffectOf('ready', 'cancelled')).toBe('release_on_warehouse_return');
    expect(stockEffectOf('delivered', 'returned')).toBe('release_on_warehouse_return');
  });

  it('ulaşılamadı stoğu değiştirmez — mal ayrılmış kalır (kamyondayken kimseye görünmez)', () => {
    expect(stockEffectOf('out_for_delivery', 'ready')).toBe('none');
  });

  it('iade kapanışı stoğu bir kez daha değiştirmez', () => {
    expect(stockEffectOf('returned', 'completed')).toBe('none');
  });
});

describe('referans numarası — ilk kalıcı durumda üretilir', () => {
  it('tam yolda confirmed, hızlı satışta completed', () => {
    expect(producesReferenceNo('draft', 'confirmed')).toBe(true);
    expect(producesReferenceNo('draft', 'completed')).toBe(true);
  });

  it('sonraki geçişlerde yeniden üretilmez', () => {
    expect(producesReferenceNo('confirmed', 'preparing')).toBe(false);
    expect(producesReferenceNo('delivered', 'completed')).toBe(false);
    expect(producesReferenceNo('returned', 'completed')).toBe(false);
  });

  it('iptal edilen draft numara almaz', () => {
    expect(producesReferenceNo('draft', 'cancelled')).toBe(false);
  });
});
