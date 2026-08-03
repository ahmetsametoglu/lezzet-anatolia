import { RATIO_BAND } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { buttonClass } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { ApplicationForm } from './components/application-form';
import { StatusNote } from './components/status-note';
import type { ProfessionalsViewProps } from './professionals-types';

/**
 * Professionnels — masaüstü düzeni (tasarım: `Musteri - Professionnels.dc.html`, "Professionnels
 * Web" ekranı). Bölüm sırası tasarımdan birebir: koyu kahraman (metin + görsel) → üç adım kartı →
 * başvuru kutusu + yan sütun.
 *
 * Bu dosya KOMPOZİSYONDUR: formu ve durum satırını yerleştirir, kendi mantığını kurmaz.
 */
export function ProfessionalsDesktop({ t, status, signedIn, defaults, whatsappHref, whatsappNumber, locale }: ProfessionalsViewProps) {
  return (
    <div className="flex flex-col">
      {/* Kahraman — koyu blok tam genişlikte; solda vaat, sağda görsel (tasarım 1.1fr / 1fr). */}
      <section className="grid grid-cols-[1.1fr_1fr] items-center bg-ink text-on-image">
        <div className="flex flex-col gap-4.5 px-12 py-13">
          <span className="font-sans text-eyebrow-sm uppercase text-olive-light">{t.hero.eyebrow}</span>
          <h1 className="font-serif text-h1-sm leading-tight">{t.hero.title}</h1>
          <ul className="flex flex-col gap-2.5 font-sans text-body leading-relaxed text-on-image-soft">
            {t.hero.benefits.map((benefit) => (
              <li key={benefit}>✓ {benefit}</li>
            ))}
          </ul>
          <div className="flex items-center gap-3.5">
            <a href="#application" className={buttonClass({ variant: 'primaryOnDark', className: '!rounded-pill' })}>
              {t.hero.cta}
            </a>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer font-sans text-body-sm font-bold text-olive-light transition-opacity hover:opacity-75"
            >
              💬 {t.hero.whatsapp}
            </a>
          </div>
        </div>
        <FramedImage src={null} alt={t.hero.imageAlt} ratio={RATIO_BAND} className="!rounded-none" />
      </section>

      {/* Nasıl çalışır — üç adım. Numara tasarımda Lora ve zeytin. */}
      <section className="grid grid-cols-3 gap-4 px-12 py-9">
        {t.steps.map((step, index) => (
          <Card key={step.title} gap="xs">
            <span className="font-serif text-card-title font-bold text-olive">{index + 1}</span>
            <span className="font-sans text-body font-bold text-ink">{step.title}</span>
            <span className="font-sans text-note leading-relaxed text-body">{step.body}</span>
          </Card>
        ))}
      </section>

      <section id="application" className="grid grid-cols-2 items-start gap-10 px-12 pb-12">
        <Card>
          <StatusNote t={t} status={status} />
          {/* Başvurusu ONAYLANMIŞ müşteriye form çizilmiyor: ikinci bir künye göndermenin
              karşılığı yok, kayıt zaten açık. Bekleyen başvuruda form duruyor — aday bir
              alanını yanlış yazdıysa yeniden gönderebilmeli. */}
          {status !== 'approved' && (
            <ApplicationForm t={t} locale={locale} signedIn={signedIn} defaults={defaults} />
          )}
        </Card>

        <div className="flex flex-col gap-4">
          <Card pad="snug" gap="sm">
            <span className="font-serif text-card-title-sm text-ink">{t.aside.title}</span>
            <span className="font-sans text-body-sm leading-relaxed text-body">{t.aside.body}</span>
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="cursor-pointer rounded-pill bg-olive-bg px-4 py-3 text-center font-sans text-body-sm font-bold text-olive transition-opacity hover:opacity-75"
            >
              💬 {t.aside.whatsapp.replace('{phone}', whatsappNumber)}
            </a>
          </Card>
          {/* Fiyat sözü: toptan liste onaysız GÖRÜNMEZ ve bu cümle tam da onu söylüyor — tasarımın
              "onaysız hiçbir yerde fiyat sızmaz" kuralının ekrandaki karşılığı. */}
          <p className="rounded-soft bg-cream-deep px-5.5 py-4.5 font-sans text-note leading-relaxed text-body">
            {t.aside.noticeLead} <strong className="text-ink">{t.aside.noticeStrong}</strong>
          </p>
        </div>
      </section>
    </div>
  );
}
