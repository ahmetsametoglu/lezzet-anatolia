'use client';

import { useState } from 'react';

/** Paylaşım kapısı — `share` bağlantıyı paylaştırır, `copied` panoya kopyalandıysa iki saniye doğru. */
interface ShareLink {
  share: (url: string) => Promise<void>;
  copied: boolean;
}

/**
 * Bağlantı paylaşımı — sipariş onayının komşu daveti (masaüstü şeridi ve telefonun native şeridi) ve hesabın arkadaş
 * daveti AYNI kapıdan geçer (14.09).
 *
 * Sistem paylaşım menüsü (`navigator.share`) varsa o açılır: davet WhatsApp'a gidiyor ve uygulama sırasını işletim
 * sistemi bizden iyi biliyor (`ShareButton` künyesi). Yoksa bağlantı panoya kopyalanır ve iki saniye "kopyalandı" denir.
 * Başarısızlık sessiz ama SONUÇSUZ değil: bağlantı ekranda zaten seçilebilir hâlde duruyor, hata cümlesi açmak
 * müşterinin hâlâ yapabildiği bir işi arıza gibi gösterirdi (`coupons-card`taki desen).
 */
export function useShareLink(): ShareLink {
  const [copied, setCopied] = useState(false);

  const share = async (url: string) => {
    if (navigator.share) {
      // İptal hata değildir: vazgeçen müşteriye uyarı çıkmamalı.
      await navigator.share({ url }).catch(() => undefined);
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Pano izni yok ya da tarayıcı reddetti — sessiz, gerekçesi künyede (bağlantı ekranda duruyor).
      setCopied(false);
    }
  };

  return { share, copied };
}
