import type { CustomerOrderStatus } from '@lezzet/types';

/*
  SİPARİŞ DEMO VERİSİ — **artık sipariş ekranlarının kaynağı DEĞİL** (21.18).

  Siparişlerim ve sipariş detayı gerçek uçlardan okuyor (`GET /api/v1/me/orders[/:reference]`);
  bu dosya YALNIZ **tek** UI-only ekranın yer tutucusu olarak yaşıyor: geri bildirim demo verisi
  (`screens/feedback/feedback-fixture.ts`). Yeni talep formunun sipariş seçici adımı buradan
  ayrıldı (21.14 · gerçek listeye bağlandı) — geri bildirim de kendi ucuna bağlandığında bu dosya
  SİLİNİR; o gün burada bırakılan tek satır bile ekranda gerçek sanılan sahte bir sipariş demektir.

  Dosyanın `screens/orders/` altında durması bugün YANILTICIDIR ve bilinçli bir borçtur: taşınacağı
  yer (`screens/feedback/`) bu şeridin yazma alanı değildi, silmek de o ekranı kırardı. Kayıt raporda.

  TİPLER DIŞA VERİLMİYOR: son tüketen (yeni talep formu) ayrılınca kümenin adını dışarıda kullanan
  kalmadı; `export` bırakmak, silinmeye aday bir şekli yeni ekranlara davet etmek olurdu.

  DURUM ENUM'U ŞEMADAN (`CustomerOrderStatus`) — müşteriye görünen altı durak orada kapalı bir
  küme olarak duruyor; burada uydurulmadı. Ötekiler sayfaya özel tipler: sipariş sözleşmesi henüz
  yok (bkz. `home-fixture` künyesi).
*/

/** Sipariş kaleminin demo hâli — geri bildirim kartının okuduğu üç alan. */
interface OrderLineView {
  id: string;
  name: string;
  photoUri: string | null;
}

/**
 * Küme, KALAN TEK TÜKETENİN okuduğu alanlarla sınırlı (21.18 budamasının ikinci turu).
 *
 * Sipariş ekranları gerçek uca geçince teslimat/adres/ödeme/zaman-çizgisi/ETA alanları düşmüştü;
 * yeni talep formu da gerçek listeye bağlanınca tarih ve tutar alanlarının okuyanı kalmadı. `knip`
 * bunları göremez (arayüz alanı, dışa verilen sembol değil), o yüzden elle budandı. Ölü alan
 * bırakmak, bir gün birinin "demek bu veri var" diye üzerine ekran yazması demektir (CLAUDE §2).
 */
interface OrderView {
  reference: string;
  status: CustomerOrderStatus;
  lines: OrderLineView[];
}

/** Şablonun üç siparişi: yolda · hazırlanıyor · teslim edilmiş. */
export function ordersFixture(): OrderView[] {
  return [
    {
      reference: 'LA-2418',
      status: 'on_the_way',
      lines: [
        { id: 'su-boregi', name: 'Su Böreği', photoUri: null },
        { id: 'kunefe', name: 'Künefe', photoUri: null },
        { id: 'kahvalti', name: 'Kahvaltı Paketi', photoUri: null },
      ],
    },
    {
      reference: 'LA-2417',
      status: 'preparing',
      lines: [
        { id: 'manti', name: 'El Mantısı', photoUri: null },
        { id: 'tulum', name: 'Tulum Peyniri', photoUri: null },
      ],
    },
    {
      reference: 'LA-2411',
      status: 'delivered',
      lines: [
        { id: 'baklava', name: 'Fıstıklı Baklava', photoUri: null },
        { id: 'antep', name: 'Antep Fıstığı', photoUri: null },
        { id: 'zeytin', name: 'Kırma Zeytin', photoUri: null },
      ],
    },
  ];
}
