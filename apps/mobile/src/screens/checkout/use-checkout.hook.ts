import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckoutSnapshot } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchCheckout } from '@/lib/api/checkout';

/*
  CHECKOUT ANLIK GÖRÜNTÜSÜ (21.22) — ekranın TEK okuması.

  ── EKRAN SEÇER, SUNUCU KARAR VERİR ─────────────────────────────────────────
  Uygun günler, açık ödeme yolları, kargo ücreti ve toplam SUNUCUDAN gelir; ekran kendi listesini
  UYDURMAZ. Bu yüzden okumanın bağlamı (adres · kupon · kargo grubu) hook'un parametresidir:
  adres değişince teslimat da ücret de ödeme yolları da değişir ve hepsi TEK turda tazelenir.

  ── ESKİMİŞ CEVAP KORUMASI (`generation`) ───────────────────────────────────
  Katalog hook'unun aynı kuralı: her yük sayacı artırır, uçuşta kalan eski istekler döndüğünde
  sayacı tutmadıkları için sonuçları YAZILMAZ. Burada zorunluluk daha da açık — iki adrese arka
  arkaya dokunan parmak, ilk isteğin geç gelen cevabıyla YANLIŞ adresin ücretini görürdü ve
  onaya bastığında sunucu başka bir hesap uygulardı.

  ── ADRES DEĞİŞİMİNDE EKRAN BOŞALMAZ ────────────────────────────────────────
  İlk yük `loading`tir; sonraki yükler `refreshing` bayrağıyla döner ve önceki anlık görüntü
  ekranda kalır. Boşaltmak, seçim yapan müşteriyi her dokunuşta boş bir ekrana bakmaya zorlardı.
  Onay düğmesi yine de tazeleme boyunca KAPALIDIR (ekran kararı): eski ücretle onaylanan bir
  sipariş, gösterilenden başka bir tutarla açılırdı.

  ── MİSAFİR HÂLİ HATA DEĞİL ─────────────────────────────────────────────────
  Uç Bearer'ın arkasında ve oturumsuz çağrı ağa hiç çıkmadan `401` döner (`authorizedFetch`).
  O hâl `guest`tir ve ekran giriş kapısı çizer; `error` yalnız oturum VARKEN okunamamaktır
  (`use-me.hook` ile aynı ayrım).
*/

type CheckoutStatus = 'loading' | 'guest' | 'ready' | 'error';

interface UseCheckoutResult {
  status: CheckoutStatus;
  /** Yalnız `ready` hâlinde dolu; tazeleme boyunca ÖNCEKİ görüntü burada kalır. */
  snapshot: CheckoutSnapshot | null;
  /** Arka planda yeni bir okuma sürüyor (adres/kupon değişimi ya da ret sonrası tazeleme). */
  refreshing: boolean;
  /** Hata hâlinden aynı sorguyla dönüş. */
  retry: () => void;
  /**
   * Görüntüyü yeniden okur — sunucunun "artık öyle değil" dediği retlerden sonra (gün düştü,
   * yöntem kapandı, fiyat değişti) çağrılır: ekranın gösterdiği kural sunucununkiyle ayrıştı.
   */
  reload: () => void;
}

export function useCheckout(
  locale: Locale,
  addressId: string | null,
  coupon: string | null,
  shippingOrder: boolean,
): UseCheckoutResult {
  const [status, setStatus] = useState<CheckoutStatus>('loading');
  const [snapshot, setSnapshot] = useState<CheckoutSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  /** Kaçıncı yükün geçerli olduğu; eski cevaplar sessizce düşer. */
  const generation = useRef(0);
  /** İlk yük mü — sonraki yükler ekranı boşaltmadan tazeler. */
  const loaded = useRef(false);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    if (loaded.current) setRefreshing(true);
    else setStatus('loading');

    const result = await fetchCheckout({ locale, addressId, coupon, shippingOrder });
    if (run !== generation.current) return;

    setRefreshing(false);
    if (result.error !== null) {
      // Yerel kısa devre 401'i (oturum yok) MİSAFİRDİR, arıza değil; kalanı gerçek arızadır.
      setStatus(result.status === 401 ? 'guest' : 'error');
      // Okunamayan bir görüntü, eski görüntünün doğru olduğu anlamına gelmez: tutar ekranda
      // bırakılırsa müşteri bir daha doğrulanmamış bir hesapla onaylardı.
      setSnapshot(null);
      loaded.current = false;
      return;
    }
    setSnapshot(result.data);
    setStatus('ready');
    loaded.current = true;
  }, [addressId, coupon, locale, shippingOrder]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, snapshot, refreshing, retry: () => void load(), reload: () => void load() };
}
