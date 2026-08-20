'use client';

/**
 * K · Adet seçici — "− [n] +". Ürün detayda ve sepette AYNI kontroldür; iki yerde ayrı yazıldığında
 * biri tavan davranışını kazanıp diğeri kazanamaz. Tek yerde durur, boyutu çağıran seçer.
 *
 * Ortadaki sayı her zaman GİRDİdir, salt-okunur metin değil: B2B müşteri 10-50 koli girer, artı
 * düğmesine 50 kez basmaz. Çerçevesiz durur — tasarımda rakam gibi görünür, dokununca imleç gelir.
 *
 * TAVANA ULAŞMA sessiz değildir: "+" yalnız pasifleşmez, çerçeve de nötrleşir. Yalnız soluk bir
 * düğme müşteriye "bozuk" der; sebebi komşu uyarı satırı söyler, bu onu görünür kılar.
 *
 * **Her kademe `leading-tight` taşır ve bu zorunlu.** Ölçek token'larımızda satır aralığı tanımlı
 * değil, bu yüzden preflight'ın 1.5'i (paragraf aralığı) uygulanıyor — bir kontrol etiketinde bu
 * kademeye göre 3-5 px fazladan yükseklik demek ve seçici tasarımdakinden belirgin şişiyor.
 * Ölçüldü (28.07): sepet masaüstü 36 px iken tasarım 32, mobil 33,5 iken tasarım 28.
 */
type StepperSize = 'lg' | 'md' | 'sm' | 'xs' | 'onDark';

interface SizeStyle {
  frame: string;
  /** Ped + imlerin ölçüsü — iki düğmede ortak. */
  pad: string;
  minus: string;
  plus: string;
  value: string;
  /**
   * `fullWidth` hâlinin ped/ölçüleri. İki amaç var:
   *   1. Dış kutu, yerini aldığı "Sepete ekle" düğmesiyle PİKSEL PİKSEL aynı olsun — bu yüzden yazı
   *      ölçüsü de düğmeninkiyle eşitlenir (farklı font boyu → farklı satır yüksekliği → farklı kutu).
   *   2. Bölgeler SABİT ORANDA paylaşsın: sayı %50, uçlardaki düğmeler %25'er. Serbest `flex` ile
   *      oran kutunun genişliğine göre kayıyordu; sabit pay her ölçüde aynı dengeyi verir.
   *
   * Satır yüksekliği `leading-tight`e ÇEKİLİR: `text-lead` 1.6 taşır (paragraf aralığı) ve bir
   * kontrol etiketinde ~9 px fazladan yükseklik demek. Aynı düzeltme yerini aldığı düğmede de var.
   */
  padWide?: string;
  valueWide?: string;
}

const SIZE: Record<StepperSize, SizeStyle> = {
  // Ürün detay masaüstü: sayfanın tek satın alma kontrolü, en iri kademe.
  lg: {
    frame: 'rounded-pill border-2 border-olive bg-card',
    pad: 'px-4.5 py-2.5 text-lead',
    minus: 'text-olive hover:bg-olive-bg',
    plus: 'bg-olive text-cream hover:bg-olive-dark',
    value: 'w-14 border-x border-sand-100 py-2.5 text-card-title-sm text-ink',
    // Düğme de `text-lead leading-tight py-3` + 2px şeffaf çerçeve taşır — iki kutu birebir eşit.
    padWide: 'w-1/4 flex-none py-3 text-lead leading-tight',
    valueWide: 'w-1/2 flex-none border-x border-sand-100 py-3 text-lead leading-tight text-ink',
  },
  // Sepet masaüstü satırı: satır içinde durur, kartın yüksekliğini belirlemez.
  md: {
    frame: 'rounded-pill border-2 border-olive bg-card',
    pad: 'px-3 py-1 text-step leading-tight',
    minus: 'text-olive hover:bg-olive-bg',
    plus: 'bg-olive text-cream hover:bg-olive-dark',
    value: 'w-8 py-1 text-body-sm leading-tight text-ink',
  },
  // Sepet mobil satırı.
  sm: {
    frame: 'rounded-soft border-[1.5px] border-olive bg-card',
    // GÖRSEL KÜÇÜK, DOKUNMA 44 (kullanıcı kararı 20.08): `min-h-11 min-w-11` görünür kutudaydı ve
    // seçici satırın en iri öğesine dönmüştü ("çok büyük ve rahatsız edici"). Katalog kartının
    // deseni buraya taşındı — kutu ~30px çizilir, dokunma alanı görünmez `after` katmanıyla dikeyde
    // 44'e tamamlanır (envanter tabanı). Yatay uzatma ±4px'te tutuldu: daha genişi ortadaki elle
    // giriş kutusunun dokunuşunu çalar (B2B oraya yazar) — xs'in "yalnız dikey garanti" emsali.
    pad: "relative flex items-center justify-center rounded-r-soft px-2.5 py-1 text-step-sm leading-tight after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
    minus: 'text-olive',
    plus: 'bg-olive text-cream',
    value: 'w-6 py-1 text-note leading-tight text-ink',
  },
  // Mobil katalog kartı — en dar kademe. Kart artık eylemi TAM GENİŞLİK tek satırda taşıyor
  // (kullanıcı kararı 20.08) ve seçici yerini aldığı `cardSm` düğmesiyle (26px) aynı kutuyu
  // doldurmak zorunda — görsel o yüzden küçük, dokunma `after` katmanıyla dikeyde 44 (sm'in aynı
  // deseni). `fullWidth` hâlinde uçlar %25, sayı %50 (lg'nin sabit oran kuralı).
  xs: {
    frame: 'rounded-soft border-[1.5px] border-olive bg-card',
    pad: "relative flex items-center justify-center rounded-r-soft px-2 py-0.5 text-body-sm leading-tight after:absolute after:-inset-x-1 after:-inset-y-2 after:content-['']",
    minus: 'text-olive',
    plus: 'bg-olive text-cream',
    value: 'w-6 py-0.5 text-micro leading-tight text-ink',
    padWide: "relative flex w-1/4 flex-none items-center justify-center rounded-r-soft py-0.5 text-body-sm leading-tight after:absolute after:-inset-y-2 after:content-['']",
    valueWide: 'w-1/2 flex-none border-x border-sand-100 py-0.5 text-micro leading-tight text-ink',
  },
  // Koyu sabit çubuk (ürün detay mobil): kontrast tersine döner.
  onDark: {
    frame: 'rounded-soft border-[1.5px] border-olive-light',
    pad: 'px-3 py-1.5 text-card-title-sm',
    minus: 'text-olive-light',
    plus: 'bg-olive-light text-ink',
    value: 'w-10 bg-transparent py-1.5 text-body text-cream',
    // Koyu çubuktaki düğme `text-body leading-tight py-3` + 1.5px şeffaf çerçeve taşır.
    padWide: 'w-1/4 flex-none py-3 text-body leading-tight',
    valueWide: 'w-1/2 flex-none border-x border-olive-light/40 bg-transparent py-3 text-body leading-tight text-cream',
  },
};

const BUTTON = 'cursor-pointer font-sans font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40';

interface QtyStepperProps {
  value: number;
  onChange: (next: number) => void;
  /** Alt sınır. Sepette 0 (0'a inen satır silinir), ürün detayda 1. */
  min?: number;
  /** Üst sınır — teklifin adet tavanı. Yoksa sınırsız. */
  max?: number | null;
  size?: StepperSize;
  /** Satırın tamamını kaplar — yerini aldığı düğmeyle aynı kutuyu doldurması gerektiğinde. */
  fullWidth?: boolean;
  disabled?: boolean;
}

export function QtyStepper({ value, onChange, min = 1, max = null, size = 'md', fullWidth = false, disabled = false }: QtyStepperProps) {
  const s = SIZE[size];
  const pad = fullWidth ? (s.padWide ?? s.pad) : s.pad;
  const valueStyle = fullWidth ? (s.valueWide ?? s.value) : s.value;
  const atCap = max !== null && value >= max;

  return (
    <span
      className={[
        'items-center',
        // `overflow-hidden` köşe kırpması içindi; `sm`/`xs`te dokunma alanı çerçevenin DIŞINA
        // taşar (after katmanı) ve kırpma onu tıklanamaz yapar — dolgu kendi köşesini taşır.
        size === 'sm' || size === 'xs' ? '' : 'overflow-hidden',
        fullWidth ? 'flex w-full' : 'inline-flex w-max',
        s.frame,
        // Tavandayken çerçeve nötrleşir; koyu çubukta zaten kontrast düşük, orada dokunulmaz.
        atCap && size !== 'onDark' ? '!border-sand-400' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        disabled={disabled || value <= min}
        aria-label="−"
        className={[BUTTON, pad, s.minus].join(' ')}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max ?? undefined}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, Number(e.target.value) || min)))}
        className={['min-w-0 text-center font-sans font-bold outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none', valueStyle].join(' ')}
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        disabled={disabled || atCap}
        aria-label="+"
        className={[BUTTON, pad, atCap ? 'bg-disabled-fill text-white' : s.plus].join(' ')}
      >
        +
      </button>
    </span>
  );
}
