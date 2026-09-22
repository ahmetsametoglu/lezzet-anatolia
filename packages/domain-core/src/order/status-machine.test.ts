import { describe, expect, it } from 'vitest';
import { isFulfillmentSettled } from './status-machine';

describe('isFulfillmentSettled', () => {
  const picked = [{ fulfilledQty: 2 }, { fulfilledQty: 0 }];
  const none = [{ fulfilledQty: 0 }, { fulfilledQty: 0 }];

  it('hazırlık başlamadan karşılanan adet bir karar DEĞİLDİR', () => {
    expect(isFulfillmentSettled('draft', none)).toBe(false);
    expect(isFulfillmentSettled('confirmed', none)).toBe(false);
    // Onaylanmış siparişte toplama yazılmış olamaz; yazılsa bile karar hazırlıkta verilir.
    expect(isFulfillmentSettled('confirmed', picked)).toBe(false);
  });

  it('hazırlanırken ayıran şey KAYITTIR: bir kalem toplandıysa sayı kesinleşmiştir', () => {
    expect(isFulfillmentSettled('preparing', none)).toBe(false);
    expect(isFulfillmentSettled('preparing', picked)).toBe(true);
  });

  it('hazırlık bittikten sonra sayı her hâlde kesindir', () => {
    for (const status of ['ready', 'out_for_delivery', 'delivered', 'completed', 'returned'] as const) {
      expect(isFulfillmentSettled(status, none)).toBe(true);
    }
  });

  it('iptal edilen siparişte karşılanan sorusu sorulmaz', () => {
    expect(isFulfillmentSettled('cancelled', picked)).toBe(false);
  });
});
import type { OrderStatus } from '@lezzet/types';
import {
  MAIN_PATH,
  allowedTransitions,
  canTransition,
  gateFor,
  isSettled,
  isTerminal,
  needsDedicatedGate,
  officeTransitions,
  producesReferenceNo,
  skippedBetween,
  stockEffectOf,
  transitionOwner,
} from './status-machine';

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
    expect(isTerminal('cancelled')).toBe(true);
    expect(canTransition('cancelled', 'confirmed')).toEqual({ allowed: false, reason: 'terminal' });
  });

  it('kendiliğinden kapanan sipariş iade sürecine girebilir', () => {
    expect(isTerminal('completed')).toBe(false);
    expect(canTransition('completed', 'returned')).toEqual({ allowed: true });
  });

  it('aynı duruma geçiş ayrı bir sebep döndürür (çift tıklama / tekrarlanan webhook)', () => {
    expect(canTransition('preparing', 'preparing')).toEqual({ allowed: false, reason: 'same_status' });
  });

  it('UI yalnız izinli geçişleri sunar — yasak geçiş hiç gösterilmez', () => {
    expect(allowedTransitions('delivered')).toEqual(['completed', 'returned']);
    expect(allowedTransitions('completed')).toEqual(['returned']);
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

/**
 * Motorun izinli geçişlerinin TAMAMI. İki bekçi (kapı · sahiplik) sınıflamayı elle yazılmış bir
 * listeden değil bundan yapar: tabloya eklenen yeni geçiş ikisine de kendiliğinden düşer.
 */
const tumGecisler: [OrderStatus, OrderStatus][] = (
  ['draft', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'returned', 'completed', 'cancelled'] as OrderStatus[]
).flatMap((from) => allowedTransitions(from).map((to) => [from, to] as [OrderStatus, OrderStatus]));

describe('kendi kapısını isteyen geçişler (denetim 26.08)', () => {
  /*
    İddia KURALDAN yazılıyor: "stok yazımı geçişin KENDİSİYLE aynı transaction'da olan geçiş, düz
    durum yazımından üretilemez." Ölçüt etkinin varlığı değil ZAMANI — önce (ayırma) ya da sonra
    (iade akıbeti) yapılan iş düz kapıyı bozmaz.

    Liste elle sayılmıyor: izinli geçişlerin TAMAMI dolaşılıp her biri sınıflandırılıyor, çünkü elle
    yazılan bir liste yeni bir durum eklendiğinde sessizce eksik kalır ve bekçi tam da o yeni
    geçişte kör olur. Beklenen küme burada duruyor; tabloya bir geçiş eklenip bu küme
    güncellenmezse test düşer ve ekleyen kişi "bunun stok yazımı nerede" sorusunu yanıtlamak
    ZORUNDA kalır.
  */
  const KAPI_ISTEYEN = new Set(['draft→completed', 'draft→cancelled', 'confirmed→cancelled', 'preparing→cancelled', 'ready→cancelled', 'out_for_delivery→delivered']);

  it('her izinli geçiş sınıflandırılmıştır — yeni geçiş cevapsız kalamaz', () => {
    const olculen = tumGecisler.filter(([from, to]) => needsDedicatedGate(from, to)).map(([from, to]) => `${from}→${to}`);
    expect(new Set(olculen)).toEqual(KAPI_ISTEYEN);
  });

  it('kapı adı gerçek bir RPC’ye karşılık gelir — uydurma sınıf değil', () => {
    expect(gateFor('ready', 'cancelled')).toBe('cancel_order');
    expect(gateFor('out_for_delivery', 'delivered')).toBe('deliver_order');
    expect(gateFor('draft', 'completed')).toBe('quick_sale');
  });

  it('stok yazımı GEÇİŞLE BİRLİKTE olan geçiş kendi kapısını ister', () => {
    expect(needsDedicatedGate('ready', 'cancelled')).toBe(true); // rezervasyon + para, aynı transaction
    expect(needsDedicatedGate('out_for_delivery', 'delivered')).toBe(true); // fiili stok düşmeli
    expect(needsDedicatedGate('draft', 'completed')).toBe(true); // hızlı satış: fiiliden doğrudan
  });

  it('stok işi ÖNCE yapılan geçiş düz yazımdan geçer — yoksa checkout kırılırdı', () => {
    // Ayırma geçişten önce yapılır (sipariş verme akışında ya da checkout başında); kapı istemek iki akışı da keserdi.
    expect(needsDedicatedGate('draft', 'confirmed')).toBe(false);
  });

  it('stok işi SONRA yapılan geçiş düz yazımdan geçer — geçiş süreci açar, iş depoda biter', () => {
    // İade: akıbet (restok/imha) depocu işaretleyince `adjust_fulfillment` içinde yazılır.
    expect(needsDedicatedGate('out_for_delivery', 'returned')).toBe(false);
    expect(needsDedicatedGate('delivered', 'returned')).toBe(false);
  });

  it('stoğa hiç dokunmayan geçişler düz yazımdan geçer — kural kapıyı daraltır, kapatmaz', () => {
    expect(needsDedicatedGate('confirmed', 'preparing')).toBe(false);
    expect(needsDedicatedGate('preparing', 'ready')).toBe(false);
    expect(needsDedicatedGate('ready', 'out_for_delivery')).toBe(false);
    expect(needsDedicatedGate('out_for_delivery', 'ready')).toBe(false); // ulaşılamadı: mal ayrılmış kalır
    expect(needsDedicatedGate('delivered', 'completed')).toBe(false);
    expect(needsDedicatedGate('returned', 'completed')).toBe(false);
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

describe('skippedBetween', () => {
  it('atlanan ana hat adımlarını verir', () => {
    expect(skippedBetween('confirmed', 'out_for_delivery')).toEqual(['preparing', 'ready']);
  });

  it('ardışık geçişte atlama yoktur', () => {
    expect(skippedBetween('preparing', 'ready')).toEqual([]);
  });

  it('siparişin doğuşu ana hattın başıdır', () => {
    expect(skippedBetween(null, 'ready')).toEqual(['confirmed', 'preparing']);
  });

  it('ana hat DIŞINA çıkan geçiş bir atlama değildir', () => {
    expect(skippedBetween('confirmed', 'cancelled')).toEqual([]);
    expect(skippedBetween('out_for_delivery', 'returned')).toEqual([]);
  });

  it('geri dönüşte (ulaşılamadı) atlama yoktur', () => {
    expect(skippedBetween('out_for_delivery', 'ready')).toEqual([]);
  });

  it('ana hat kaynak listesiyle tutarlı', () => {
    expect(MAIN_PATH).not.toContain('draft');
    expect(MAIN_PATH).not.toContain('cancelled');
  });
});

describe('geçişin anı kimin — saha, ofis, sistem (09.29)', () => {
  /* İzinli geçişlerin tamamı elle sınıflandırılır: yeni geçiş hiçbir kümeye yazılmazsa test düşer, çünkü cevapsız
     kalan geçiş operasyon ekranına sessizce düğme olarak düşerdi. */
  const SAHA = new Set([
    'draft→completed',
    'confirmed→preparing',
    'confirmed→ready',
    'confirmed→out_for_delivery',
    'preparing→ready',
    'preparing→out_for_delivery',
    'ready→out_for_delivery',
    'out_for_delivery→delivered',
    'out_for_delivery→ready',
    'out_for_delivery→returned',
  ]);
  const OFIS = new Set(['confirmed→cancelled', 'preparing→cancelled', 'ready→cancelled', 'delivered→returned', 'completed→returned', 'returned→completed']);
  const SISTEM = new Set(['draft→confirmed', 'draft→cancelled', 'delivered→completed']);

  it('her izinli geçiş sınıflandırılmıştır — yeni geçiş cevapsız kalamaz', () => {
    for (const [from, to] of tumGecisler) {
      const key = `${from}→${to}`;
      const beklenen = SAHA.has(key) ? 'field' : OFIS.has(key) ? 'office' : SISTEM.has(key) ? 'system' : null;
      expect(beklenen, `${key} hiçbir kümede yok`).not.toBeNull();
      expect(transitionOwner(from, to), key).toBe(beklenen);
    }
    expect(SAHA.size + OFIS.size + SISTEM.size).toBe(tumGecisler.length);
  });

  it('hazırlık, yola çıkış ve kapıdaki sonuç operasyon ekranında hiç sunulmaz', () => {
    for (const status of ['confirmed', 'preparing', 'ready', 'out_for_delivery'] as const) {
      expect(officeTransitions(status), status).toEqual([]);
    }
  });

  it('teslimden sonra ofis iade sürecini açar ve kapatır; teslimin kapanışı sistemindir', () => {
    expect(officeTransitions('delivered')).toEqual(['returned']);
    expect(officeTransitions('completed')).toEqual(['returned']);
    expect(officeTransitions('returned')).toEqual(['completed']);
  });

  it('iptal ofisindir ama şeritte yoktur — kendi kapısından geçer', () => {
    expect(transitionOwner('ready', 'cancelled')).toBe('office');
    expect(officeTransitions('ready')).not.toContain('cancelled');
  });

  it('taslakta ve iptal edilmiş kayıtta sunulacak geçiş yoktur', () => {
    for (const status of ['draft', 'cancelled'] as const) {
      expect(officeTransitions(status), status).toEqual([]);
    }
  });
});

describe('kapanış kararı', () => {
  it('teslim edilmiş ve tamamen ödenmiş sipariş kapanır', () => {
    expect(isSettled('delivered', 'paid')).toBe(true);
  });

  it('parası tamamen alınmamış teslimat açık kalır — vadeli ve kapıda eksik tahsilat', () => {
    expect(isSettled('delivered', 'pending')).toBe(false);
    expect(isSettled('delivered', 'partial')).toBe(false);
  });

  it('teslim edilmemiş ödenmiş sipariş kapanmaz', () => {
    expect(isSettled('confirmed', 'paid')).toBe(false);
    expect(isSettled('out_for_delivery', 'paid')).toBe(false);
  });
});
