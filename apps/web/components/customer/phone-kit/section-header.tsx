/*
  Başlık `h2`dir, çünkü sayfanın `h1`i vitrinde arama motoru için durur. Büyük harf CSS'le verilir: tarayıcı sayfanın `lang`ına göre
  çevirir (Türkçede "i" → "İ").
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
