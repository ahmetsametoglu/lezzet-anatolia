import type { CustomerOrderStatus } from '@lezzet/types';

/*
  SİPARİŞ DEMO VERİSİ — **artık sipariş ekranlarının kaynağı DEĞİL** (21.18).

  Siparişlerim ve sipariş detayı gerçek uçlardan okuyor (`GET /api/v1/me/orders[/:reference]`);
  bu dosya YALNIZ iki UI-only ekranın yer tutucusu olarak yaşıyor: yeni talep formunun sipariş
  seçici adımı (`screens/support/new-ticket-screen.tsx`) ve geri bildirim demo verisi
  (`screens/feedback/feedback-fixture.ts`). İkisi de kendi uçlarına bağlandığında bu dosya SİLİNİR
  — o gün burada bırakılan tek satır bile ekranda gerçek sanılan sahte bir sipariş demektir.

  Dosyanın `screens/orders/` altında durması bugün YANILTICIDIR ve bilinçli bir borçtur: taşınacağı
  yerler (`screens/support/`, `screens/feedback/`) bu şeridin yazma alanı değildi, silmek de o iki
  ekranı kırardı. Kayıt raporda.

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

/**
 * Küme, KALAN İKİ TÜKETENİN okuduğu alanlarla sınırlı (21.18 budaması).
 *
 * Sipariş ekranları gerçek uca geçince teslimat/adres/ödeme/zaman-çizgisi/ETA alanlarının okuyanı
 * kalmadı — `knip` bunları göremez (arayüz alanı, dışa verilen sembol değil), o yüzden elle
 * budandı. Ölü alan bırakmak, bir gün birinin "demek bu veri var" diye üzerine ekran yazması
 * demektir (CLAUDE §2: ölü kod yok).
 */
export interface OrderView {
  reference: string;
  status: CustomerOrderStatus;
  /** Sipariş tarihi — biçimlenmiş metin (yeni talep ekranının sipariş seçicisi bunu yazıyor). */
  placedAtLabel: string;
  totalCents: number;
  lines: OrderLineView[];
}

/** Şablonun üç siparişi: yolda · hazırlanıyor · teslim edilmiş. */
export function ordersFixture(): OrderView[] {
  return [
    {
      reference: 'LA-2418',
      status: 'on_the_way',
      placedAtLabel: '7 Ağustos 2026',
      totalCents: 5730,
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
      totalCents: 3190,
      lines: [
        { id: 'manti', name: 'El Mantısı', detail: '750 g', quantity: 1, totalCents: 1090, photoUri: null },
        { id: 'tulum', name: 'Tulum Peyniri', detail: '400 g', quantity: 1, totalCents: 1690, photoUri: null },
      ],
    },
    {
      reference: 'LA-2411',
      status: 'delivered',
      placedAtLabel: '28 Temmuz 2026',
      totalCents: 8940,
      lines: [
        { id: 'baklava', name: 'Fıstıklı Baklava', detail: '1 kg', quantity: 2, totalCents: 5980, photoUri: null },
        { id: 'antep', name: 'Antep Fıstığı', detail: '500 g', quantity: 1, totalCents: 1490, photoUri: null },
        { id: 'zeytin', name: 'Kırma Zeytin', detail: '1 kg', quantity: 1, totalCents: 1470, photoUri: null },
      ],
    },
  ];
}
