import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';

import { AccountScreen } from '@/screens/account/account-screen';
import { accountData } from '@/screens/account/account-fixture';
import { useMe } from '@/screens/customer-kit/use-me.hook';

/*
  Rota dosyası İNCE (katalogla aynı gerekçe) — ekranın parçaları `src/screens/account/`ta.

  KİMLİK BURADA BAĞLANIR (21.14c): ekran prop'la çalışır (testleri fixture'la koşar), GERÇEK
  oturumu rota okur. Misafir → v3'ün karşılama bloğu; girişli → kimlik alanları `/me`den.

  Gerçek kullanıcıda KURGU KİŞİSEL VERİ BASILMAZ: fixture'ın adres/kupon/puan/şirket blokları
  kendi uçları bağlanana dek girişli hâlde BOŞ taşınır — Ayşe'nin adreslerini gerçek bir hesabın
  altında göstermek, ekranı "hâlâ hazır kullanıcı" gibi okutuyordu (kullanıcı bulgusu 08.08).
  Boşluk da bir beyan değildir: adres/puan uçları gelince bu satırlar gerçek veriyle dolar.
*/
export default function AccountRoute() {
  const meState = useMe();
  const router = useRouter();
  const isGuest = meState.status === 'guest';

  /* Misafir sekmeye GELDİĞİNDE giriş sayfası DOĞRUDAN açılır (kullanıcı kararı 08.08 — v3'ün
     karşılama bloğu fazladan bir dokunuştu). Bayrak döngüyü kırar: giriş sayfası sekmenin
     ÜSTÜNE açıldığı için sekme o an bulanıklaşır; bayrak misafirken sıfırlanmaz ki girişten
     VAZGEÇEN kişi geri döndüğünde tekrar tekrar login'e itilmesin — karşılama bloğu (Hızlı
     doğrulama düğmesiyle) yedek kapı olarak görünür. Giriş BAŞARILI olunca bayrak sıfırlanır. */
  const autoOpened = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (isGuest && !autoOpened.current) {
        autoOpened.current = true;
        router.push('/login');
      }
      return () => {
        if (!isGuest) autoOpened.current = false;
      };
    }, [isGuest, router]),
  );

  // Kısa yükleme anında hiçbir hâl İDDİA EDİLMEZ (misafir daveti yanıp sönmesin) — boş sekme.
  if (meState.status === 'loading') return null;

  if (meState.status !== 'ready' || meState.me === null) {
    return <AccountScreen signedIn={false} />;
  }

  const me = meState.me;
  return (
    <AccountScreen
      data={accountData({
        // Ad hiç girilmemişse kart adsız kalmaz: e-posta kimliğin kendisidir (profil düzenlemede ad eklenir).
        name: me.name.trim() === '' ? (me.email ?? '') : me.name,
        email: me.email ?? '',
        phone: me.phone ?? '',
        company: null,
        points: null,
        coupons: [],
        referralCode: me.referralCode,
        addresses: [],
        preferredLanguage: me.preferredLanguage,
        marketingEmail: me.marketingConsent?.email?.granted ?? false,
        marketingWhatsApp: me.marketingConsent?.whatsapp?.granted ?? false,
      })}
    />
  );
}
