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
   * `bar` — başlık çubuklarının zeminsiz 40px dairesi (dokunma alanı 44). `photo` — native'in fotoğraf üstü biçimi
   * (14.09, ürün detayının kahramanı): 42px `sand-50` daire; basılınca küçülür.
   */
  variant?: 'bar' | 'photo';
  /**
   * Adımlı ekranın kendi geri adımı (15.09 — telefon girişi: kod → e-posta → seçim). Verilirse geçmişe GİTMEZ, bunu
   * çağırır; ekran ilk adımına dönünce çağıran vermeyi bırakır ve düğme yine geçmişe döner.
   */
  onPress?: () => void;
}

/**
 * Yuvarlak ‹ — native `BackButton`ın (`packages/mobile-kit/src/components/ui/back-button.tsx`) iki biçimi. Glif ikon
 * kademesinde ve normal ağırlıkta (native `text.icon`, 400); `bar`ın dairesi native'in 40'ı (`iconButton`), üstünde ve
 * basılıyken kum. Dokunma alanı görünmez `after` katmanıyla envanterin 44 tabanına tamamlanır; konum çağıranın
 * dolgusundan gelir, negatif pay yok (native'deki gibi). 14.09'a kadar 44'lük kutu, −10 pay ve 20px KALIN glif vardı —
 * native'inkinden küçük ve ağır duruyordu (kullanıcı bulgusu). Mobil webin başlıkları bunu taşır: `AppBar`,
 * `FunnelHeader`, paket detayının çubuğu.
 */
export function BackButton({ label, fallback, variant = 'bar', onPress }: BackButtonProps) {
  const router = useRouter();
  const goBack = () => {
    if (onPress) onPress();
    else if (window.history.length > 1) router.back();
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
