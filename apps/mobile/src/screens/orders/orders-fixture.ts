import type { CustomerOrderStatus } from '@lezzet/types';

/*
  SİPARİŞ TEST/DEMO VERİSİ — 21.14 ilk etabı UI-only: müşteri sipariş uçları YOK ve bu etapta
  backend işi ÜRETİLMEZ. Liste ve detay AYNI satırlardan besleniyor (katalog fixture'ının
  gerekçesiyle: iki ayrı yer tutucudan biri mutlaka eskir).

  DURUM ENUM'U ŞEMADAN (`CustomerOrderStatus`) — müşteriye görünen altı durak orada kapalı bir
  küme olarak duruyor; burada uydurulmadı. Ötekiler sayfaya özel tipler: sipariş sözleşmesi henüz
  yok (bkz. `home-fixture` künyesi).
*/

/** Sipariş kaleminin listedeki hâli — ürün ya da hazır paket. */
export interface OrderLineView {
  id: string;
  name: string;
  /** İkinci satır: çeşit etiketi ya da "Hazır paket". */
  detail: string;
  quantity: number;
  /** Kalem toplamı (cent). */
  totalCents: number;
  photoUri: string | null;
}

export interface OrderView {
  reference: string;
  status: CustomerOrderStatus;
  /** Sipariş tarihi — biçimlenmiş metin (uç geldiğinde ISO gelir, biçimleme cihazda olur). */
  placedAtLabel: string;
  /** Teslim penceresi ya da kargo süresi. */
  deliveryLabel: string;
  addressLabel: string;
  paymentLabel: string;
  totalCents: number;
  lines: OrderLineView[];
  /** Zaman çizgisindeki dört durağın saatleri; ulaşılmamış durak `null`. */
  timeline: [string | null, string | null, string | null, string | null];
  /** Kurye yoldayken tahmini varış. */
  etaLabel: string | null;
}

/** Şablonun üç siparişi: yolda · hazırlanıyor · teslim edilmiş. */
export function ordersFixture(): OrderView[] {
  return [
    {
      reference: 'LA-2418',
      status: 'on_the_way',
      placedAtLabel: '7 Ağustos 2026',
      deliveryLabel: 'Bugün 14:00 – 18:00',
      addressLabel: 'Ev — 12 Quai des Bateliers, 67000 Strasbourg',
      paymentLabel: 'Online ödendi',
      totalCents: 5730,
      timeline: ['7 Ağustos, 09:12', '7 Ağustos, 11:40', '7 Ağustos, 13:55', null],
      etaLabel: '30–40 dk',
      lines: [
        { id: 'su-boregi', name: 'Su Böreği', detail: '500 g', quantity: 2, totalCents: 2580, photoUri: null },
        { id: 'kunefe', name: 'Künefe', detail: '1 kg', quantity: 1, totalCents: 950, photoUri: null },
        { id: 'kahvalti', name: 'Kahvaltı Paketi', detail: 'Hazır paket', quantity: 1, totalCents: 2200, photoUri: null },
      ],
    },
    {
      reference: 'LA-2417',
      status: 'preparing',
      placedAtLabel: '6 Ağustos 2026',
      deliveryLabel: 'Yarın 09:00 – 13:00',
      addressLabel: 'İş — 3 Rue du Dôme, 67000 Strasbourg',
      paymentLabel: 'Kapıda ödenecek',
      totalCents: 3190,
      timeline: ['6 Ağustos, 18:02', '7 Ağustos, 08:30', null, null],
      etaLabel: null,
      lines: [
        { id: 'manti', name: 'El Mantısı', detail: '750 g', quantity: 1, totalCents: 1090, photoUri: null },
        { id: 'tulum', name: 'Tulum Peyniri', detail: '400 g', quantity: 1, totalCents: 1690, photoUri: null },
      ],
    },
    {
      reference: 'LA-2411',
      status: 'delivered',
      placedAtLabel: '28 Temmuz 2026',
      deliveryLabel: '30 Temmuz, teslim edildi',
      addressLabel: 'Ev — 12 Quai des Bateliers, 67000 Strasbourg',
      paymentLabel: 'Online ödendi',
      totalCents: 8940,
      timeline: ['28 Temmuz, 10:05', '29 Temmuz, 08:10', '30 Temmuz, 11:20', '30 Temmuz, 12:05'],
      etaLabel: null,
      lines: [
        { id: 'baklava', name: 'Fıstıklı Baklava', detail: '1 kg', quantity: 2, totalCents: 5980, photoUri: null },
        { id: 'antep', name: 'Antep Fıstığı', detail: '500 g', quantity: 1, totalCents: 1490, photoUri: null },
        { id: 'zeytin', name: 'Kırma Zeytin', detail: '1 kg', quantity: 1, totalCents: 1470, photoUri: null },
      ],
    },
  ];
}

/** Referansla tek sipariş — detay ekranının okuma kapısı. */
export function orderByReference(reference: string): OrderView | null {
  return ordersFixture().find((order) => order.reference === reference) ?? null;
}
