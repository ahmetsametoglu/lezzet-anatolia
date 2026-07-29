import type { ButtonHTMLAttributes } from 'react';

/**
 * Lezzet buton — tüm buton varyasyonları tek yerde (Tailwind token'ları). Inline buton stili
 * yazmak yerine `<Button variant size fullWidth>` kullanılır. `<Link>`/`<a>` gibi buton-olmayan
 * öğeler için aynı görünümü `buttonClass(...)` verir. Tasarım büyüdükçe varyant eklenir.
 */
type ButtonVariant = 'primary' | 'primaryOnDark' | 'secondary' | 'secondaryOnDark' | 'outlineOlive' | 'outlineTerracotta' | 'ghost';
type ButtonSize = 'lg' | 'md' | 'sm' | 'xs' | 'card' | 'cardSm';

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'rounded-pill bg-olive text-white hover:bg-olive-dark disabled:bg-disabled-fill disabled:text-disabled-text',
  // Devre dışı hâl SOLUKLAŞTIRMA değil kendi token'ıyla: `opacity-50` çerçeveli bir düğmeyi
  // "biraz soluk ama basılabilir" gibi gösteriyor; kum yerine `disabled-line` net bir kapı diyor.
  secondary:
    'rounded-pill border-[1.5px] border-sand-400 bg-card text-ink hover:border-olive disabled:border-disabled-line disabled:text-disabled-text disabled:hover:border-disabled-line',
  // K2 koyu zemin varyantı — antrasit blok üstünde açık yeşil çerçeve/metin (envanter §2).
  secondaryOnDark: 'rounded-pill border-[1.5px] border-olive-light bg-transparent text-olive-light hover:bg-olive-light/10',
  // Koyu SABİT ÇUBUĞUN ana aksiyonu (mobil detay): zemin antrasit olduğu için dolgu açık yeşile,
  // metin antrasite döner. Köşe `rounded-soft`tur, hap değil — çubuğun içinde hap fazla yuvarlak
  // durup komşusu adet seçiciyle hizasını bozuyor. Şeffaf kenarlık seçiciyle aynı kutuyu verir.
  primaryOnDark:
    'rounded-soft border-[1.5px] border-transparent bg-olive-light text-ink hover:bg-olive-light/90 disabled:bg-disabled-fill disabled:text-disabled-text',
  // Birincilin YANINDA duran ikinci eylem: nötr `secondary` orada "geri/iptal" gibi okunur, oysa
  // ikisi de ileri gider (boş sepet: katalog · paketler). Aynı aile, farklı ağırlık.
  outlineOlive: 'rounded-pill border-2 border-olive bg-transparent text-olive hover:bg-olive-bg disabled:border-disabled-line disabled:text-disabled-text',
  // Yıkıcı ama ONAYLANMIŞ eylem (sepetten çıkar): dolu terracotta bir düğme satırı hata gibi gösterir.
  outlineTerracotta: 'rounded-pill border-[1.5px] border-terracotta bg-transparent text-terracotta hover:bg-terracotta-bg',
  ghost: 'text-olive hover:text-olive-dark disabled:text-sand-600',
};

/**
 * Dolgulu varyantlar (primary/secondary) SABİT YÜKSEKLİK alır; ghost yalnız metin boyutu.
 *
 * Yükseklikler envanterin **dokunma hedefi tablosundan** gelir — K1 birincil buton `48px` (mobil 52),
 * K2 ikincil `44px` (mobil 48), yatay ped `26-30px`. Ped hesabıyla yükseklik "yaklaşık" tutturmak
 * yerine `h-*` verilmesi bilinçli: punto ya da satır aralığı değiştiğinde yükseklik kaymaz, komşu
 * öğeyle hizası bozulmaz. (Ped hesabı üç turda üç farklı sonuç vermişti.)
 */
const PADDED_SIZE: Record<ButtonSize, string> = {
  // `lg` yalnız ürün detayın ana aksiyonunda: sayfanın tek satın alma butonu, toplam tutarı taşır
  // ve mobilde ekran altına sabitlenir — kart butonlarıyla aynı ağırlıkta olamaz.
  lg: 'h-14 px-10 text-lead',
  md: 'h-12 px-7 text-body',
  sm: 'h-11 px-5 text-body-sm',
  // Satır içi eylem (sepet satırının "çıkar" düğmesi, mobil kartlar) — kartın yüksekliğini belirlemez.
  xs: 'h-9 px-3.5 text-micro',
  /**
   * KART İÇİ kademe — vitrin kartlarının fiyat satırındaki düğme (katalog "Sepete ekle" ·
   * "Seçenekler →" · paket "Paketi incele").
   *
   * Kendi kademesi olması şart, çünkü bu düğme **yerini K19 adet seçicisine bırakıyor**: müşteri
   * ürünü ekleyince aynı kutuda seçici belirir. İkisi farklı yükseklikteyse kart o anda zıplar —
   * nitekim zıplıyordu: düğme sayfa ölçüsü `sm` ile 44 px, seçici 32 px idi ve arada 12 px vardı
   * (29.07 kullanıcı fark etti). Ped `!px-/!py-` ile ezilmeye çalışılmıştı ama sabit `h-*` yanında
   * dikey ped ölü yazıdır; yükseklik hiç değişmiyordu.
   *
   * Ölçü tasarımın katalog kartından: 13 px metin, `8px/6px` dikey ped → **32 px**; K2'nin koyu
   * zemin varyantı da (`7px 16px` + 1.5 çerçeve) aynı 32'yi veriyor. Mobilde 11 px metin → 26 px,
   * seçicinin `xs` kademesiyle aynı kutu.
   */
  card: 'h-8 px-3.5 text-note',
  cardSm: 'h-6.5 px-2.5 text-micro',
};
const GHOST_SIZE: Record<ButtonSize, string> = {
  lg: 'text-lead',
  md: 'text-body',
  sm: 'text-sm',
  xs: 'text-micro',
  card: 'text-note',
  cardSm: 'text-micro',
};

interface ButtonClassOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

export function buttonClass({ variant = 'primary', size = 'md', fullWidth, className }: ButtonClassOptions = {}): string {
  return [
    // Odak halkası envanter §0.4: 2px zeytin outline, 3px offset — ayrı renk taşımaz.
    // `leading-tight`: tip token'ları satır yüksekliği taşımıyor, kontrol o zaman gövde metninin
    // 1.5 aralığını miras alıp çizilenden ~4 px uzuyor (tasarım md butonu 46 px, biz 50,5 idik).
    // Aynı tuzak adet seçicide ve girdilerde de yaşandı — kontrolün satır aralığı kutunun sorunudur.
    'inline-flex cursor-pointer items-center justify-center gap-2 font-sans font-bold leading-tight transition-colors disabled:cursor-not-allowed',
    'outline-none focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-olive',
    VARIANT[variant],
    variant === 'ghost' ? GHOST_SIZE[size] : PADDED_SIZE[size],
    fullWidth ? 'w-full' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

export function Button({ variant, size, fullWidth, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size, fullWidth, className })} {...rest} />;
}
