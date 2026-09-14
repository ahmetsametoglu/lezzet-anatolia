/*
  BÖLÜM BAŞLIĞI — native `SectionHeader`ın web ikizi (14.09): terracotta üstbaşlık (native'in 10 · 700 ·
  .18em kademesi) ve altında isteğe bağlı Lora başlık. Başlık `h2`: sayfanın `h1`i vitrinde arama
  motoru için duruyor, bölümler onun altında sıralanır. Büyük harf CSS'le — tarayıcı sayfanın `lang`
  özniteliğine göre çevirir (Türkçede "i" → "İ"), native'deki `upperIn`in işini burada o görür.
*/

interface SectionHeaderProps {
  eyebrow: string;
  title?: string;
}

export function SectionHeader({ eyebrow, title }: SectionHeaderProps) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-sans text-eyebrow-xs text-terracotta uppercase">{eyebrow}</span>
      {title !== undefined && <h2 className="font-serif text-h2-sm text-ink">{title}</h2>}
    </div>
  );
}
