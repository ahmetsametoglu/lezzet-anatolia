'use client';

import { LegalBody, LegalHeader, LegalNoticeBand } from './desktop-legal-sections';
import { DesktopLegalFaq } from './desktop-legal-faq';
import { useActiveSection } from './use-active-section.hook';
import type { LegalViewProps } from './legal-view-types';

/**
 * Statik sayfanın masaüstü dizilişi: solda yapışkan "Bu sayfada" kartı, sağda 680px'i geçmeyen metin sütunu, çünkü geniş
 * satırlar uzun hukuki metni okunmaz yapar. SSS'de gezinme sütunu yok; orada gezinme arama kutusu ve akordeonun kendisi.
 */
export function LegalPageDesktop({ document: doc, t }: LegalViewProps) {
  const active = useActiveSection(doc.sections.map((section) => section.id));
  const showToc = doc.texture === 'prose' && doc.sections.length > 1;

  return (
    <div className="flex gap-11 px-12 py-9">
      {showToc && (
        <nav aria-label={t.onThisPage} className="sticky top-5 flex h-fit w-65 flex-none flex-col gap-1 rounded-card border border-sand-200 bg-card px-5 py-4.5">
          <span className="pb-1.5 font-sans text-eyebrow-sm uppercase text-muted">{t.onThisPage}</span>
          {doc.sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={[
                'cursor-pointer py-1.5 pl-2.5 font-sans text-body-sm transition-colors',
                // Sol çizgi HER öğede var, pasif olanda saydam: yalnız aktife verilseydi öğe 3px
                // kayardı ve kaydırdıkça bütün liste sağa sola oynardı (menü sekmeleriyle aynı kural).
                section.id === active
                  ? 'border-l-[3px] border-olive font-bold text-olive'
                  : 'border-l-[3px] border-transparent text-body hover:text-olive',
              ].join(' ')}
            >
              {section.heading}
            </a>
          ))}
        </nav>
      )}

      <div className="flex max-w-170 flex-1 flex-col gap-5.5">
        <LegalHeader title={doc.title} updatedLine={doc.updatedLine} />
        <LegalBody sections={doc.sections} />
        {doc.questions && <DesktopLegalFaq questions={doc.questions} t={t} />}
        {doc.notice && <LegalNoticeBand notice={doc.notice} />}
      </div>
    </div>
  );
}
