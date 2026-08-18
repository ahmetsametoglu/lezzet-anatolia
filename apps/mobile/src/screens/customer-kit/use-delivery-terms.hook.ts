import { useEffect, useState } from 'react';

import { fetchDeliveryTerms, type DeliveryTerms } from '@/lib/api/delivery-terms';

/*
  İLAN EDİLEN TESLİMAT TUTARLARI — `usePointsRules`ın birebir deseni (18.08 · kullanıcı kararı).

  İki tüketen var ve ikisi de oturumsuz olabiliyor: posta kodu çekmecesi (onboarding'in adımı dâhil)
  ve yasal "Teslimat ve iade" sayfası. Kapı `maybeAuthorizedFetch` — jeton varsa gönderilir, yoksa
  çağrı yine yapılır (`lib/api/delivery-terms` künyesi).

  ── SONUÇ ÜÇ HÂLLİ, İKİ DEĞİL ───────────────────────────────────────────────
  `null` "yüklenmedi" demek DEĞİL: yükleniyor ile okunamadı ayrı hâller ve METİN BUNA BAĞLI.
  Okunamayan bir eşiği 0'a düşürseydik ekran "her sipariş ücretsiz kargo" derdi — CLAUDE §1:
  ölçülemeyen değer sıfır değildir, hele bir SÖZ ise. Çağıran hata hâlinde tutar cümlesini hiç
  kurmaz; ana kural cümlesi (soğuk zincir aracımızla, ötekiler kargoyla) sayı istemiyor ve her
  hâlde görünür.
*/

type DeliveryTermsState =
  | { status: 'loading' }
  | { status: 'ready'; terms: DeliveryTerms }
  /** Ağ ya da sözleşme hatası — ekran tutar cümlesini çizmez; yanlış sayı ilan etmekten iyidir. */
  | { status: 'failed' };

export function useDeliveryTerms(): DeliveryTermsState {
  const [state, setState] = useState<DeliveryTermsState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    void fetchDeliveryTerms().then((result) => {
      if (!alive) return;
      setState(result.error === null ? { status: 'ready', terms: result.data } : { status: 'failed' });
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
