import { useEffect, useState } from 'react';

import type { Locale } from '@lezzet/i18n';
import type { OrderNeighborInvite } from '@lezzet/types';

import { openOrderNeighborInvite } from '@/lib/invite/invite-api';

/*
  SİPARİŞİN KOMŞU DAVETİ (21.45) — sipariş tamamlandı ekranının paylaştığı bağlantı.

  ── ÜÇ HÂL DEĞİL İKİ: ya bağlantı var ya yok ────────────────────────────────
  Ayrı bir "hata" hâli YOK ve bu bilinçli: davet bir KOLAYLIK, ekranın kendisi değil. Çağrı düşerse
  şerit çizilmez — müşteriye "davet bağlantısı alınamadı" demek, az önce siparişini tamamlamış
  birine anlamsız bir arıza cümlesi göstermektir. Sipariş yerinde duruyor; kaçırılan tek şey bir
  paylaşım daveti ve o da bir sonraki açılışta yeniden denenebilir.

  `null` da meşru: kargo siparişinde "aynı sefer" diye bir şey yok, kesim saati dolmuş seferde de
  çağrılacak kimse kalmamıştır. Sunucu ikisinde de `inviteUrl: null` döner — süzgeç ORADA, burada
  değil; iki yerde süzmek "hangi sipariş komşu çağırabilir" kuralının ikinci kopyası olurdu.

  ── TEK TUR, TEKRAR YOK ─────────────────────────────────────────────────────
  Ekranın hayatı tek geçişten ibaret (`replace` ile açılır, geri gelinemez). Yenileme/tekrar deneme
  kurgusu, hiç kullanılmayacak bir makine olurdu. Uç idempotent: aynı sipariş ikinci kez sorulursa
  aynı daveti döner, yeni satır açmaz.
*/

/**
 * Davetin ekrana gereken hâli — adres + **kalan hak**.
 *
 * KALAN HAK DA BURADAN GEÇER (kullanıcı kararı 21.08): ekran sınırı müşteriye söylemeliydi ve
 * söylemiyordu. Sayı sunucudan geliyor, kancada hesaplanmıyor — tüketim siparişlerden sayılıyor,
 * tavan davet satırında dondurulmuş (sözleşme künyesi).
 *
 * `null` = henüz gelmedi ya da bu siparişin daveti yok; ekran o hâlde şeridi hiç çizmez.
 */
export function useOrderNeighborInvite(orderId: string | null, locale: Locale): OrderNeighborInvite | null {
  const [invite, setInvite] = useState<OrderNeighborInvite | null>(null);

  useEffect(() => {
    if (orderId === null) return;
    let alive = true;
    void openOrderNeighborInvite(orderId, locale).then((result) => {
      if (!alive || result.error !== null) return;
      setInvite(result.data);
    });
    return () => {
      alive = false;
    };
  }, [orderId, locale]);

  return invite;
}
