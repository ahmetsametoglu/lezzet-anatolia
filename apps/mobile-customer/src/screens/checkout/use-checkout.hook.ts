import { useCallback, useEffect, useRef, useState } from 'react';
import type { CheckoutSnapshot } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchCheckout } from '@/lib/api/checkout';

/*
  Ekranın tek okuması: günler, ödeme yolları, ücret ve toplam sunucudan gelir, okumanın bağlamı hook'un parametresidir ve biri değişince
  hepsi tek turda tazelenir. Geç dönen eski cevap `generation` sayacıyla düşer, yoksa arka arkaya iki adrese dokunan müşteri yanlış
  adresin ücretini görürdü; sonraki yükler ekranı boşaltmadan `refreshing`le döner.
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
  /** Gel-al seçimi — adres gibi bir girdi: değişince anlık görüntü yeniden okunur. */
  pickupWarehouseId: string | null,
  /** Müşterinin seçtiği kargo servisi; ücret ve toplam ona bağlı olduğu için değişince okuma yenilenir. */
  shippingOptionCode: string | null,
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

    const result = await fetchCheckout({ locale, addressId, coupon, shippingOrder, pickupWarehouseId, shippingOptionCode });
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
  }, [addressId, coupon, locale, shippingOrder, pickupWarehouseId, shippingOptionCode]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, snapshot, refreshing, retry: () => void load(), reload: () => void load() };
}
