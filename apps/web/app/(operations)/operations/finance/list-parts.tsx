/*
  Para listelerinin ORTAK parçaları (12.22 · 12.23) — hareketler günlere, belgeler aylara göre gruplu;
  ikisi aynı grup başlığını ve aynı "iş bekliyor" kenarını kullanır. Bir tur hareket listesinin içinde
  duruyorlardı; belgeler aynı dile geçince tek yere alındı.
*/

/**
 * Satırın SOL KENARI — iş bekleyen satır (12.22): izah bekleyen hareket ve açık belge amber, fazla ödenmiş
 * belge kırmızı. Sağ uçtaki 8px nokta yerine: kuyruğu tararken göz satırın başına bakar. İçe gölge,
 * kenarlık değil: kenarlık yazıyı 3px iterdi ve öteki satırlarla hiza bozulurdu. Renk tek başına
 * söylemez — hâl satırda ayrıca yazıyla okunur.
 */
export const ROW_EDGE = {
  amber: 'shadow-[inset_3px_0_0_0_var(--color-ops-amber)]',
  red: 'shadow-[inset_3px_0_0_0_var(--color-ops-red)]',
} as const;

interface GroupHeadingProps {
  title: string;
  /** Başlığın sönük ikinci yarısı — günün adı ("Pazartesi"); ay başlığında yok. */
  detail?: string;
}

/**
 * Grubun başlığı — kendi grubunun içinde YAPIŞKAN: kaydırırken üstte kalır, sıradaki grubun başlığı gelince
 * onu iter. Grup toplamı YAZILMAZ: sayfalı listede sayfa ortasında bölünen grubun toplamı eksik olurdu.
 */
export function GroupHeading({ title, detail }: GroupHeadingProps) {
  return (
    <h3 className="sticky top-0 z-[1] flex items-baseline gap-2 border-b border-ops-line bg-ops-surface-sunken px-6 py-1.5">
      <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{title}</span>
      {detail ? <span className="font-ops-body text-ops-xs text-ops-muted">{detail}</span> : null}
    </h3>
  );
}
