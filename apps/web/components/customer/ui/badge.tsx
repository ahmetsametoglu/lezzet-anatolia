import type { ReactNode } from 'react';

/**
 * K5 · Rozet — kısa durum/sınır etiketi ("En fazla 5 adet", "Yeni", "Tükendi"). Semantik aile
 * seçilir, tonlar envanterin dört katmanından gelir (metin · zemin · kenarlık); çağıran yer renk
 * seçmez, ANLAM seçer.
 *
 * DÖRT AĞIRLIK vardır ve seçim ANLAMA değil, ROZETİN KOMŞUSUNA bağlıdır:
 *   `tint`    — açık zeminli; ferah yerleşimde varsayılan.
 *   `filled`  — dolu zemin + beyaz metin: ADIN YANINDA, aynı satırda dururken. Açık ton orada
 *               başlığın içinde erir, rozetin ayrı bir şey olduğu görünmez (tasarım: sepet satırı).
 *   `plain`   — zeminsiz: dar mobil kartta rozet kutusu satırı şişirir, yalnız renkli metin kalır.
 *   `outline` — açık zemin + ÇERÇEVE: kart gövdesinin içinde, ürün adıyla fiyat arasında duran
 *               "yer işareti" (19.7). Çerçevesiz tint orada karta yapışıp bir metin satırı gibi
 *               okunuyordu; işaretin ayrı bir şey olduğunu söyleyen şey kenarlığı.
 */
type BadgeTone = 'offer' | 'positive' | 'pending' | 'closed' | 'package';
type BadgeVariant = 'tint' | 'filled' | 'plain' | 'outline';

const TONE: Record<BadgeTone, Record<BadgeVariant, string>> = {
  offer: {
    tint: 'bg-terracotta-bg text-terracotta',
    filled: 'bg-terracotta text-white',
    plain: 'text-terracotta',
    outline: 'border border-terracotta-line bg-terracotta-bg text-terracotta',
  },
  positive: {
    tint: 'bg-olive-bg text-olive-dark',
    filled: 'bg-olive text-white',
    plain: 'text-olive-dark',
    outline: 'border border-olive-line bg-olive-bg text-olive-dark',
  },
  pending: {
    tint: 'bg-honey-bg text-honey',
    filled: 'bg-honey text-white',
    plain: 'text-honey',
    outline: 'border border-honey-line bg-honey-bg text-honey',
  },
  // Tükendi rozeti ANTRASİTtir (envanter K3): açık gri bir "kapalı" tonu, adın yanında kaybolur.
  //
  // `outline` çerçevesi `closed-line` DEĞİL `sand-300`: o token yeşilimsi bir gri ve pasif çerçeve
  // için ayrılmış; buradaki zemin kum (`closed-bg` = `sand-100`) ve tasarım ona kum çerçeve veriyor.
  closed: {
    tint: 'bg-closed-bg text-closed',
    filled: 'bg-ink text-white',
    plain: 'text-closed',
    outline: 'border border-sand-300 bg-closed-bg text-closed',
  },
  // Paket rozeti: ANTRASİT zemin + AÇIK YEŞİL metin (tasarım). Dolu zeytin/beyaz olsaydı "olumlu
  // durum" rozetleriyle karışırdı; paket bir durum değil, satırın TÜRÜ — kendi rengi olmalı.
  package: {
    tint: 'bg-olive-bg text-olive-dark',
    filled: 'bg-ink text-olive-light',
    plain: 'text-olive-dark',
    outline: 'border border-olive-line bg-olive-bg text-olive-dark',
  },
};

const SHAPE: Record<BadgeVariant, string> = {
  tint: 'rounded-soft px-2 py-0.5 text-note',
  filled: 'rounded-soft px-2 py-0.5 text-micro',
  plain: 'text-micro',
  outline: 'rounded-soft px-2.5 py-0.5 text-micro',
};

interface BadgeProps {
  tone: BadgeTone;
  variant?: BadgeVariant;
  children: ReactNode;
}

export function Badge({ tone, variant = 'tint', children }: BadgeProps) {
  return (
    <span className={['w-max font-sans font-semibold', SHAPE[variant], TONE[tone][variant]].join(' ')}>{children}</span>
  );
}

/**
 * **Durum hapı** kabuğu — `Badge`in kardeşi, varyantı değil (denetim bulgusu M2, 02.08).
 *
 * Sipariş durumu, talep durumu, ödeme yolu ve hesap onay hapı aynı kabuğu ayrı ayrı yazıyordu:
 * `rounded-pill` + `font-bold` + `leading-tight`, üç ayrı ölçü kademesiyle.
 *
 * **Neden `Badge`e bir `shape` ekseni DEĞİL:** ölçüldü, tonlar tutmuyor. `Badge` anlam ailesi seçtirir
 * ve tonu kendi tablosundan verir; durum hapları ise tasarımın açıkça ayırdığı tonları kullanıyor —
 * iptal `terracotta-bright` ("hata/iptal metni" jetonu, `terracotta` değil), aktif üçlü `olive`
 * (`olive-dark` değil), çözülmüş talep `text-ink` ("çözülmüş talep pasif değil, sonuçlanmıştır").
 * Üçü de kendi künyesinde gerekçeli. `Badge`e bağlamak bu üç kararı sessizce ezerdi; `Badge`e ham
 * sınıf geçirmek ise onun "çağıran renk seçmez, ANLAM seçer" sözleşmesini bozardı.
 *
 * Paylaşılan şey KABUK; ton çağıranın kapalı listesinde kalır ve orada gerekçesiyle durur. İkisi aynı
 * dosyada yaşıyor ki "hangisini kullanacağım" sorusu tek yerde cevaplansın.
 *
 * Kademeler koddaki gerçek değerlerden: `sm` dar cihaz ve satır içi, `md` liste satırı, `lg` özet
 * kartındaki ödeme hapı (tasarımda tek başına duruyor, bir tık iri).
 */
type StatusPillSize = 'sm' | 'md' | 'lg';

const PILL_SIZE: Record<StatusPillSize, string> = {
  sm: 'px-2.5 py-0.5 text-micro',
  md: 'px-3 py-1 text-micro',
  lg: 'px-3 py-1.5 text-note',
};

export function statusPillClass(size: StatusPillSize, tone: string): string {
  return ['w-max flex-none rounded-pill font-sans font-bold leading-tight', PILL_SIZE[size], tone].join(' ');
}
