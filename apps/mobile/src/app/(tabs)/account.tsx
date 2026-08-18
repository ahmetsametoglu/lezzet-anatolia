import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef } from 'react';
import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';
import { AccountScreen } from '@/screens/account/account-screen';
import { accountData } from '@/screens/account/account-fixture';
import { useMe } from '@/screens/customer-kit/use-me.hook';

/*
  Rota dosyası İNCE (katalogla aynı gerekçe) — ekranın parçaları `src/screens/account/`ta.

  KİMLİK BURADA BAĞLANIR (21.14c): ekran prop'la çalışır (testleri fixture'la koşar), GERÇEK
  oturumu rota okur. Misafir → v3'ün karşılama bloğu; girişli → kimlik alanları `/me`den.

  Gerçek kullanıcıda KURGU KİŞİSEL VERİ BASILMAZ: fixture'ın kupon/puan/şirket blokları kendi
  uçları bağlanana dek girişli hâlde BOŞ taşınır — Ayşe'nin verisini gerçek bir hesabın altında
  göstermek, ekranı "hâlâ hazır kullanıcı" gibi okutuyordu (kullanıcı bulgusu 08.08). Boşluk da
  bir beyan değildir: puan uçları gelince bu satırlar gerçek veriyle dolar. ADRESLER ARTIK GERÇEK
  (21.15): ekran kendi yüklüyor (`use-addresses.hook`), fixture'ta adres kavramı kalmadı.
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

  /* Yükleme anında hiçbir hâl İDDİA EDİLMEZ (misafir daveti yanıp sönmesin) — ama artık sekme BOŞ
     da kalmaz (21.14 kalemi MB-35). Eski hâl `return null`dı: kimlik okuması uzayınca müşteri
     bomboş bir sekmeye bakıyordu ve bu, oturumun sessizce misafire düştüğü AYRI arızayla
     karışıyordu — "hesabım açılmıyor" şikâyetinin hangisinden geldiği ayırt edilemiyordu. Nabız
     atan bir yer tutucu ikisini ayırır: bekleme görünür, boşluk arıza olur. */
  if (meState.status === 'loading') return <AccountLoading />;

  if (meState.status !== 'ready' || meState.me === null) {
    return <AccountScreen signedIn={false} />;
  }

  const me = meState.me;
  return (
    <AccountScreen
      /* Aşağı çekildiğinde kimliği TAZELEYEN kapı (21.29c): ekran `/me`yi kendi okumuyor, bu satır
         okuyor — tazeleme de burada. Puan ve adresleri ekran kendi tazeliyor. */
      onRefreshIdentity={meState.refresh}
      data={accountData({
        /* Ad OLDUĞU GİBİ taşınır — girilmemişse BOŞ (MB-66, 18.08). Yedeğe düşme kararı EKRANINDIR.
           Eskiden burada e-postaya düşülüyordu ("kart adsız kalmasın") ve karar doğruydu, yeri
           yanlıştı: ada e-postayı yazınca ekran o satırın gerçek bir ad mı yoksa yedek mi olduğunu
           bilemiyor ve hemen altına AYNI adresi ikinci kez yazıyordu (cihazda ölçüldü 17.08).
           Bilgiyi kaybetmeden geçirmek, kaybını ekranda telafi etmekten ucuz. */
        name: me.name.trim(),
        email: me.email ?? '',
        phone: me.phone ?? '',
        company: null,
        referralCode: me.referralCode,
        /* DİL BURADAN GEÇMEZ (09.08): uygulamanın dili tek kaynaktan okunur (`lib/i18n/app-locale`)
           ve `/me`deki tercih o kaynağa `use-me.hook` üzerinden ulaşır — ekrana ikinci bir yoldan
           taşımak, çipin arayüzden farklı bir dili işaretlemesine kapı açardı. */
        marketingEmail: me.marketingConsent?.email?.granted ?? false,
        marketingWhatsApp: me.marketingConsent?.whatsapp?.granted ?? false,
      })}
    />
  );
}

/*
  KİMLİK OKUNURKEN — SAYFA DÜZEYİ YER TUTUCU (MB-35).

  NEDEN ROTADA, `screens/account/account-skeleton.tsx`TA DEĞİL: o dosya EKRANIN İÇİNDEKİ iki
  beklemenin (puan cüzdanı · adres defteri) iskeletidir ve ekran onları kendi çiziyor. Buradaki
  bekleme başkasıdır — kimlik okuması ROTADA yapılıyor (`useMe`), yani ekran daha hiç
  kurulmamışken. Yerini tuttuğu bekleme burada olduğu için yer tutucu da burada duruyor.

  NÖTR, ÇÜNKÜ HENÜZ KİMSE DEĞİLİZ: okuma bitince ekran ya girişli hâle (başlık + profil kartı +
  puan + menü + adresler) ya misafir hâline (başlık + davet bloğu) açılıyor; ikisi birbirine
  benzemiyor. O yüzden burada yalnız İKİ HÂLİN DE ORTAK olduğu iskelet çiziliyor: sayfa başlığı
  ve altındaki ilk blok. Girişli sayfanın tamamını taklit etmek "girişlisiniz" demek olurdu ve
  misafir çıkınca ekran bloklar kaybolarak zıplardı (vitrin iskeletinde ölçülen tuzağın aynısı).

  ÖLÇÜLER TAHMİN DEĞİL, `account-screen`in kendi stillerinden: sayfa zemini `sand-50`, üst
  güvenli alan + `space.sm` (başlığın kendi üst dolgusu), yatay dolgu `space['4xl']`, bloklar
  arası `space['2xl']`. Kartın yüksekliği profil kartının gerçek yüksekliğidir (avatar çapı +
  iki yanda `space['3xl']` dolgu) — veri gelince yer değişmesin diye.

  METİN YOK: nabız zaten "bekleniyor" diyor, yanına bir de "Yükleniyor…" yazmak aynı şeyi iki kez
  söylemek olurdu (kullanıcı bulgusu 09.08). Ekran okuyucuya tek ses gider — kök `progressbar` +
  `busy`; blokların kendisi a11y'de görünmez (`Skeleton` künyesi).
*/
function AccountLoading() {
  const { theme } = useUnistyles();

  return (
    <View
      style={styles.screen}
      testID="account-loading"
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      <Skeleton width="42%" height={theme.text['card-title'] * theme.text['h1--line-height']} />
      <Skeleton width="100%" height={theme.size.avatarLg + theme.space['3xl'] * 2} radius="card" />
    </View>
  );
}

const styles = StyleSheet.create((theme, rt) => ({
  screen: {
    flex: 1,
    backgroundColor: theme.colors['sand-50'],
    paddingTop: rt.insets.top + theme.space.sm,
    paddingHorizontal: theme.space['4xl'],
    gap: theme.space['2xl'],
  },
}));
