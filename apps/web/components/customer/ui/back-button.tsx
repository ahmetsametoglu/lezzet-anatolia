'use client';

import { useRouter } from '@/i18n/navigation';

/** Rota tipi KAPIDAN türer: `router.push` neyi kabul ediyorsa fallback odur — elle liste tutulmaz. */
type PushHref = Parameters<ReturnType<typeof useRouter>['push']>[0];

/**
 * Yuvarlak `‹` geri düğmesi — native `BackButton`ın web karşılığı (kullanıcı kararı 20.08).
 *
 * Sepetin geri kontrolü metin bağdı ("← Devam et") ve iki kusuru ölçülüydü: "devam" kelimesi
 * checkout dilinde İLERİ anlamına geliyor (FR "Continuer" daha da belirsiz), ve çıplak metnin
 * dokunma alanı ~20px'ti — envanterin 44px tabanının altında. İkon tek anlam taşır, dile bağlı
 * uzunluk derdi yoktur, daire 44px kutuda oturur (native: 40dp yuvarlak, sepette de aynı bileşen).
 *
 * DAVRANIŞ tarayıcı geçmişine döner: müşteri üründen geldiyse ürüne, katalogdan geldiyse kataloğa.
 * Geçmiş yoksa (derin bağlantıyla düşen ziyaretçi) `fallback` rotasına gider — ikonun "geri" sözü
 * hiçbir hâlde çıkmaz sokağa götürmez. İşaret metin değil İKON: ekran okuyucuya giden ad `label`
 * ile gelir, i18n çağıranda çözülür (native künyesinin aynı kuralı).
 */
interface BackButtonProps {
  /** Ekran okuyucu adı ("Geri" / "Retour" / "Zurück") — zorunlu, i18n üstte çözülür. */
  label: string;
  /** Tarayıcı geçmişi boşken gidilecek yer. */
  fallback: PushHref;
}

export function BackButton({ label, fallback }: BackButtonProps) {
  const router = useRouter();
  const goBack = () => {
    if (window.history.length > 1) router.back();
    else router.push(fallback);
  };
  return (
    <button
      type="button"
      aria-label={label}
      onClick={goBack}
      // 44px kutu (envanter tabanı); `-ml-2.5` glifi metin hizasına oturtur (mobil menünün deseni).
      className="-ml-2.5 flex size-11 flex-none cursor-pointer items-center justify-center rounded-full font-sans text-icon-sm font-bold text-ink transition-colors hover:bg-sand-200"
    >
      ‹
    </button>
  );
}
