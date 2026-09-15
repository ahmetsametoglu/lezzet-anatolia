import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';

import { fetchOrders, type OrderSummary } from '@/lib/api/orders';
import { useLiveRefresh } from '@/lib/app-state/use-live-refresh';

/*
  VİTRİNİN İKİ SİPARİŞ BANDI — "siparişiniz yolda" ve "geçen siparişinizi tekrarlayın" (09.08).
  İkisi de fixture'dan besleniyordu (kullanıcı bulgusu: ekranda sabit `LA-2418`); artık GERÇEK
  uçtan okunuyor: `GET /api/v1/me/orders`, sipariş listesi ekranının kullandığı kapının aynısı
  (`lib/api/orders`) — vitrin için ikinci bir istemci yazılmadı (CLAUDE §1 duplikasyon).

  TEK İSTEK, İLK SAYFA: liste en yeni önce geliyor ve bandların sorduğu şey "en yeni"dir; imleç
  takip edilmez. Sayfa boyu 30 (`DEFAULT_PAGE_SIZE`) — geçmişin daha derinine inmek, ekranda iki
  satır çizmek için ödenecek bedel değil. En uç hâl: son 30 siparişin hepsi iptal/iadeyse bantlar
  çizilmez; müşterinin bekleyen bir siparişi zaten olmadığı için yanlış bir şey de söylenmez.

  "SÜREN" KARARI EKRANDA TÜRETİLMEZ, `active` alanından okunur: kural motorun
  (`isActiveForCustomer` — alındı · hazırlanıyor · yolda) ve sözleşme onu taşıyor. Durum listesini
  buraya kopyalasaydık, motor bir gün değiştiğinde vitrin ile sipariş listesi ayrı şeyler söylerdi.
  "GEÇEN" ise `delivered`dır — iptal ve iade edilmiş sipariş tekrarlanacak sipariş değildir.

  MİSAFİRDE HİÇ ÇAĞRI YOK: `signedIn` kapısı kapalıyken hook ağa çıkmaz. `authorizedFetch` zaten
  oturumsuz çağrıyı yerel 401'e kısa devre yapıyor ama kapı ayrıca duruyor çünkü GİRİŞ ANI da bu
  bayrakla yakalanıyor — oturum açıldığında (`useMe` yeniden okur, `signedIn` true olur) bantlar
  kendiliğinden gelir; çıkışta aynı yoldan düşer.

  HATA = BANT YOK, ekranda hata hâli yok: vitrin tasarımında bu bandların iskeleti/hatası tanımlı
  değil ve vitrinin geri kalanı ayakta (`use-home.hook` künyesinin aynı kararı). Sessiz yutma
  değil — okuma düştüyse gösterilecek bir sipariş de yoktur; uydurma bir bant çizmek, olmayan bir
  teslimatı vaat etmek olurdu.
*/

interface UseHomeOrdersResult {
  /** Süren (teslim edilmemiş) EN YENİ sipariş; yoksa `null` → bant çizilmez. */
  live: OrderSummary | null;
  /** Teslim edilmiş EN YENİ sipariş; yoksa `null`. */
  last: OrderSummary | null;
  /** Aşağı çekerek yenileme — vitrinin öteki kaynaklarıyla birlikte tetiklenir. */
  refresh: () => void;
}

export function useHomeOrders(locale: Locale, signedIn: boolean): UseHomeOrdersResult {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  /** Eskimiş cevap koruması: yenileme/oturum değişimi sayacı artırır, uçuştaki eski cevap yazılmaz. */
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    if (!signedIn) {
      // Çıkışta ekrandaki bantlar HEMEN düşer: başkasının siparişi gibi duran bir satır kalmasın.
      setOrders([]);
      return;
    }
    void fetchOrders(locale).then((result) => {
      if (run !== generation.current) return;
      setOrders(result.error !== null ? [] : result.data.orders);
    });
  }, [locale, signedIn]);

  useEffect(() => {
    load();
  }, [load]);

  /* Takip şeridi sipariş detayıyla AYNI cümleyi taşıyor ("Siparişiniz alındı · LA-…") ve aynı
     sebeple bayatlıyordu — ölçüldü 01.09: detay ekranı "Alındı" derken şerit de öyle diyordu,
     oysa sipariş 31 dakika önce hazırlanmıştı. Kural tek yerde (`use-foreground-refresh`). */
  useLiveRefresh(load);

  return {
    live: orders.find((order) => order.active) ?? null,
    last: orders.find((order) => order.status === 'delivered') ?? null,
    refresh: load,
  };
}
