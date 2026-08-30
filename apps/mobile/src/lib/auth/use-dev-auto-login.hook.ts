import { useEffect } from 'react';

import { DEV_ALL_SECTIONS_EMAIL, devSignIn } from './dev-login';
import { getSupabase } from './supabase';

/*
  OTOMATİK DEV GİRİŞİ (kullanıcı isteği 30.08) — geliştirirken uygulama müşteri vitrinine
  düşmesin, dört bölümü de gören personelle OPERASYONA düşsün.

  ── ÖLÇÜLEN ARIZA, VE ŞİKÂYETTEN FARKLI ÇIKTI ──────────────────────────────
  Belirti *"uygulama kendini yeniliyor ve sürekli müşteri tarafına düşüyor"* diye bildirildi.
  Cihazda ölçüldü (30.08, CPH1907): oturum VARKEN tazeleme müşteriye düşürmüyor — personel
  operasyonda kalıyor, çünkü açılış kararı zaten veriliyor (`use-staff-landing.hook`, 21.97).
  Düşüşün sebebi hot reload değil, OTURUMUN ÖLMESİ: token SecureStore'da kalıcı ama `db:refresh`
  auth kullanıcılarını yeniden yaratıyor ve eldeki oturum geçersizleşiyor. Geliştirme günü
  boyunca veritabanı defalarca tazelendiği için bu sık yaşanıyor.

  Yani otomatikleştirilen şey "operasyona gitmek" değil — o çalışıyor — **oturum ölünce yeniden
  giriş**. Kapıyı buraya koymak, çalışan bir mekanizmanın üstüne ikinci bir yönlendirme yazmaktan
  daha ucuz ve daha dürüst: oturum kurulunca gerisini var olan kural hallediyor.

  ── NİÇİN KÖKTE, LOGIN EKRANINDA DEĞİL ─────────────────────────────────────
  Oturumsuz açılışta uygulama müşteri kabuğunda başlar (02-mimari §4: oturumsuz kullanım müşteri
  gezinmesidir, uygulama giriş kapısıyla açılmaz). Yani login ekranı KENDİLİĞİNDEN açılmıyor;
  oraya konan bir otomatik giriş hiç ateşlenmezdi. Kök, "bir ekrana bağlanamayan yan etki"lerin
  yeri (`useVisitPoints` · `usePushRegistration` ile aynı sınıf).

  ── KAPI DEĞİL, YAN ETKİ ───────────────────────────────────────────────────
  Açılışı BEKLETMEZ: uygulama normal çizilir, giriş arka planda kurulur, oturum gelince açılış
  kararı kendi yolunda koşar. Kapı olsaydı şebekesiz cihazda uygulama hiç açılmazdı — aynı
  gerekçe `use-staff-landing` künyesinde de yazılı.

  ── ÜÇ KAPI: ÜRETİME SIZAMAZ, SEÇİMİ EZMEZ, KAPATILABİLİR ──────────────────
  1. `__DEV__` — üretim derlemesinde bu dosyanın gövdesi hiç koşmaz.
  2. **Oturum varsa dokunulmaz.** Müşteri hesabıyla ya da tek bölümlü bir personelle çalışıyorsan
     seçimin ezilmez; hook yalnız OTURUMSUZ hâli doldurur.
  3. `EXPO_PUBLIC_DEV_AUTOLOGIN=off` — kapatma anahtarı. Giriş akışının kendisini (OTP, OAuth,
     onboarding) denemek isteyen bunu kapatır; yoksa her açılışta oturum kurulur ve giriş ekranı
     bir daha görülmez.

  ── "BİR KEZ DENE" BAYRAĞI DENENDİ VE SÖKÜLDÜ (ölçüldü 30.08) ──────────────
  İlk yazımda modül düzeyinde bir `attempted` bayrağı vardı: *"uygulama ömrü boyunca bir kez"*.
  Cihazda ölçünce tam da otomatikleştirmek istediğimiz durumu bozduğu görüldü:

  | senaryo | sonuç |
  | --- | --- |
  | süreç öldürülüp yeniden başlatma | giriş yapıldı, operasyona düşüldü ✓ |
  | `RELOAD_APP` (geliştirmedeki tazeleme) ×2 | **giriş HİÇ denenmedi**, vitrinde kalındı |

  Sebep: tazeleme JS bağlamını yeniden kuruyor ama modül düzeyi bayrak hayatta kalıyor. Yani
  bayrak, kullanıcının şikâyet ettiği senaryonun ta kendisinde susuyordu. Söküldü — koruma zaten
  `useEffect(…, [])`in kendisinde: kök montajı başına bir kez koşar.

  ÇIKIŞ EZİLMEZ: çıkış yapıldığında kök MONTE hâldedir, effect yeniden koşmaz; kullanıcı giriş
  ekranında kalır. Yalnız tazelemeden sonra yeniden girilir — geliştirme akışında istenen budur.
  Giriş akışının kendisini denemek isteyen `EXPO_PUBLIC_DEV_AUTOLOGIN=off` ile kapatır.

  SESSİZ BAŞARISIZLIK BİLEREK: hata hâlinde hiçbir şey yapılmaz. Mobil istemcide `console` yasak
  (lint zorlar) ve açılışta toast basmak gürültü olurdu; kolaylık düşerse uygulama oturumsuz
  açılır, yani geliştirici zaten giriş ekranını görür ve orada HAM hata mesajını okur
  (`dev-login.ts` künyesi). Yutulan bir arıza yok — görünür hâle düşülüyor.
*/

export function useDevAutoLogin(): void {
  useEffect(() => {
    if (!__DEV__) return;
    if (process.env.EXPO_PUBLIC_DEV_AUTOLOGIN === 'off') return;
    /* Supabase adresi yoksa giriş zaten kurulamaz — ve `getSupabase()` o hâlde FIRLATIYOR.
       Ölçüldü 30.08: kök yığını render eden iki rota testi (`feedback-routes`) bu yüzden düştü;
       kancanın kendisi doğruydu, testte istemcinin hiç doğmaması gerekiyordu. Kapı burada
       duruyor çünkü soru "giriş yapılabilir mi" sorusudur, testin sorusu değil. */
    if (process.env.EXPO_PUBLIC_SUPABASE_URL === undefined) return;

    void (async () => {
      const { data } = await getSupabase().auth.getSession();
      if (data.session !== null) return; // oturum yerinde — seçim kimin olursa olsun ezilmez
      await devSignIn(DEV_ALL_SECTIONS_EMAIL);
    })();
  }, []);
}
