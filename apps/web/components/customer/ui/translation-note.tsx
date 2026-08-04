'use client';

/**
 * "Otomatik çevrildi" rozeti (+ istenirse iki yönlü bağlantı) — çevrilen her metnin ortak şeridi (20.2).
 *
 * **Neden ortak:** üç yüzey aynı şeyi söylüyor — ürün yorumu, talep yazışması ve B2B ret gerekçesi.
 * Üçü ayrı yazılsaydı aynı bilgi üç ekranda üç türlü görünürdü; üstelik rozetin ne zaman
 * çizileceği kuralı da üç yerde bakıma kalırdı (`CLAUDE.md §1`).
 *
 * **Rozet bir ETİKET, uyarı değil:** çeviri normal ve faydalı bir şey. Sessiz kalmak ise okuyucuya
 * yazarın kendi cümlesini okuduğunu düşündürürdü — 20.2'nin en kritik kuralı bu ("şikâyet şikâyet
 * kalır"): makine çevirisi bir cümleyi yumuşatabilir ya da sertleştirebilir, okuyucu neyi
 * okuduğunu bilmeli.
 *
 * **Bağlantı ZORUNLU DEĞİL** ve bu bir tasarım kararının karşılığı: orijinali göstermek her metinde
 * anlamlı değildir. Ürün yorumunda anlamlıdır (müşterinin kendi cümlesidir, okuyucu merak eder);
 * B2B ret gerekçesinin orijinali ise Türkçedir ve Fransız bir başvuru sahibinin onunla yapabileceği
 * bir şey yoktur — orası yalnız rozet ister. `toggle` verilmezse rozet tek başına çizilir; geçersiz
 * bir ara hâl (bağlantı var ama metni yok) **temsil edilemez**, çünkü metinler de `toggle`'ın içinde.
 */
interface TranslationNoteProps {
  /** "otomatik çevrildi" — komponent metin taşımaz, çağıranın sözlüğünden gelir. */
  badge: string;
  /** Orijinal paylaşılıyorsa: bağlantının iki metni + durumu. Verilmezse yalnız rozet. */
  toggle?: {
    showingOriginal: boolean;
    onToggle: () => void;
    showOriginal: string;
    showTranslation: string;
  };
  /**
   * Koyu zemin üstünde mi (müşterinin kendi balonu). Kum rozeti zeytin balonun üstünde okunmuyor;
   * `bg-white/15` iki temada da zeminin bir tık açığı olur ve ham renk kullanılmaz (`CLAUDE.md §3`).
   */
  onDark?: boolean;
}

export function TranslationNote({ badge, toggle, onDark = false }: TranslationNoteProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span
        className={[
          'rounded-pill px-2 py-0.5 font-sans text-micro',
          onDark ? 'bg-white/15 text-on-image-soft' : 'bg-sand-100 text-muted',
        ].join(' ')}
      >
        {badge}
      </span>
      {toggle && (
        <button
          type="button"
          onClick={toggle.onToggle}
          className={[
            'cursor-pointer font-sans text-micro font-bold transition-colors',
            onDark ? 'text-cream hover:text-white' : 'text-olive hover:text-olive-dark',
          ].join(' ')}
        >
          {toggle.showingOriginal ? toggle.showTranslation : toggle.showOriginal}
        </button>
      )}
    </div>
  );
}
