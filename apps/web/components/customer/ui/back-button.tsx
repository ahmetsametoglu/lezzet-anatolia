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
  /**
   * Düğmenin durduğu yüzey (native `BackButton`ın aynı ayrımı, sekizinci tur 20.08):
   * `bar` zeminsizdir (başlık satırı, hover'da kum), `photo` krem dolguludur — fotoğrafın
   * üstünde zeminsiz bir glif okunmaz; dolgu okunurluk içindir (native: `sand-50` daire).
   */
  variant?: 'bar' | 'photo';
}

export function BackButton({ label, fallback, variant = 'bar' }: BackButtonProps) {
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
      // 44px kutu (envanter tabanı); bar'da `-ml-2.5` glifi metin hizasına oturtur (mobil menünün
      // deseni) — photo'da hiza derdi yok, dolgu ve gölge kenarından ölçülür.
      className={[
        'flex size-11 flex-none cursor-pointer items-center justify-center rounded-full font-sans text-icon-sm font-bold text-ink transition-colors',
        variant === 'photo' ? 'bg-sand-50/90 backdrop-blur hover:bg-sand-50' : '-ml-2.5 hover:bg-sand-200',
      ].join(' ')}
    >
      ‹
    </button>
  );
}
