'use client';

/**
 * Çeviri şeridi — çevrilen metnin ortak işareti; üç yüzey aynı şeyi söylüyor (ürün yorumu, talep
 * yazışması, B2B ret gerekçesi) ve ayrı yazılsalardı hem görünümleri hem "ne zaman çizilir" kuralı
 * üç yerde bakıma kalırdı (`CLAUDE.md §1`).
 *
 * **Okuyucu neyi okuduğunu bilmeli:** makine çevirisi bir cümleyi yumuşatabilir ya da
 * sertleştirebilir, bu yüzden çeviri sessizce orijinalin yerine geçmez.
 *
 * **Rozet ve bağlantı BİRBİRİNİN YERİNE geçer, yan yana durmaz:** "Orijinali göster" zaten okunanın
 * çeviri olduğunu söylüyor, yanına bir de "otomatik çevrildi" rozeti koymak aynı bilgiyi iki kez
 * yazmaktır. Bağlantı verilemeyen yerde (B2B ret gerekçesinin orijinali Türkçedir, Fransız başvuru
 * sahibinin onunla yapabileceği bir şey yoktur) bilgiyi rozet taşır.
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
      {!toggle && (
        <span
          className={[
            'rounded-pill px-2 py-0.5 font-sans text-micro',
            onDark ? 'bg-white/15 text-on-image-soft' : 'bg-sand-100 text-muted',
          ].join(' ')}
        >
          {badge}
        </span>
      )}
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
