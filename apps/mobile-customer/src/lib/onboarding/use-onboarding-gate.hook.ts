import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import { getOnboardingSnapshot, subscribeOnboarding } from './onboarding-store';

/*
  ONBOARDING KAPISI — kök layout'un tek satırla çağırdığı yönlendirme kararı. Mantık burada
  duruyor ki `_layout.tsx`e dokunuş minimal kalsın (görev kısıtı) ve kapının testi layout'suz
  koşabilsin.

  KARAR: bayrak okunana dek "hazır değil" (kök layout splash'ta bekler, font kapısıyla aynı
  desen); kayıt yoksa `/onboarding`e replace.

  OPERASYON AYRI UYGULAMA (21.310): tek uygulama iki yüzeyi taşırken personel ağacı bu kapının
  segment süzgeciyle dışarıda tutuluyordu; o ağaç artık operasyon uygulamasında, süzgeç kalktı.
  Personel bu uygulamayı açarsa müşteri gibi gezer ve ilk açılışta onboarding'i o da görür —
  atlanabilir, zorlamaz.

  YÖNLENDİRME EFEKTLE (`router.replace`), `<Redirect>` İLE DEĞİL: kök layout'ta `Stack`in yerine
  `Redirect` dönmek navigatörü hiç kurmamak demek. Bedeli teoride tek karelik bir vitrin
  parıltısı; bayrak milisaniyelerde okunduğu ve efekt ilk commit'in hemen ardından koştuğu için
  pratikte görünmüyor.
*/

/**
 * Yeni rota tipi ilk `expo start`ta üretilir (`.expo/types/router.d.ts` — typedRoutes); rota
 * dosyası bu dilimde doğduğu için köprü olarak `Href`e sabitlenir. Üretimden sonra da doğru.
 */
const ONBOARDING_ROUTE = '/onboarding' as Href;

/**
 * Kök kapı: `true` = karar verildi, ağaç çizilebilir (gerekiyorsa yönlendirme de kurulmuştur);
 * `false` = bayrak henüz okunmadı, layout splash'ı korur.
 */
export function useOnboardingGate(): boolean {
  const snapshot = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const segments = useSegments();
  const router = useRouter();

  const ready = snapshot !== undefined;
  const done = snapshot?.done === true;
  // Genişletme bilinçli: typed-routes birleşimi 'onboarding' segmentini ilk üretime dek tanımaz.
  const surface: string | undefined = segments[0];
  const needsRedirect =
    ready &&
    !done &&
    // İlk kareler segmentsiz gelebilir; hedef belli olmadan yönlendirmek bir derin bağlantıyı
    // onboarding'e kaçırırdı — segment oturana dek beklenir (efekt yeniden koşar).
    surface !== undefined &&
    surface !== 'onboarding';

  useEffect(() => {
    if (!needsRedirect) return;
    // `replace`: onboarding geçmişe kayıt düşmez — geri tuşu kullanıcıyı akışa geri fırlatmaz.
    router.replace(ONBOARDING_ROUTE);
  }, [needsRedirect, router]);

  return ready;
}
