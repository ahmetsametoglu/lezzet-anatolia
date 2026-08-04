import { buttonClass } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { ApplicationForm } from './components/application-form';
import { StatusNote } from './components/status-note';
import type { ProfessionalsViewProps } from './professionals-types';

/**
 * Professionnels — mobil düzeni (tasarım: "Professionnels Mobil" ekranı).
 *
 * **Yapıca farklı, akışça aynı** (ADR Sapma 3). Tasarım mobilde kahraman GÖRSELİNİ, üç adım
 * kartını ve yan sütunu hiç çizmiyor: dar ekranda önce vaat, hemen sonra form. Bu bir kırpma
 * değil sıralama kararı — telefondan gelen aday tanıtımı okumaya değil başvurmaya gelir.
 *
 * Düşen tek İÇERİK üç adım kartı; "onaya kadar perakende fiyat" cümlesi formun altında duruyor,
 * çünkü o bir tanıtım değil bir beklenti sözü ve onsuz aday fiyatları neden göremediğini sormaz.
 */
export function ProfessionalsMobile({ t, status, rejection, signedIn, defaults, whatsappHref, whatsappNumber, locale }: ProfessionalsViewProps) {
  return (
    <div className="flex flex-col">
      <section className="flex flex-col gap-3 bg-ink px-5 py-6.5 text-on-image">
        <span className="font-sans text-eyebrow-sm uppercase text-olive-light">{t.hero.eyebrow}</span>
        <h1 className="font-serif text-h1-sm leading-tight">{t.hero.title}</h1>
        <ul className="flex flex-col gap-1.5 font-sans text-body-sm leading-relaxed text-on-image-soft">
          {/* Mobilde dört değil ÜÇ fayda: tasarım dar ekranda listeyi kısaltıyor ve dördüncüsü
              (WhatsApp) zaten hemen altındaki düğmenin kendisi. */}
          {t.hero.benefits.slice(0, 3).map((benefit) => (
            <li key={benefit}>✓ {benefit}</li>
          ))}
        </ul>
        <a href="#application" className={buttonClass({ variant: 'primaryOnDark', fullWidth: true, className: '!rounded-pill' })}>
          {t.hero.cta}
        </a>
      </section>

      <section id="application" className="flex flex-col gap-3 px-4 py-4">
        <Card compact>
          <StatusNote t={t} status={status} rejection={rejection} compact />
          {status !== 'approved' && (
            <ApplicationForm t={t} locale={locale} signedIn={signedIn} defaults={defaults} compact />
          )}
        </Card>

        <a
          href={whatsappHref}
          target="_blank"
          rel="noopener noreferrer"
          className="cursor-pointer rounded-pill bg-olive-bg px-4 py-3 text-center font-sans text-body-sm font-bold text-olive transition-opacity hover:opacity-75"
        >
          💬 {t.aside.whatsapp.replace('{phone}', whatsappNumber)}
        </a>

        <p className="rounded-soft bg-cream-deep px-4 py-3.5 font-sans text-note leading-relaxed text-body">
          {t.aside.noticeLead} <strong className="text-ink">{t.aside.noticeStrong}</strong>
        </p>
      </section>
    </div>
  );
}
