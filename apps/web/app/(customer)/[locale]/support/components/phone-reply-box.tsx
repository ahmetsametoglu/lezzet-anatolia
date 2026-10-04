'use client';

import { useRef, useState } from 'react';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type supportMessages from '@lezzet/i18n/customer/support';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { useToast } from '@/components/customer/ui/toast';
import { errorText } from '@/lib/customer-error-text';
import { useComposerField } from '@/lib/use-composer-field.hook';
import type { CustomerTicketView } from '@/lib/ticket/ticket-types';
import { replyToTicketAction } from '../actions';
import { useTicketPhoto } from '../use-ticket-photo.hook';
import type { Messages } from '../support-types';
import { PhotoThumb } from './photo-thumb';

type SupportCopy = LocalizedCopy<typeof supportMessages>;

/**
 * Talep detayının yazma çubuğu, native'in ikizi: hap alan ve yuvarlak gönder düğmesi. Düşen gönderim taslağı silmez; alan ancak
 * sunucu kabul edince temizlenir.
 */
interface PhoneReplyBoxProps {
  copy: SupportCopy;
  t: Messages;
  locale: Locale;
  ticketId: string;
  onReplied: (view: CustomerTicketView) => void;
}

export function PhoneReplyBox({ copy, t, locale, ticketId, onReplied }: PhoneReplyBoxProps) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const photo = useTicketPhoto({ ticketId, busy, onFailed: (key) => setPhotoError(errorText(t.errors, key)) });
  // Yükleme sürerken Gönder bekler, ki yarım fotoğraf mesaja girmesin.
  const canSend = body.trim().length > 0 && !busy && photo.pending === 0;

  const send = () => {
    if (!canSend) return;
    setBusy(true);
    setFailed(false);
    setPhotoError(null);
    void replyToTicketAction(locale, ticketId, body, photo.attachments)
      .then(({ data, errorKey }) => {
        if (errorKey || !data) {
          setFailed(true);
          return;
        }
        setBody('');
        photo.reset();
        onReplied(data);
        toast(copy.detail.reply.sent);
      })
      .finally(() => setBusy(false));
  };

  // Gönderim yalnız düğmeden: sanal klavyede Shift yok, Enter satır atlar.
  const field = useComposerField(body);

  return (
    <div className="flex flex-none flex-col gap-1.5 border-t border-sand-200 bg-sand-50 px-4.5 py-2.5">
      {/* Hata ipucu satırlarından büyük, çünkü müşteriden bir şey istiyor. */}
      {failed && (
        <p role="alert" className="font-sans text-note text-error">
          {copy.detail.reply.failed}
        </p>
      )}
      {photoError && <p className="font-sans text-note text-error">{photoError}</p>}

      {/* Ek, yeni talep çekmecesindeki gibi küçük resimdir ve köşesindeki düğmeyle kalkar; yolda olan yükleme yerinde bekler. */}
      {photo.photos.length + photo.pending > 0 && (
        <div className="flex flex-wrap gap-2">
          {photo.photos.map((item) => (
            <PhotoThumb
              key={item.key}
              size="sm"
              preview={item.preview}
              label={copy.detail.photo}
              removeLabel={copy.new.photo.remove}
              onRemove={() => photo.remove(item.key)}
            />
          ))}
          {Array.from({ length: photo.pending }, (_, index) => (
            <PhotoThumb
              key={`pending-${index}`}
              size="sm"
              preview={null}
              label={copy.new.photo.uploading}
              removeLabel={copy.new.photo.remove}
            />
          ))}
        </div>
      )}

      {/* Düğmeler dipte: kutu uzayınca gönder düğmesi başparmağın yerinde kalır. */}
      <div className="flex items-end gap-2">
        <textarea
          ref={field.ref}
          rows={1}
          value={body}
          disabled={busy}
          onChange={(event) => setBody(event.target.value)}
          placeholder={copy.detail.reply.placeholder}
          aria-label={copy.detail.reply.label}
          className="max-h-40 min-h-12.5 min-w-0 flex-1 resize-none rounded-pill border-[1.5px] border-sand-400 bg-card px-4 py-3 font-sans text-body-sm leading-relaxed text-ink outline-none transition-colors placeholder:text-muted focus:border-olive disabled:bg-sand-50"
        />
        <input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={photo.pick} className="hidden" />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label={copy.detail.reply.photo}
          className="mb-[3px] grid size-11 flex-none cursor-pointer place-items-center text-muted transition-colors hover:text-olive"
        >
          <MobileIcon name="camera" size={20} />
        </button>
        <button
          type="button"
          onClick={send}
          disabled={!canSend}
          aria-label={busy ? copy.detail.reply.sending : copy.detail.reply.send}
          className="mb-0.5 grid size-11.5 flex-none cursor-pointer place-items-center rounded-full bg-olive text-card transition-colors hover:bg-olive-dark disabled:cursor-not-allowed disabled:bg-disabled-fill"
        >
          <MobileIcon name="navigate" size={18} />
        </button>
      </div>
    </div>
  );
}
