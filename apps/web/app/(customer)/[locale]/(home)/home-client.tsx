'use client';

import { useEffect, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { useDevice } from '@/lib/use-device.hook';
import type { HomeView } from '@/lib/storefront/home-view';
import { loadHomeViewAction } from './actions';
import type { Messages } from './home-types';
import { HomeDesktop } from './home.desktop';
import { HomeMobile } from './home.mobile';

/**
 * Anasayfanın cihaz çatalı. Sunucu ipucu (UA) yanlışsa mount sonrası düzeltilir — kullanıcı tabletten
 * girdiğinde masaüstü düzenini görür (Sapma 3).
 *
 * **İKİ YÜZ FARKLI VERİ OKUR (14.09):** telefon native vitrinin bileşimini, masaüstü v1'inkini
 * (`home-view.ts` künyesi). Sayfa yalnız ipucunun yüzünü okur; düzeltme öteki yüze çevirirse o yüzün
 * verisi `loadHomeViewAction`dan istenir ve gelene kadar sunucunun çizdiği yüz ekranda kalır —
 * boş bir ara ekran çizilmez.
 */
interface HomeClientProps {
  t: Messages;
  locale: Locale;
  view: HomeView;
}

export function HomeClient({ t, locale, view }: HomeClientProps) {
  const resolved = useDevice(view.device);
  const [other, setOther] = useState<HomeView | null>(null);

  useEffect(() => {
    if (resolved === view.device || other?.device === resolved) return;
    let current = true;
    loadHomeViewAction(locale, resolved)
      .then((result) => {
        // Okuma düştüyse sunucunun çizdiği yüz kalır: sayfa kullanılabilir durumda ve hata action'da
        // zaten kayda geçti (`customerErrorKey` → `captureError`).
        if (current && result.data !== null) setOther(result.data);
      })
      .catch(() => {
        // Ağ düştü (action cevap bile veremedi): gösterilecek yeni bir şey yok, elde olan yüz kalır.
        // Sunucu tarafında kayıt yok çünkü istek oraya ulaşmadı; tarayıcı kendi hatasını konsola yazar.
      });
    return () => {
      current = false;
    };
  }, [resolved, view.device, other, locale]);

  const shown = resolved === view.device ? view : other !== null && other.device === resolved ? other : view;
  return shown.device === 'mobile' ? (
    <HomeMobile t={t} locale={locale} data={shown.data} />
  ) : (
    <HomeDesktop t={t} locale={locale} data={shown.data} hero={shown.hero} />
  );
}
