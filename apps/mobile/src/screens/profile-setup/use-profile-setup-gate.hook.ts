import { useRouter, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useMe } from '@/screens/customer-kit/use-me.hook';
import { hasProfileGap } from './profile-gaps';

/*
  KÜNYE TAMAMLAMA KAPISI — künyesi eksik müşteriyi `/profile-setup` akışına yollar.

  ── KAPI KÖKTE DEĞİL, ÜÇ NOKTADA (kullanıcı kararı 10.08) ───────────────────
  İlk hâli kök layout'a takılıydı: oturum varsa ve künye eksikse akış UYGULAMA HER AÇILIŞINDA
  önüne çıkıyordu. Kullanıcının ölçümü ve kararı şu: açılış künye sorusunun yeri değil — açık
  oturumla uygulamayı açan kişi bir şeye bakmaya gelmiş olabilir ve o an kapıyla karşılaşmak
  elini kolunu bağlıyor. Soru ANLAMLI OLDUĞU ÜÇ ANDA sorulur:
    1. Giriş biter bitmez (`login-screen` — kimlik o an KURULDU, künye de o an istenir),
    2. OAuth dönüşünde (`auth-callback-screen` — aynı an, öteki kapıdan),
    3. SEPETE girerken (bu kanca) — sipariş yolunun başı; ad posta etiketine, telefon kuryeye gider.
  Kök kapının ikinci bir bedeli daha vardı ve o da bu değişiklikle kapandı: kanca kökte durunca
  `useMe`nin oturum aboneliği uygulamanın tamamına yayılıyor, ziyaretçiye açık yollar (davet
  linkiyle gelen geri bildirim) bile oturum altyapısına bağlanıyordu.

  ── AKIŞ NEREYE DÖNER ───────────────────────────────────────────────────────
  Çağıran `next` verir: akış bitince müşteri BAŞLADIĞI yere döner. Sepetten girip vitrinde
  bırakılmak, sorulan soruya cevap veren müşteriyi cezalandırmak olurdu.

  ── AĞACI BEKLETMEZ ─────────────────────────────────────────────────────────
  Cevap ağdan gelir; beklenseydi sepet bir tur boyunca boş ekran olurdu. Kimlik çözülünce
  yönlendirilir — kapı değil, yönlendirici.
*/

/**
 * Rota tipi ilk `expo start`ta üretilir (`.expo/types/router.d.ts` — typedRoutes); rota bu
 * dilimde doğduğu için köprü olarak `Href`e sabitlenir (onboarding kapısındaki hükmün aynısı).
 */
const PROFILE_SETUP_PATH = '/profile-setup';

/**
 * Akışın adresi TEK yerde kurulur — üç tetik noktası da bunu çağırır. `next` akış bitince
 * dönülecek yol; verilmezse akış vitrine çıkar.
 */
export function profileSetupRoute(next?: string): Href {
  return (next === undefined ? { pathname: PROFILE_SETUP_PATH } : { pathname: PROFILE_SETUP_PATH, params: { next } }) as Href;
}

interface ProfileSetupGateOptions {
  /** Akış bitince dönülecek yol (bu ekranın kendi yolu). */
  next: string;
}

export function useProfileSetupGate({ next }: ProfileSetupGateOptions): void {
  const { status, me } = useMe();
  const router = useRouter();
  /* Misafir sepeti kapının konusu DEĞİL: `me === null` künye eksikliği değil, kimlik yokluğudur —
     giriş sorusunu sipariş ekranı kendi sırasında sorar. */
  const incomplete = status === 'ready' && me !== null && hasProfileGap(me);

  useEffect(() => {
    if (!incomplete) return;
    // `replace`: akış geçmişe kayıt düşmez — geri tuşu müşteriyi yarım künyeye geri fırlatmaz.
    router.replace(profileSetupRoute(next));
  }, [incomplete, next, router]);
}
