'use client';

import { useRef, useState } from 'react';
import { asksForItems } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import supportMessages from '@lezzet/i18n/customer/support';
import type { TicketType } from '@lezzet/types';
import { Button } from '@/components/customer/ui/button';
import { Icon } from '@/components/customer/ui/icons';
import { FormTextareaField } from '@/components/customer/form/form-textarea-field';
import { Link, useRouter } from '@/i18n/navigation';
import { formatOrderDate } from '@/lib/storefront/format';
import { orderProductNames } from '@/lib/order/order-names';
import type { CustomerOrderDetail, CustomerOrderSummary } from '@/lib/order/customer-orders';
import { errorText } from '@/lib/customer-error-text';
import { openTicketAction } from '../actions';
import { useTicketPhoto } from '../use-ticket-photo.hook';
import type { Messages } from '../support-types';

/**
 * Talep formunun masaüstü sayfası: önce sorun, sonra yalnız ürüne dair sorunda kalemler, çünkü müşteri neyi anlatacağını söylemeden
 * hangi ürünü işaretleyeceğini bilemez. Tip tek seçim, kalem çoklu; paket tek satır olarak işaretlenir ve kalemlerinin tamamı gider.
 */
const TYPES: readonly TicketType[] = ['missing', 'damaged', 'question', 'other'];

interface NewTicketDesktopProps {
  t: Messages;
  locale: Locale;
  /** Siparişten gelindiyse o siparişin künyesi ve kalemleri; genel yolda null. */
  order: CustomerOrderDetail | null;
  /** Genel yolda seçtirilecek siparişler; siparişten gelindiyse boş. */
  orders: readonly CustomerOrderSummary[];
}

export function NewTicketDesktop({ t, locale, order, orders }: NewTicketDesktopProps) {
  const router = useRouter();

  // Siparişten gelindiyse soru sorulmaz — cevap zaten belli. Genel yolda `null` = henüz sorulmadı.
  const [orderBound, setOrderBound] = useState<boolean | null>(order ? true : null);
  const [type, setType] = useState<TicketType | null>(null);
  const [body, setBody] = useState('');
  const [markedLines, setMarkedLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photo = useTicketPhoto({ ticketId: null, busy, onFailed: (key) => setError(errorText(t.errors, key)) });

  const column = 'mx-auto w-[560px] py-8';

  if (orderBound === null) {
    return (
      <div className={`flex flex-col gap-3.5 ${column}`}>
        <span className="font-sans text-body-sm font-bold text-ink">{t.new.orderQuestion}</span>
        <div className="flex gap-2.5">
          <Button variant="outlineOlive" size="sm" fullWidth onClick={() => setOrderBound(true)}>
            {t.new.yes}
          </Button>
          <Button variant="secondary" size="sm" fullWidth onClick={() => setOrderBound(false)}>
            {t.new.no}
          </Button>
        </div>
      </div>
    );
  }

  if (orderBound && !order) {
    return (
      <div className={`flex flex-col gap-2.5 ${column}`}>
        <span className="font-sans text-body-sm font-bold text-ink">{t.new.pickOrder}</span>
        {orders.length === 0 ? (
          <span className="font-sans text-note leading-relaxed text-muted">{t.new.noOrders}</span>
        ) : (
          orders.map((row) => (
            <Link
              key={row.id}
              href={{ pathname: '/support/new', query: { order: row.id } }}
              className="flex cursor-pointer flex-col gap-1 rounded-soft border border-sand-200 bg-card px-3.5 py-3 transition-colors hover:border-olive"
            >
              <span className="font-sans text-note font-bold leading-tight text-ink">{row.referenceNo ?? '—'}</span>
              <span className="font-sans text-micro leading-relaxed text-muted">
                {formatOrderDate(row.createdAt, locale, true)} · {orderProductNames(row).join(', ')}
              </span>
            </Link>
          ))
        )}
      </div>
    );
  }

  // Siparişsiz talepte tip sorulmaz ve `other` gider, çünkü "Soru" bizim yapmadığımız bir iddiadır; sınıflandırmayı personel yapar.
  const effectiveType: TicketType | null = order ? type : 'other';

  const submit = () => {
    if (busy || photo.pending > 0 || !effectiveType || body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    void openTicketAction({
      type: effectiveType,
      body,
      orderId: order?.id ?? null,
      // Satır kimlikleri ekranın, kalem kimlikleri kapının işi: paket satırı arkasında birden çok kalem taşır.
      orderItemIds: (order?.lines ?? []).filter((l) => markedLines.includes(l.id)).flatMap((l) => l.orderItemIds),
      attachments: photo.attachments,
    })
      .then(({ data, errorKey }) => {
        if (errorKey || !data) {
          setError(errorText(t.errors, errorKey));
          return;
        }
        // Yazışma hemen açılır: müşteri yazdığını orada görür ve ilk cevap da oraya düşer.
        router.replace({ pathname: '/support/[ticket]', params: { ticket: data.ticketId } });
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className={`flex flex-col gap-3.5 ${column}`}>
      {order && (
        <section className="flex flex-col gap-2">
          <span className="font-sans text-body-sm font-bold text-ink">{t.new.problem}</span>
          <div className="flex flex-wrap gap-2">
            {TYPES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => {
                  setType(value);
                  // Ürünle ilgisi olmayan tipe geçilince işaretler düşer: görünmeyen bir seçim talebe girip operatörü yanıltmasın.
                  if (!asksForItems(value)) setMarkedLines([]);
                }}
                className={[
                  'cursor-pointer rounded-pill px-4 py-2.25 font-sans text-note font-bold transition-colors',
                  value === type ? 'bg-olive text-cream' : 'border-[1.5px] border-sand-400 bg-card text-ink hover:border-olive',
                ].join(' ')}
              >
                {t.type[value]}
              </button>
            ))}
          </div>
        </section>
      )}

      {order && asksForItems(type) && order.lines.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="font-sans text-body-sm font-bold text-ink">{t.new.items}</span>
          {order.lines.map((line) => {
            const marked = markedLines.includes(line.id);
            return (
              <button
                key={line.id}
                type="button"
                onClick={() => setMarkedLines((prev) => (marked ? prev.filter((id) => id !== line.id) : [...prev, line.id]))}
                className={[
                  'flex cursor-pointer items-center gap-2.5 rounded-soft bg-card px-3.5 py-3 text-left transition-colors',
                  marked ? 'border-2 border-olive' : 'border border-sand-200 hover:border-sand-400',
                ].join(' ')}
              >
                <span
                  className={[
                    'grid size-5.5 flex-none place-items-center rounded-[7px] font-sans text-micro font-bold',
                    marked ? 'bg-olive text-cream' : 'border-2 border-sand-400',
                  ].join(' ')}
                  aria-hidden="true"
                >
                  {marked && <Icon name="check" size={12} strokeWidth={2.6} />}
                </span>
                <span className="flex-1 truncate font-sans text-note font-bold leading-tight text-ink">{line.name}</span>
                <span className="flex-none font-sans text-micro text-muted">{line.bundle ? t.new.bundleLabel : `× ${line.qty}`}</span>
              </button>
            );
          })}
        </section>
      )}

      <FormTextareaField
        label={t.new.describe}
        placeholder={t.new.describePlaceholder}
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />

      {/* Fotoğraf yalnız ürüne dair talepte, çünkü amacı somut bir kalemin hâline kanıt; soruda neyin fotoğrafı isteneceği belli değil. */}
      {order && asksForItems(type) && (
        <section className="flex flex-col gap-2">
          <span className="font-sans text-body-sm font-bold text-ink">
            {t.new.photo} <span className="font-normal text-muted">— {t.new.photoHint}</span>
          </span>
          <div className="flex flex-wrap gap-2.5">
            <input ref={fileInput} type="file" accept="image/*" capture="environment" onChange={photo.pick} className="hidden" />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              aria-label={t.new.addPhoto}
              className="grid size-19 cursor-pointer place-items-center rounded-[12px] border-[1.5px] border-dashed border-sand-500 bg-card text-muted transition-colors hover:border-olive"
            >
              <Icon name="camera" size={24} />
            </button>
            {photo.attachments.map((key, index) => (
              <button
                key={key}
                type="button"
                onClick={() => photo.remove(key)}
                aria-label={supportMessages[locale].new.photo.remove}
                className="grid size-19 cursor-pointer place-items-center rounded-[12px] border border-sand-200 bg-cream-deep font-sans text-micro text-muted transition-colors hover:border-terracotta-line"
              >
                <span className="inline-flex items-center gap-1">
                  {`${t.new.photo} ${index + 1}`}
                  <Icon name="close" size={11} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {error && <span className="font-sans text-note text-terracotta-bright">{error}</span>}

      <Button fullWidth disabled={busy || photo.pending > 0 || !effectiveType || body.trim().length === 0} onClick={submit}>
        {busy ? t.new.submitting : t.new.submit}
      </Button>
      <span className="text-center font-sans text-micro leading-relaxed text-muted">{t.new.note}</span>
    </div>
  );
}
