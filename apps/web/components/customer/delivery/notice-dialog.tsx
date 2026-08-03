'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import { Button } from '@/components/customer/ui/button';
import { Dialog } from '@/components/customer/ui/dialog';
import { pillInputClass } from '@/components/customer/form/pill-input';
import { errorText } from '@/lib/customer-error-text';
import type { CustomerResult } from '@/lib/customer-error';
import messages from './restriction-messages.json';

/**
 * "Haber ver" panelleri — e-posta alan küçük kutu. **İki bekleyiş, tek kutu.**
 *
 * İki farklı söz vardır ve karıştırılmaz: `zone_notice` "bölgenize henüz gelmiyoruz",
 * `variant_stock_notice` (19.12) "bölgenize geliyoruz ama BU ÜRÜN burada şu an yok". Metinleri
 * ayrı, kutuları aynı — ikinci bir panel yazmak aynı formu iki yerde bakıma bırakırdı ve biri
 * değişince öteki eskirdi.
 *
 * Metin bir SÖZ vermez: "not alalım", "tek bir e-posta göndeririz — başka bir şey için
 * kullanmayız". Tetikleyici henüz yazılmadı; "haber vereceğiz" demek tutulamayacak bir söz olurdu.
 * Kaydın bugünkü değeri işletme tarafında: nereye genişleneceğinin ve neyin beklendiğinin gerçek
 * sinyali.
 *
 * Hesap İSTEMEZ — düğme müşterinin vazgeçmeye en yakın olduğu anda duruyor; önüne giriş duvarı
 * koymak ikinci bir engel çıkarmak olurdu. Oturum varsa kayıt sunucuda ona bağlanır.
 */
interface NoticeDialogProps {
  locale: Locale;
  title: string;
  /** Neyi not aldığımızı söyleyen cümle — yer verisi çağıranda yerleştirilmiş gelir. */
  body: string;
  /** Kayıt sonrası görünen onay — aynı şekilde yerleştirilmiş. */
  doneText: string;
  /**
   * Kaydı yazan sunucu eylemi; fırlatmaz, hatayı ANAHTAR olarak döndürür (denetim H1/H2 · 03.08).
   *
   * Eskiden dönen şey metindi ve bu kutu onu olduğu gibi basıyordu: Fransız müşteri geçersiz kod
   * yazdığında sunucunun Türkçe cümlesini okuyordu. Cümle artık burada, kutunun kendi sözlüğünde.
   */
  onSubmit: (email: string) => Promise<CustomerResult<true>>;
  onClose: () => void;
}

export function NoticeDialog({ locale, title, body, doneText, onSubmit, onClose }: NoticeDialogProps) {
  const t = messages[locale];
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async () => {
    setBusy(true);
    const { errorKey } = await onSubmit(email);
    setBusy(false);
    if (errorKey) {
      setError(errorText(t.errors, errorKey));
      return;
    }
    setDone(true);
  };

  return (
    <Dialog title={title} closeLabel={t.close} onClose={onClose}>
      {done ? (
        <p className="rounded-soft bg-olive-bg px-4 py-3 font-sans text-note leading-relaxed text-olive-dark">{doneText}</p>
      ) : (
        <>
          <p className="font-sans text-note leading-relaxed text-body">{body}</p>
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
            className={pillInputClass('py-2.5 text-body-sm')}
          />
          {error && <span className="font-sans text-note font-semibold text-terracotta">{error}</span>}
          <Button size="sm" fullWidth onClick={() => void submit()} disabled={busy}>
            {t.noticeSubmit}
          </Button>
        </>
      )}
    </Dialog>
  );
}
