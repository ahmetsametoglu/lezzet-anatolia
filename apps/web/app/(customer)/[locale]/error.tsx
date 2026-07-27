'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import { DEFAULT_LOCALE, LOCALES, type Locale } from '@lezzet/i18n';
import { Link } from '@/i18n/navigation';
import { useDevice } from '@/lib/use-device';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { SiteFrame } from '@/components/customer/ui/site-frame';
import { MessageScreen } from '@/components/customer/ui/message-screen';
import errorMessages from './error-messages.json';

/**
 * Müşteri 500 — segment içindeki beklenmeyen hataları yakalayan boundary (client zorunlu).
 * Tek mesaj: "sorun bizde". Teknik ayrıntı / hata kodu / yığın izi GÖSTERİLMEZ; güvence satırı
 * (sepet + verilmiş siparişler etkilenmedi) zorunludur. "Yeniden dene" aynı adresi tazeler (reset).
 */
export default function CustomerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Locale doğrudan URL segmentinden (/[locale]/…) — sağlayıcı iletimine bağlı değil, kesin.
  const rawLocale = useParams().locale;
  const locale: Locale = typeof rawLocale === 'string' && LOCALES.includes(rawLocale as Locale) ? (rawLocale as Locale) : DEFAULT_LOCALE;
  const device = useDevice('desktop');
  const t = errorMessages[locale].serverError;

  useEffect(() => {
    // Hata izleme servisi bağlanınca buraya gönderilir; müşteriye teknik ayrıntı yansıtılmaz.
    console.error(error);
  }, [error]);

  return (
    <SiteFrame device={device} locale={locale}>
      <MessageScreen
        device={device}
        emoji="🍳"
        eyebrow={t.eyebrow}
        title={t.title}
        description={t.description}
        actions={
          <>
            <Button variant="primary" onClick={reset}>
              {t.retryCta}
            </Button>
            <Link href="/" className={buttonClass({ variant: 'secondary' })}>
              {errorMessages[locale].home}
            </Link>
          </>
        }
      >
        {/* Güvence şeridi — mükerrer ödeme/sipariş korkusunu ilk cümlede bitirir */}
        <div
          className={[
            'mt-2 flex gap-4 rounded-soft bg-cream-deep px-4 py-3 font-sans text-[13.5px] text-body',
            device === 'mobile' ? 'flex-col text-left' : 'items-center',
          ].join(' ')}
        >
          <span>{t.cart}</span>
          <span>{t.orders}</span>
        </div>
      </MessageScreen>
    </SiteFrame>
  );
}
