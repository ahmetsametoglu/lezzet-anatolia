import { useEffect, useState } from 'react';

import type { Locale } from '@lezzet/i18n';

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

/** Paylaşılabilir davet adresi; `null` = henüz gelmedi ya da bu siparişin daveti yok. */
export function useOrderNeighborInvite(orderId: string | null, locale: Locale): string | null {
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  useEffect(() => {
    if (orderId === null) return;
    let alive = true;
    void openOrderNeighborInvite(orderId, locale).then((result) => {
      if (!alive || result.error !== null) return;
      setInviteUrl(result.data.inviteUrl);
    });
    return () => {
      alive = false;
    };
  }, [orderId, locale]);

  return inviteUrl;
}
