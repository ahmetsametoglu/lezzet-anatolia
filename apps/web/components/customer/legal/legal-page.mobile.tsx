'use client';

import { LegalBody, LegalHeader, LegalNoticeBand } from './legal-sections';
import { LegalFaq } from './legal-faq';
import { SCROLL_STRIP } from '@/components/customer/ui/scroll-strip';
import { useActiveSection } from './use-active-section.hook';
import type { LegalViewProps } from './legal-view-types';

/**
 * Statik sayfa — mobil (tasarım: "Statik Mobil").
 *
 * Masaüstünün dar hâli DEĞİL: gezinme yapışkan bir sütun olmaktan çıkıp **sayfa başındaki yatay çip
 * dizisi** oluyor (tasarımın etkileşim sözleşmesi bunu açıkça söylüyor). Dar ekranda 260px'lik bir
 * sütuna yer yok; alta atılsaydı da "bu sayfada" gezinmesi metnin ARDINDAN gelirdi, yani işe
 * yaramazdı — gezinme okumadan önce görünmeli.
 *
 * Çipler yatay kayar ve kaydırdıkça aktif olan işaretlenir; masaüstüyle aynı kanca, farklı kabuk.
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
