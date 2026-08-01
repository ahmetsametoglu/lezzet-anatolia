'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { CustomerTicketView } from '@/lib/ticket/ticket-types';
import { replyToTicketAction, requestTicketPhotoAction } from '../actions';
import type { Messages } from '../support-types';

/**
 * Cevap kutusu — tasarımın hap biçimli besteci şeridi: `[metin] 📷 [↑]`.
 *
 * **Form kiti kullanılmadı ve bu bilinçli bir "son çare"** (`CLAUDE.md §2`): kit etiketli, kenarlıklı
 * ve `react-hook-form` bağlı bir alan kabuğu çiziyor — gerçek formlar için doğru, ama burada tasarım
 * tek bir hapın içine gömülü satır içi bir besteci istiyor. Etiket yok (yer tutucu metnin kendisi),
 * doğrulama yok (boş mesaj zaten gönderilmez), alan tek.
 *
 * ── FOTOĞRAF SUNUCUDAN GEÇMEZ ────────────────────────────────────────────────
 * Sunucudan imzalı bir adres alınır, dosya doğrudan R2'ye yüklenir (`lib/ticket/attachments`).
 * Ekranın elinde yalnız ANAHTAR kalır; mesaj gönderilirken o anahtar iletilir ve kapı anahtarın
 * müşterinin kendi alanından geldiğini doğrular.
 *
 * Yükleme başarısızsa mesaj yine yazılabilir: fotoğraf isteğe bağlıdır ve bir kova yapılandırma
 * sorunu yüzünden müşterinin şikâyetini yazamaması saçma olurdu.
 *
 * ── ENTER GÖNDERİR, SHIFT+ENTER SATIR ATLAR ─────────────────────────────────
 * Yazışma alışkanlığı bu. Mobilde sanal klavye kendi "gönder" tuşunu verir; orada da aynı yol.
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
  const [attachments, setAttachments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const send = () => {
    if (busy || body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    void replyToTicketAction(locale, ticketId, body, attachments)
      .then(({ data, error: failed }) => {
        if (failed || !data) {
          setError(t.reply.failed);
          return;
        }
        // Besteci ancak sunucu kabul ettikten sonra temizlenir: erken temizlemek, düşen bir istekte
        // müşterinin yazdığını yok etmek olurdu.
        setBody('');
        setAttachments([]);
        onReplied(data);
      })
      .finally(() => setBusy(false));
  };

  const onPickPhoto = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Aynı dosya arka arkaya seçilebilsin diye alan hemen sıfırlanır (aynı değer `change` doğurmaz).
    event.target.value = '';
    if (!file || busy) return;

    setError(null);
    void requestTicketPhotoAction(ticketId, file.name, attachments.length)
      .then(async ({ data, error: failed }) => {
        if (failed || !data) throw new Error(failed ?? 'upload');
        const response = await fetch(data.uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': file.type } });
        if (!response.ok) throw new Error('upload');
        setAttachments((prev) => [...prev, data.key]);
      })
      .catch(() => setError(t.reply.photoFailed));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) return;
    event.preventDefault();
    send();
  };

  const size = compact ? 'size-9.5' : 'size-9';

  return (
    <div className="flex flex-col gap-2">
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {attachments.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setAttachments((prev) => prev.filter((k) => k !== key))}
              aria-label={t.reply.removePhoto}
              className="flex cursor-pointer items-center gap-2 rounded-soft border border-sand-200 bg-cream-deep px-3 py-1.5 font-sans text-micro text-muted hover:border-terracotta-line"
            >
              <span aria-hidden="true">📷</span>
              <span aria-hidden="true">✕</span>
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
        <input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={onPickPhoto} className="hidden" />
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          aria-label={t.reply.photo}
          className="cursor-pointer font-sans text-icon-sm text-muted transition-colors hover:text-olive"
        >
          📷
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
