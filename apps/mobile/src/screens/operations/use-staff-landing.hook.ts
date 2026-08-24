import { usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useMe } from '@/screens/customer-kit/use-me.hook';
import { operationsHomeRoute } from '@/screens/login/post-login-route';

/*
  AÇILIŞTA ROL KARARI (21.97) — "kurye uygulamayı kapatıp açınca rotasını kaybediyor"un düzeltmesi.

  ── ÖLÇÜLEN ARIZA ───────────────────────────────────────────────────────────
  Giriş yapan personel operasyon kabuğuna gidiyordu (`post-login-route`, 21.32) ama uygulama
  YENİDEN açılınca aynı oturum müşteri sekmelerinde başlıyordu — yani aynı kullanıcı, aynı oturum,
  iki farklı iniş yeri. Sahadaki karşılığı sefer şeridinin cihaz turunda görüldü (18.08, CPH1907):
  kurye gün ortasında uygulamayı kapatıp açarsa rotasına ancak ÇIKIP yeniden girerek ulaşıyordu.

  ── KARARI KENDİ HESAPLAMAZ ─────────────────────────────────────────────────
  `operationsHomeRoute` girişin de okuduğu kuraldır; burada ikinci bir "personel mi" ölçütü yazmak
  iki kaynağın ayrışması demekti. Girişle açılış AYNI cevabı verir, çünkü aynı yere sorarlar.

  ── TEK ATIŞ, UYGULAMA ÖMRÜ BOYUNCA ─────────────────────────────────────────
  Bayrak modül düzeyinde çünkü soru "bu AÇILIŞTA nereye inilir" sorusudur, "her karede nerede
  olunmalı" değil. Kalıcı bir yönlendirme olsaydı personel müşteri yüzeyine hiç geçemezdi: köprüye
  bastığı an geri fırlatılırdı ve `BEKLEYEN(21.13)`ün çözümü kendi kendini yerdi.

  ── DERİN BAĞ HİÇ EZİLMEZ ───────────────────────────────────────────────────
  Yönlendirme YALNIZ müşteri kabuğunun kökündeyken (`/`) koşar. Uygulama bir davet bağıyla
  (`/invite/…`), geri bildirim bağıyla ya da bir bildirim dokunuşuyla açıldıysa kullanıcı istediği
  yerdedir ve oraya götürüldüğü için oradadır — kabuk onu çekip alsaydı bağ sessizce ölürdü.
  Personel de bir müşteridir: kendi davet bağına basan kurye o ekranı görmeli.

  ── NEDEN KAPI DEĞİL, YÖNLENDİRME ───────────────────────────────────────────
  Kökteki öteki kapılar (font, dil, yazı ölçeği) YEREL okumalardır ve milisaniyeler sürer; bu karar
  ise `/me`yi, yani AĞI bekler. Kapıya çevirseydik her soğuk açılış ağa bağlanırdı ve şebekesiz
  kuryenin uygulaması hiç açılmazdı. Bunun yerine müşteri kabuğu normal çizilir, cevap gelince
  yer değiştirilir — bir kare müşteri yüzeyi görünür, karşılığında uygulama çevrimdışı da açılır.

  `replace`, `push` DEĞİL: geçmişe kayıt düşmez, yani geri tuşu kuryeyi vitrine geri fırlatmaz.
*/

/**
 * Bu açılışta karar verildi mi. Modül düzeyi = uygulama ömrü: `useState` olsaydı sekme kabuğu her
 * söküldüğünde sıfırlanır ve köprüden dönen personel operasyona geri savrulurdu.
 */
let landed = false;

/**
 * "Bu açılışın kararı VERİLDİ" — köprüden müşteri yüzeyine geçen personel bunu çağırır.
 *
 * Olmasaydı gerçek bir PİNG-PONG doğardı ve yalnız bir yolda: taze giriş yapan personel kabuğa
 * `post-login-route` üstünden gider, yani bayrak hiç tüketilmemiştir. O kişi köprüye bastığı an
 * sekme kabuğu monte olur, kanca "bu açılışta henüz karar vermedim" der ve kullanıcıyı operasyona
 * geri fırlatırdı — köprü, basıldığı anda kendini iptal eden bir düğme olurdu.
 */
export function markStaffLandingDone(): void {
  landed = true;
}

/**
 * "YENİ AÇILIŞ" — bayrağı sıfırlar. Testler için.
 *
 * Bayrak modül düzeyinde yaşadığı için (yukarıdaki künye: uygulama ömrü) testler onu
 * `jest.resetModules()` ile tazeleyemez: taze yüklenen modül kendi React nüshasını çeker ve
 * hook'un dispatcher'ı `null` kalır (`place-name-memory` testinde ölçüldü, 24.08). Sıfırlamanın
 * dış kapıdan verilmesi, testin okuduğu kararın da GERÇEK karar olmasını sağlar — ikinci bir
 * "açılış" kavramı uydurulmuyor, var olanı geri alınıyor.
 */
export function resetStaffLanding(): void {
  landed = false;
}

/**
 * Müşteri kabuğunun kökünde bir kez koşar: oturum sahibinin operasyon bölümü varsa kabuğa taşır.
 *
 * Değer döndürmez — çağıranın çizeceği bir şey yok. Sekme kabuğunda durmasının sebebi `/me`
 * aboneliğinin orada ZATEN kurulu olması (`useWholesale`): ikinci bir uçuş doğmuyor.
 */
export function useStaffLanding(): void {
  const router = useRouter();
  const pathname = usePathname();
  const { status, me } = useMe();

  useEffect(() => {
    if (landed || status !== 'ready' || me === null) return;
    // Kök DIŞINDA hiç karar verilmez ve bayrak da TÜKETİLMEZ: derin bağla açılan uygulamada
    // kullanıcı köke döndüğünde karar hâlâ hakkıdır.
    if (pathname !== '/') return;

    const route = operationsHomeRoute(me);
    if (route === null) {
      // Müşteri de bir cevaptır: bir daha sorulmaz, yoksa her köke dönüşte `/me` yeniden tartılırdı.
      landed = true;
      return;
    }
    landed = true;
    router.replace(route);
  }, [status, me, pathname, router]);
}
