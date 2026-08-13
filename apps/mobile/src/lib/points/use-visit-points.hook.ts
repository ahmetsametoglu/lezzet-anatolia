import { useEffect } from 'react';
import { AppState } from 'react-native';

import { recordVisit } from '@/lib/api/points';
import { getSupabase } from '@/lib/auth/supabase';

/*
  GÜNLÜK GİRİŞ PUANI — native yarısı (MB-50 · kullanıcı kararı 11.08, açık ölçüldü 12.08).

  ── AÇIK NEYDİ ──────────────────────────────────────────────────────────────
  Ödül yalnız web'de yazılıyordu (`apps/web/lib/feedback/visit-actions.ts`); uygulamayı her gün
  açan müşteri hiç kazanmıyordu. Onboarding'in puan adımı bu ödülü artık müşteriye SÖYLÜYOR, yani
  açık kapanmak zorundaydı: söylenip yazılmayan puan, ekranın motordan cömert olmasıdır.

  ── NEDEN KÖKTE ve ÜÇ TETİKLEYİCİ ───────────────────────────────────────────
  Ödül "şunu yaptın" değil **"geldin"** karşılığıdır (web künyesi): bir ekrana bağlanamaz, çünkü
  müşteri hangi ekranda açacağını bilmiyoruz. Kökte tek çağrı var ve tetikleyeni tek satırda görünür.

  1. **İlk kare** — oturumu açık olan müşteri uygulamayı açtığında.
  2. **Uygulama öne gelince** — arka planda GÜNLERCE durabilir; gece yarısı geçtikten sonra dönen
     müşteri yeni günün puanını da almalı.
  3. **Oturum açılınca** — ÖLÇÜLMÜŞ AÇIK (cihazda, 12.08): ilk iki tetikleyici müşteri MİSAFİRKEN
     koşuyordu, giriş sonrası hiçbir şey tetiklemiyordu ve `points_entry`de `visit` satırı hiç
     doğmuyordu. Uygulamayı indirip hesap açan yeni müşteri, ilk gününün puanını hiç alamıyordu —
     ve onboarding o puanı ona SÖYLÜYOR. Dinleyici `useMe`nin desenidir (`onAuthStateChange`);
     olay türüne bakılmaz çünkü kapı zaten oturumsuzda ağa çıkmıyor ve motor günde ikinciyi düşürüyor.

  ── GÜNDE BİR KEZ SORUSU BURADA SORULMAZ ────────────────────────────────────
  Tekillik veritabanında (`points_entry_visit_day` — iş günü başına tek satır). Burada bir "bugün
  çağırdım mı" hafızası tutsaydık iki doğru kaynak olurdu ve cihaz saati ile sunucunun iş günü
  tanımı ayrıştığında ikisi farklı cevap verirdi. Fazladan istek ucuz: oturumsuzda `authorizedFetch`
  ağa hiç çıkmıyor (yerel kısa devre), girişli müşteride de motor ikinciyi zaten düşürüyor.

  ── SESSİZ ──────────────────────────────────────────────────────────────────
  Sonuç okunmaz, hata gösterilmez (karar seti 2h: *"uygulama açılınca — sessiz"*). Bir puanın
  yazılamaması uygulamanın açılmasını engellemesi gereken bir şey değil (DOMAIN §14: ödül aksiyonu
  teşvik eder, ona şart koşmaz) — web köprüsündeki hükmün aynısı.
*/
/**
 * Çağrı FIRLATMAZ — web köprüsündeki `try/catch`in aynısı ve aynı gerekçeyle.
 *
 * `authorizedFetch` ağ hatalarını sonuç olarak döndürüyor ama kapıya varmadan da düşebilir (env
 * eksik → Supabase istemcisi kurulamıyor). Yakalanmazsa bu, KÖKTE işlenmemiş bir promise reddine
 * dönüşür: uygulamanın en üst katmanında, bir puan yüzünden. Yutma bilinçli ve künyeli — sessiz
 * `catch` yasağının istediği tam olarak bu (CLAUDE §1: yutuyorsan NEDEN sessiz olduğunu yaz).
 */
function award(): void {
  void recordVisit().catch(() => undefined);
}

export function useVisitPoints(): void {
  useEffect(() => {
    award();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') award();
    });

    /* Abonelik kurulumu da FIRLATMAZ: `getSupabase()` yapılandırma eksikse (env yok) SENKRON
       patlıyor ve burası KÖK layout'un efekti — bir puan ödülü yüzünden uygulama hiç açılmazdı.
       Yutma körlük değil: aynı eksiklik gerçek her çağrıda zaten gürültüyle çıkıyor (`lib/env`
       adıyla söylüyor), yani arıza görünmez kalmıyor — yalnız BURADAN patlamıyor. */
    let authSubscription: { unsubscribe: () => void } | null = null;
    try {
      authSubscription = getSupabase().auth.onAuthStateChange(() => award()).data.subscription;
    } catch {
      authSubscription = null;
    }

    return () => {
      appState.remove();
      // Nesnenin KENDİSİ tutuluyor, metodu değil: `unsubscribe` `this`e bağlı olabilir.
      authSubscription?.unsubscribe();
    };
  }, []);
}
