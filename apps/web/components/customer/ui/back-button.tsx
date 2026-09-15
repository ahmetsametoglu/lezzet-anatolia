'use client';

import { useRouter } from '@/i18n/navigation';
import { backStaysInSite } from './back-target';

/** Rota tipi `router.push`tan türer; elle liste tutulmaz. */
type PushHref = Parameters<ReturnType<typeof useRouter>['push']>[0];

interface BackButtonProps {
  /** Ekran okuyucu adı — işaret ikon olduğu için zorunlu. */
  label: string;
  /** Geri siteden çıkaracaksa (geçmiş yok ya da öncesi başka site) gidilecek yer. */
  fallback: PushHref;
  /** `bar` başlık çubuğunun zeminsiz dairesi; `photo` fotoğraf üstündeki kum daire. */
  variant?: 'bar' | 'photo';
}

/**
 * Tarayıcı geçmişine döner; bir önceki kayıt başka bir sitedeyse (Google girişi dönüşü, arama motoru) ya da hiç yoksa
 * `fallback`e gider ki geri düğmesi müşteriyi siteden çıkarmasın. Dokunma alanı görünmez `after` katmanıyla 44'e
 * tamamlanır; konum çağıranın dolgusundan gelir.
 */
export function BackButton({ label, fallback, variant = 'bar' }: BackButtonProps) {
  const router = useRouter();
  const goBack = () => {
    const stays = backStaysInSite({
      length: window.history.length,
      navigationIndex: (window as { navigation?: { currentEntry?: { index: number } | null } }).navigation?.currentEntry?.index ?? null,
      firstEntryUrl: performance.getEntriesByType('navigation')[0]?.name ?? null,
      currentUrl: window.location.href,
      referrer: document.referrer,
    });
    if (stays) router.back();
    else router.push(fallback);
  };
  return (
    <button
      type="button"
      aria-label={label}
      onClick={goBack}
      className={
        variant === 'photo'
          ? 'flex size-10.5 flex-none cursor-pointer items-center justify-center rounded-full bg-sand-50 font-sans text-icon leading-none text-ink transition-transform active:scale-[0.97]'
          : "relative flex size-10 flex-none cursor-pointer items-center justify-center rounded-full font-sans text-icon leading-none text-ink transition-colors after:absolute after:-inset-0.5 after:content-[''] hover:bg-sand-200 active:bg-sand-200"
      }
    >
      ‹
    </button>
  );
}
