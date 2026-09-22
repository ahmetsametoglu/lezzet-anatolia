import { Link } from '@/i18n/navigation';
import type { LegalDocument, LegalSection } from './legal-types';

/**
 * Statik sayfanın masaüstü blokları: başlık, bölüm gövdesi ve çıkış bandı. Telefon dizilişi native bilgi ekranının ikizi
 * olduğu için kendi bloklarını çiziyor (`legal-page.mobile.tsx`).
 */

interface LegalHeaderProps {
  title: string;
  /** Zaten sayfanın dilinde biçimlenmiş cümle ("Son güncelleme: 1 Temmuz 2026"). */
  updatedLine: string;
}

export function LegalHeader({ title, updatedLine }: LegalHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="font-serif text-page-title text-ink">{title}</h1>
      {/* Yasal metinde hangi sürümün geçerli olduğu görünür olmalı. */}
      <span className="font-sans text-note text-muted">{updatedLine}</span>
    </div>
  );
}

interface LegalBodyProps {
  sections: readonly LegalSection[];
}

export function LegalBody({ sections }: LegalBodyProps) {
  return (
    <>
      {sections.map((section) => (
        // `scroll-mt-*`: başlığa atlayınca yapışkan üst bar başlığı örtmesin — çapa hedefi
        // görünür alanın en tepesine düşerse okuyan, atladığı başlığı göremez.
        <section key={section.id} id={section.id} className="flex flex-col gap-2.5 scroll-mt-24">
          <h2 className="font-serif text-card-title text-ink">{section.heading}</h2>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph} className="font-sans text-body leading-relaxed text-body">
              {paragraph}
            </p>
          ))}
          {section.bullets.length > 0 && (
            <ul className="flex list-disc flex-col gap-1.5 pl-5 font-sans text-body leading-relaxed text-body">
              {section.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </>
  );
}

interface LegalNoticeBandProps {
  notice: NonNullable<LegalDocument['notice']>;
}

/**
 * Çıkış bandı: statik sayfa çıkmaz sokak olmamalı, cevabı bulamayan ziyaretçi gidecek bir yer görmeli. Bağlar cümlenin içinde
 * akar, çünkü bant bir çağrı değil bir hatırlatma.
 */
export function LegalNoticeBand({ notice }: LegalNoticeBandProps) {
  return (
    <div className="rounded-card bg-olive-bg px-5 py-4 font-sans text-body leading-relaxed text-ink">
      <span>{notice.text} </span>
      {notice.links.map((link, index) => (
        <span key={link.label}>
          {index > 0 && <span className="text-body"> · </span>}
          <Link href={link.href} className="cursor-pointer font-bold text-olive transition-colors hover:text-olive-dark">
            {link.label}
          </Link>
        </span>
      ))}
    </div>
  );
}
