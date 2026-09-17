'use client';

import { LegalBody, LegalHeader, LegalNoticeBand } from './legal-sections';
import { LegalFaq } from './legal-faq';
import { SCROLL_STRIP } from '@/components/customer/ui/scroll-strip';
import { useActiveSection } from './use-active-section.hook';
import type { LegalViewProps } from './legal-view-types';

/**
 * Statik sayfanın telefon dizilişi: gezinme sayfa başında yatay çip dizisidir, çünkü dar ekranda sütuna yer yok ve okumadan
 * önce görünmeli. Çipler kaydırdıkça aktif bölümü işaretler.
 */
export function LegalPageMobile({ document: doc, t, updatedLine }: LegalViewProps) {
  const active = useActiveSection(doc.sections.map((section) => section.id));
  const showToc = doc.texture === 'prose' && doc.sections.length > 1;

  return (
    <div className="flex flex-col gap-3 px-4 py-4">
      <LegalHeader title={doc.title} updatedLine={updatedLine} compact />

      {showToc && (
        <nav aria-label={t.onThisPage} className={`${SCROLL_STRIP} gap-2`}>
          {doc.sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={[
                'flex-none cursor-pointer rounded-pill px-3.5 py-2 font-sans text-note font-bold transition-colors',
                section.id === active ? 'bg-olive text-cream' : 'border-[1.5px] border-sand-400 bg-card text-ink',
              ].join(' ')}
            >
              {section.heading}
            </a>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-4">
        <LegalBody sections={doc.sections} compact />
        {doc.questions && <LegalFaq questions={doc.questions} t={t} compact />}
        {doc.notice && <LegalNoticeBand notice={doc.notice} compact />}
      </div>
    </div>
  );
}
