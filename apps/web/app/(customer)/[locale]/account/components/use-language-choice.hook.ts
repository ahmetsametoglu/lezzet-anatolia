'use client';

import { useEffect, useTransition } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { PreferredLanguage } from '@lezzet/types';
import { useRouter } from '@/i18n/navigation';
import { setPreferredLanguageAction } from '@/lib/identity/language-actions';

/** Dil seçimi — `choose` karta yazar ve sayfayı o dile götürür; `pending` geçiş sürerken doğru. */
interface LanguageChoice {
  choose: (next: PreferredLanguage) => void;
  pending: boolean;
}

/**
 * Hesabın dil seçimi — masaüstü profil kartının hapı ve telefonun dil kartı (native'in çipleri) AYNI kapıdan geçer
 * (14.09). Dil TEK bir şeydir (30.07 · kullanıcı kararı): sitenin dili ile bildirimlerin dili aynı; gerekçesi profil
 * kartının künyesinde.
 */
export function useLanguageChoice(locale: Locale, stored: PreferredLanguage): LanguageChoice {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  /**
   * **Gösterilen değer AKTİF SAYFA DİLİDİR, karttaki değer değil** (30.07 · kullanıcı fark etti).
   *
   * Önce kart okunuyordu ve ekran kendi kendiyle çelişiyordu: sayfa Türkçe, hap "Français". Oysa
   * karar "dil TEKTİR" — sitenin dili ile bildirimlerin dili aynı şey. İkisinin ayrı görünebildiği
   * bir ekran, o kararı ekranda bozuyordu.
   *
   * Kart farklıysa (kayıt anındaki tohum `fr`, müşteri hiç seçim yapmamış) **sessizce hizalanır**:
   * ekranda "Türkçe" yazıp maili Fransızca göndermek, gösterdiğimiz şeyi uygulamamak olurdu.
   * Bu, "yalnız bağlantıya girmek yazmaz" kuralının istisnasıdır ve dar tutuluyor — burası
   * müşterinin KENDİ ayar sayfası, gelip geçilen bir içerik sayfası değil.
   */
  useEffect(() => {
    if (stored !== locale) void setPreferredLanguageAction(locale);
  }, [stored, locale]);

  const choose = (next: PreferredLanguage) => {
    if (next === locale) return;
    // Karta yaz + sayfayı o dile götür. İkisi AYNI eylemin iki yüzü; ayrı düşünülemezler.
    void setPreferredLanguageAction(next);
    startTransition(() => router.replace('/account', { locale: next }));
  };

  return { choose, pending };
}
