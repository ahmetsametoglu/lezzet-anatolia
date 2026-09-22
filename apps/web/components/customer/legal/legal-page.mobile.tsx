'use client';

import { useLocale } from 'next-intl';
import type { Locale } from '@lezzet/i18n';
import legalMessages from '@lezzet/i18n/customer/legal';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { PhoneLegalFaq } from './phone-legal-faq';
import type { LegalNotice, LegalSection } from './legal-types';
import type { LegalViewProps } from './legal-view-types';

/**
 * Statik sayfanın telefon dizilişi, native bilgi ekranının ikizi: çubukta sayfanın adı, gövdede güncelleme satırı, bölümler,
 * SSS ve çıkış bandı.
 */
export function LegalPageMobile({ document: doc, t, updatedLine }: LegalViewProps) {
  const locale = useLocale() as Locale;

  return (
    <>
      {/* Belgelerin kalıcı evi hesap ekranı; derin bağlantıyla gelen ‹ ile oraya döner. */}
      <AppBar title={doc.title} left={<BackButton label={legalMessages[locale].back} fallback="/account" />} />
      <div className="flex flex-col gap-5.5 px-5.5 pt-5 pb-7.5">
        <span className="font-sans text-helper text-muted">{updatedLine}</span>

        {doc.sections.map((section) => (
          <PhoneLegalSection key={section.id} section={section} />
        ))}
        {doc.questions && <PhoneLegalFaq questions={doc.questions} t={t} />}
        {doc.notice && <PhoneLegalNotice notice={doc.notice} />}
      </div>
    </>
  );
}

interface PhoneLegalSectionProps {
  section: LegalSection;
}

function PhoneLegalSection({ section }: PhoneLegalSectionProps) {
  return (
    // Çapa hedefi yapışkan çubuğun altında kalmasın.
    <section id={section.id} className="flex scroll-mt-16 flex-col gap-2.5">
      <h2 className="font-serif text-card-title-sm text-ink">{section.heading}</h2>
      {section.body.map((paragraph) => (
        <p key={paragraph} className="font-sans text-body-sm leading-[1.6] text-body">
          {paragraph}
        </p>
      ))}
      {section.bullets && (
        <ul className="flex flex-col gap-2.5">
          {section.bullets.map((bullet) => (
            <li key={bullet} className="flex gap-2 font-sans text-body-sm leading-[1.6] text-body">
              <span aria-hidden className="font-bold text-olive">
                ·
              </span>
              <span className="min-w-0 flex-1">{bullet}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface PhoneLegalNoticeProps {
  notice: LegalNotice;
}

/** Çıkış bandı: statik sayfa çıkmaz sokak olmamalı; bağlar native'deki gibi metnin altında ayrı eylemler. */
function PhoneLegalNotice({ notice }: PhoneLegalNoticeProps) {
  return (
    <div className="flex flex-col gap-2.5 rounded-card bg-olive-bg px-5 py-4.5">
      <p className="font-sans text-note leading-[1.6] text-body">{notice.text}</p>
      <div className="flex flex-wrap gap-5">
        {notice.links.map((link) => (
          <TextAction key={link.label} label={link.label} href={link.href} />
        ))}
      </div>
    </div>
  );
}
