import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect, useSyncExternalStore } from 'react';

import { getOnboardingSnapshot, subscribeOnboarding } from './onboarding-store';

/*
  ONBOARDING KAPISI — kök layout'un tek satırla çağırdığı yönlendirme kararı. Mantık burada
  duruyor ki `_layout.tsx`e dokunuş minimal kalsın (görev kısıtı) ve kapının testi layout'suz
  koşabilsin.

  KARAR: bayrak okunana dek "hazır değil" (kök layout splash'ta bekler, font kapısıyla aynı
  desen); kayıt yoksa ve kullanıcı MÜŞTERİ yüzeyindeyse `/onboarding`e replace.

  OPERASYON YÜZEYİ KAPININ DIŞINDA: kapı yalnız müşteri girişini ilgilendirir. Kabuğun
  oturum/rol ayrımı ROTA GRUBUYLA kurulu — personel operasyona `(operations)` ağacından girer ve
  o ağacın KENDİ kapısı var (`(operations)/_layout.tsx` `/me` okur, yetkisizi müşteri köküne
  yollar). Burada ikinci bir `/me` okuması o kapının kopyası olurdu; segment süzgeci aynı ayrımı
  ağa çıkmadan verir. Personel `/` açarsa bu, mimarinin kendi tanımıyla "müşteri gezinmesi"dir
  (02-mimari §4) ve ilk açılışta onboarding'i o da görür — atlanabilir, zorlamaz.

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
    // İlk kareler segmentsiz gelebilir; hedef belli olmadan yönlendirmek operasyon derin
    // bağlantısını da onboarding'e kaçırırdı — segment oturana dek beklenir (efekt yeniden koşar).
    surface !== undefined &&
    surface !== '(operations)' &&
    surface !== 'onboarding';

  useEffect(() => {
    if (!needsRedirect) return;
    // `replace`: onboarding geçmişe kayıt düşmez — geri tuşu kullanıcıyı akışa geri fırlatmaz.
    router.replace(ONBOARDING_ROUTE);
  }, [needsRedirect, router]);

  return ready;
}
