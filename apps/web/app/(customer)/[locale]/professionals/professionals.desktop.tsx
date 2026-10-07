import { RATIO_BAND } from '@lezzet/types';
import { FramedImage } from '@/components/media/framed-image';
import { buttonClass } from '@/components/customer/ui/button';
import { Card } from '@/components/customer/ui/card';
import { Icon } from '@/components/customer/ui/icons';
import { DesktopApplicationForm } from './components/desktop-application-form';
import { DesktopStatusNote } from './components/desktop-status-note';
import type { ProfessionalsViewProps } from './professionals-types';

/**
 * Masaüstü düzeni tasarımdan birebir: koyu kahraman, üç adım kartı, başvuru kutusu ve yan sütun. Kompozisyondur; form ve durum
 * satırını yerleştirir, kendi mantığını kurmaz.
 */
export function ProfessionalsDesktop({ t, status, rejection, signedIn, defaults, whatsappHref, whatsappNumber, locale, hero }: ProfessionalsViewProps) {
  return (
    <div className="flex flex-col">
      {/* Kahraman — koyu blok tam genişlikte; solda vaat, sağda görsel (tasarım 1.1fr / 1fr). */}
      <section className="flex items-stretch bg-ink text-on-image">
        <div className="flex min-w-0 flex-1 flex-col gap-4.5 px-12 py-13">
          <span className="font-sans text-caps-label tracking-[0.14em] text-olive-light uppercase">{t.hero.eyebrow}</span>
          {/* Başlık tasarımın ölçüsünde: daha küçük puntoda tek satıra sığar, sol sütun kısalır ve fotoğraf sütunu daralır. */}
          <h1 className="font-serif text-h1-md">{t.hero.title}</h1>
          <ul className="flex flex-col gap-2.5 font-sans text-copy leading-relaxed text-on-image-soft">
            {t.hero.benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2">
                <Icon name="check" size={16} className="mt-1 flex-none text-olive-light" />
                {benefit}
              </li>
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
              className="inline-flex cursor-pointer items-center gap-1.5 font-sans text-body-sm font-bold text-olive-light transition-opacity hover:opacity-75"
            >
              <Icon name="chat" size={16} />
              {t.hero.whatsapp}
            </a>
          </div>
        </div>
        {/* Görsel bloğun tam yüksekliğini kaplar: 16:9 kutu olarak çizilse sol sütun ondan uzun kalır ve fotoğrafın üstünde-altında
            koyu bant oluşur. */}
        <FramedImage
          src={hero?.url ?? null}
          alt={hero?.alt ?? t.hero.imageAlt}
          ratio={RATIO_BAND}
          crop={hero?.crop}
          frames={hero?.frames}
          // %59 bloğun yüksekliğinin 16:9 karşılığı; oranı ızgaraya bırakmak döngüye girerdi (genişlik yüksekliğe, yükseklik metne bağlı).
          sizes="750px"
          className="!rounded-none h-auto min-h-[340px] w-[59%] flex-none"
        />
      </section>

      {/* Nasıl çalışır — üç adım. Numara tasarımda Lora ve zeytin. */}
      <section className="grid grid-cols-3 gap-4 px-12 py-9">
        {t.steps.map((step, index) => (
          <Card key={step.title} gap="xs">
            <span className="font-serif text-card-title font-bold text-olive">{index + 1}</span>
            <span className="font-sans text-copy font-bold text-ink">{step.title}</span>
            <span className="font-sans text-note leading-relaxed text-body">{step.body}</span>
          </Card>
        ))}
      </section>

      <section id="application" className="grid grid-cols-2 items-start gap-10 px-12 pb-12">
        <Card>
          <DesktopStatusNote t={t} status={status} rejection={rejection} />
          {/* Başvurusu ONAYLANMIŞ müşteriye form çizilmiyor: ikinci bir künye göndermenin
              karşılığı yok, kayıt zaten açık. Bekleyen başvuruda form duruyor — aday bir
              alanını yanlış yazdıysa yeniden gönderebilmeli. */}
          {status !== 'approved' && (
            <DesktopApplicationForm t={t} locale={locale} signedIn={signedIn} defaults={defaults} />
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
              className="flex cursor-pointer items-center justify-center gap-2 rounded-pill bg-olive-bg px-4 py-3 text-center font-sans text-body-sm font-bold text-olive transition-opacity hover:opacity-75"
            >
              <Icon name="chat" size={16} />
              {t.aside.whatsapp.replace('{phone}', whatsappNumber)}
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
