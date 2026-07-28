'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { recordZoneNoticeAction } from '@/lib/delivery/notice-actions';
import messages from './restriction-messages.json';

/**
 * "Bölgeye gelince haber ver" — e-posta alan küçük panel.
 *
 * Metin bir SÖZ vermez: "not alalım", "tek bir e-posta göndeririz — başka bir şey için
 * kullanmayız". Bölge genişletme kararı verilmiş değil; "haber vereceğiz" demek tutulamayacak bir
 * söz olurdu. Kaydın bugünkü değeri işletme tarafında: nereye genişleneceğinin gerçek sinyali.
 *
 * Hesap istemez — düğme müşterinin vazgeçmeye en yakın olduğu anda duruyor.
 */
interface ZoneNoticeDialogProps {
  locale: Locale;
  postalCode: string;
  onClose: () => void;
}

export function ZoneNoticeDialog({ locale, postalCode, onClose }: ZoneNoticeDialogProps) {
  const t = messages[locale];
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { error: failure } = await recordZoneNoticeAction(postalCode, email);
    setBusy(false);
    if (failure) {
      setError(failure);
      return;
    }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/40 px-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.noticeTitle}
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-[420px] flex-col gap-3 rounded-card bg-card px-6 py-5.5"
      >
        <div className="flex items-start justify-between gap-3">
          <span className="font-serif text-card-title-sm text-ink">{t.noticeTitle}</span>
          <button type="button" onClick={onClose} aria-label={t.close} className="cursor-pointer font-sans text-note text-muted hover:text-ink">
            ✕
          </button>
        </div>

        {done ? (
          <p className="rounded-soft bg-olive-bg px-4 py-3 font-sans text-note leading-relaxed text-olive-dark">
            {t.noticeDone.replace('{code}', postalCode)}
          </p>
        ) : (
          <>
            <p className="font-sans text-note leading-relaxed text-body">{t.noticeBody.replace('{code}', postalCode)}</p>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
              placeholder={t.noticeEmail}
              aria-label={t.noticeEmail}
              className="rounded-pill border-[1.5px] border-sand-300 bg-card px-4 py-2.5 font-sans text-body-sm text-ink outline-none focus:border-olive"
            />
            {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}
            <Button size="sm" fullWidth onClick={() => void submit()} disabled={busy}>
              {t.noticeSubmit}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
