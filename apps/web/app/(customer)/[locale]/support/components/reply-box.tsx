'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { CustomerTicketView } from '@/lib/ticket/ticket-types';
import { errorText } from '@/lib/customer-error-text';
import { Icon } from '@/components/customer/ui/icons';
import { replyToTicketAction } from '../actions';
import { useTicketPhoto } from '../use-ticket-photo.hook';
import type { Messages } from '../support-types';

/**
 * Cevap kutusu, hap biçimli besteci şeridi: form kiti bilerek kullanılmadı, çünkü tek satır içi alan etiket ve doğrulama istemiyor.
 * Fotoğraf imzalı adresle doğrudan depoya gider ve yükleme düşse de mesaj yazılabilir; Enter gönderir, Shift+Enter satır atlar.
 */
interface ReplyBoxProps {
  t: Messages;
  locale: Locale;
  ticketId: string;
  onReplied: (view: CustomerTicketView) => void;
  /** Masaüstünde şerit sağ bölmenin dibine yapışır; mobilde ekranın altında durur. */
  compact?: boolean;
}

export function ReplyBox({ t, locale, ticketId, onReplied, compact = false }: ReplyBoxProps) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Sebep anahtarı hook'tan, cümle burada kurulur: "tür kabul edilmiyor" ile "şu an yükleyemedik" farklı şeyler, ikincisi tekrar
  // denemeye değer.
  const photo = useTicketPhoto({ ticketId, busy, onFailed: (key) => setError(errorText(t.errors, key)) });

  const send = () => {
    if (busy || body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    void replyToTicketAction(locale, ticketId, body, photo.attachments)
      .then(({ data, errorKey }) => {
        if (errorKey || !data) {
          setError(errorText(t.errors, errorKey));
          return;
        }
        // Besteci ancak sunucu kabul ettikten sonra temizlenir: erken temizlemek, düşen bir istekte
        // müşterinin yazdığını yok etmek olurdu.
        setBody('');
        photo.reset();
        onReplied(data);
      })
      .finally(() => setBusy(false));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  const size = compact ? 'size-9.5' : 'size-9';

  return (
    <div className="flex flex-col gap-2">
      {photo.attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photo.attachments.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => photo.remove(key)}
              aria-label={t.reply.removePhoto}
              className="flex cursor-pointer items-center gap-2 rounded-soft border border-sand-200 bg-cream-deep px-3 py-1.5 font-sans text-micro text-muted hover:border-terracotta-line"
            >
              <Icon name="camera" size={14} />
              <Icon name="close" size={12} />
            </button>
          ))}
        </div>
      )}

      {error && <span className="font-sans text-micro text-terracotta-bright">{error}</span>}

      <div className="flex items-center gap-2.5 rounded-[22px] border border-sand-300 bg-card py-2.5 pr-2.5 pl-4.5">
        <textarea
          rows={1}
          value={body}
          disabled={busy}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={busy ? t.reply.sending : t.reply.placeholder}
          className="flex-1 resize-none bg-transparent font-sans text-body-sm leading-relaxed text-ink outline-none placeholder:text-muted"
        />

        {/* Mobilde kamerayı doğrudan açar (tasarım §7: bozuk ürün fotoğrafı o an çekilir). */}
        <input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={photo.pick} className="hidden" />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label={t.reply.photo}
          className="flex cursor-pointer items-center text-muted transition-colors hover:text-olive"
        >
          <Icon name="camera" size={20} />
        </button>

        <button
          type="button"
          onClick={send}
          disabled={busy || body.trim().length === 0}
          aria-label={t.reply.send}
          className={`grid ${size} flex-none cursor-pointer place-items-center rounded-full bg-olive font-sans text-body font-bold text-cream transition-colors hover:bg-olive-dark disabled:cursor-not-allowed disabled:bg-disabled-fill`}
        >
          ↑
        </button>
      </div>
    </div>
  );
}
