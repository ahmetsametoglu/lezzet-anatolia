import { Link } from '@/i18n/navigation';
import type { LegalDocument, LegalSection } from './legal-types';

/**
 * Statik sayfanın ortak blokları: iki dizilişte de başlık, gövde ve çıkış bandı aynı şeyi söyler, farklılaşan yalnız gezinme.
 * `compact` telefonun punto kademesini taşır.
 */

interface LegalHeaderProps {
  title: string;
  /** Zaten sayfanın dilinde biçimlenmiş cümle ("Son güncelleme: 1 Temmuz 2026"). */
  updatedLine: string;
  compact?: boolean;
}

export function LegalHeader({ title, updatedLine, compact = false }: LegalHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className={`font-serif ${compact ? 'text-page-title-sm' : 'text-page-title'} text-ink`}>{title}</h1>
      {/* Yasal metinde hangi sürümün geçerli olduğu görünür olmalı — içerik envanterinin şartı. */}
      <span className={`font-sans ${compact ? 'text-micro' : 'text-note'} text-muted`}>{updatedLine}</span>
    </div>
  );
}

interface LegalBodyProps {
  sections: LegalSection[];
  compact?: boolean;
}

export function LegalBody({ sections, compact = false }: LegalBodyProps) {
  return (
    <>
      {sections.map((section) => (
        // `scroll-mt-*`: başlığa atlayınca yapışkan üst bar başlığı örtmesin — çapa hedefi
        // görünür alanın en tepesine düşerse okuyan, atladığı başlığı göremez.
        <section key={section.id} id={section.id} className="flex flex-col gap-2.5 scroll-mt-24">
          <h2 className={`font-serif ${compact ? 'text-h2-sm' : 'text-card-title'} text-ink`}>{section.heading}</h2>
          {section.body.map((paragraph) => (
            <p key={paragraph} className={`font-sans ${compact ? 'text-body-sm' : 'text-body'} leading-relaxed text-body`}>
              {paragraph}
            </p>
          ))}
          {section.bullets && (
            <ul className={`flex list-disc flex-col gap-1.5 pl-5 font-sans ${compact ? 'text-body-sm' : 'text-body'} leading-relaxed text-body`}>
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
  compact?: boolean;
}

/**
 * Çıkış bandı: statik sayfa çıkmaz sokak olmamalı, cevabı bulamayan ziyaretçi gidecek bir yer görmeli. Bağlar cümlenin içinde
 * akar, çünkü bant bir çağrı değil bir hatırlatma.
 */
export function LegalNoticeBand({ notice, compact = false }: LegalNoticeBandProps) {
  return (
    <div className={`rounded-card bg-olive-bg ${compact ? 'px-3.5 py-3' : 'px-5 py-4'} font-sans ${compact ? 'text-body-sm' : 'text-body'} leading-relaxed text-ink`}>
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
