'use client';

import { useRef, useState } from 'react';
import { MAX_ATTACHMENTS_PER_MESSAGE, asksForItems } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import supportMessages from '@lezzet/i18n/customer/support';
import { TicketTypeEnum, type TicketType } from '@lezzet/types';
import { Chip } from '@/components/customer/phone-kit/chip';
import { Note } from '@/components/customer/phone-kit/note';
import { PhoneSkeleton } from '@/components/customer/phone-kit/phone-skeleton';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { SecondaryButton } from '@/components/customer/phone-kit/secondary-button';
import { TextAction } from '@/components/customer/phone-kit/text-action';
import { FormTextareaField } from '@/components/customer/form/form-textarea-field';
import { Dialog } from '@/components/customer/ui/dialog';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import { useToast } from '@/components/customer/ui/toast';
import { useRouter } from '@/i18n/navigation';
import { errorText } from '@/lib/customer-error-text';
import type { CustomerOrderDetail, CustomerOrderSummary } from '@/lib/order/customer-orders';
import { formatOrderDate } from '@/lib/storefront/format';
import { openTicketAction, ticketOrderAction } from '../actions';
import type { Messages } from '../support-types';
import { useTicketPhoto } from '../use-ticket-photo.hook';
import { PhotoThumb } from './photo-thumb';

/**
 * Yeni talep çekmecesi, native çekmecenin ikizi: kapsam → sipariş → önce konu, sonra yalnız ürüne dair konuda kalemler, anlatım ve
 * fotoğraf. Ret çekmeceyi kapatmaz, çünkü kapanan çekmece "gitti" der ve yazılanı götürür; başarıda yazışma açılır.
 */
interface PhoneNewTicketSheetProps {
  t: Messages;
  locale: Locale;
  /** Siparişten gelindiyse o siparişin künyesi ve kalemleri; akış doğrudan forma açılır. */
  order: CustomerOrderDetail | null;
  /** Kapsam sorusunun ve seçicinin siparişleri; boşsa soru sorulmaz. */
  orders: readonly CustomerOrderSummary[];
  onClose: () => void;
}

type Step = 'scope' | 'order' | 'form';

/** Seçilen siparişin kalemleri çekmecede okunur; künye (numara) seçicinin satırından hemen bellidir. */
type Lines = { status: 'loading' | 'error' } | { status: 'ready'; detail: CustomerOrderDetail };

export function PhoneNewTicketSheet({ t, locale, order, orders, onClose }: PhoneNewTicketSheetProps) {
  const copy = supportMessages[locale];
  const router = useRouter();
  const toast = useToast();
  const [step, setStep] = useState<Step>(order ? 'form' : orders.length > 0 ? 'scope' : 'form');
  const [picked, setPicked] = useState<{ id: string; referenceNo: string | null } | null>(order);
  const [lines, setLines] = useState<Lines | null>(order ? { status: 'ready', detail: order } : null);
  const [type, setType] = useState<TicketType | null>(null);
  const [marked, setMarked] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [showBodyError, setShowBodyError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const photo = useTicketPhoto({ ticketId: null, busy, onFailed: (key) => setError(errorText(t.errors, key)) });

  const loadLines = (orderId: string) => {
    setLines({ status: 'loading' });
    void ticketOrderAction(locale, orderId).then(({ data }) => setLines(data ? { status: 'ready', detail: data } : { status: 'error' }));
  };

  const pickOrder = (row: CustomerOrderSummary) => {
    setPicked({ id: row.id, referenceNo: row.referenceNo });
    setMarked([]);
    setStep('form');
    loadLines(row.id);
  };

  const goGeneral = () => {
    setPicked(null);
    setLines(null);
    setMarked([]);
    setStep('form');
  };

  const pickType = (option: TicketType) => {
    setType(option);
    // Ürünle ilgisi olmayan konuya geçilince işaretler düşer: görünmeyen bir seçim talebe girip operatörü yanıltmasın.
    if (!asksForItems(option)) setMarked([]);
  };

  // Siparişten gelinen akışın geri adımı yok, çünkü kapsam zaten belli; sorulmamış kapsam adımına da dönülmez.
  const backStep: Step | null =
    order !== null || step === 'scope'
      ? null
      : step === 'order'
        ? 'scope'
        : picked === null
          ? orders.length > 0
            ? 'scope'
            : null
          : 'order';

  const submit = () => {
    if (busy || photo.pending > 0) return;
    // Anlatım zorunlu: sözleşme boş gövdeyi reddeder ve müşteri adına cümle uydurmak operatöre bir şey anlatmazdı.
    if (body.trim().length === 0) {
      setShowBodyError(true);
      return;
    }
    setBusy(true);
    setError(null);
    const detail = lines?.status === 'ready' ? lines.detail : null;
    void openTicketAction({
      // Siparişsiz talepte konu sorulmaz ve `other` gider, çünkü "Soru" bizim yapmadığımız bir iddiadır.
      type: picked === null ? 'other' : (type ?? 'other'),
      body,
      orderId: picked?.id ?? null,
      // Paket satırı arkasında birden çok kalem taşır ve şikâyet paketin bütününe yazılır.
      orderItemIds: (detail?.lines ?? []).filter((line) => marked.includes(line.id)).flatMap((line) => line.orderItemIds),
      attachments: photo.attachments,
    })
      .then(({ data, errorKey }) => {
        if (errorKey || !data) {
          setError(errorText(t.errors, errorKey));
          return;
        }
        toast(copy.new.sentToast);
        // Yazışma hemen açılır: müşteri yazdığını orada görür ve ilk cevap da oraya düşer.
        router.replace({ pathname: '/support/[ticket]', params: { ticket: data.ticketId } });
      })
      .finally(() => setBusy(false));
  };

  const question = 'font-serif text-card-title-sm font-semibold text-ink';

  return (
    <Dialog placement="sheet" title={copy.new.title} closeLabel={t.new.close} onClose={onClose}>
      {backStep !== null && (
        <div className="flex">
          <TextAction label={copy.back} onClick={() => setStep(backStep)} />
        </div>
      )}

      {step === 'scope' && (
        <>
          <h3 className={question}>{copy.new.scope.question}</h3>
          <p className="font-sans text-note leading-[1.6] text-body">{copy.new.scope.body}</p>
          {/* Native çekmecenin ana eylemi tam genişlik, sert gölgeli bloktur; web kitinin varsayılan hapı değil. */}
          <PrimaryButton label={copy.new.scope.yes} shape="block" onClick={() => setStep('order')} />
          <SecondaryButton label={copy.new.scope.no} onClick={goGeneral} />
        </>
      )}

      {step === 'order' && (
        <>
          <h3 className={question}>{copy.new.order.question}</h3>
          {orders.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => pickOrder(row)}
              aria-label={copy.new.order.pick.replace('{reference}', row.referenceNo ?? '')}
              className="flex cursor-pointer items-center justify-between rounded-card bg-sand-250 px-4 py-3.5 transition-opacity hover:opacity-80"
            >
              <span className="font-sans text-note font-bold text-ink">{row.referenceNo}</span>
              <span className="font-sans text-helper text-muted">{formatOrderDate(row.createdAt, locale, true)}</span>
            </button>
          ))}
        </>
      )}

      {step === 'form' && (
        <>
          {/* Önce konu, sonra ürün: ürün sorusu yalnız belli bir kaleme dair konuda anlamlı, öteki konularda hiç sorulmaz. */}
          {picked !== null && (
            <>
              <span className="font-sans text-note font-semibold text-muted">
                {copy.new.items.eyebrow.replace('{reference}', picked.referenceNo ?? '')}
              </span>
              <h3 className={question}>{copy.new.typeTitle}</h3>
              <div className="flex flex-wrap gap-2">
                {TicketTypeEnum.options.map((option) => (
                  <Chip key={option} label={copy.type[option]} selected={type === option} onClick={() => pickType(option)} />
                ))}
              </div>

              {asksForItems(type) && (
                <>
                  <h3 className={question}>{copy.new.items.question}</h3>
                  {lines?.status === 'loading' &&
                    [0, 1, 2].map((slot) => <PhoneSkeleton key={slot} radius="control" className="h-12 w-full" />)}
                  {lines?.status === 'error' && (
                    <>
                      <Note description={copy.new.items.error} tone="terracotta" />
                      <div className="flex">
                        <TextAction label={copy.error.retry} tone="terracotta" onClick={() => loadLines(picked.id)} />
                      </div>
                    </>
                  )}
                  {lines?.status === 'ready' &&
                    lines.detail.lines.map((line) => {
                      const selected = marked.includes(line.id);
                      return (
                        <button
                          key={line.id}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => setMarked((prev) => (selected ? prev.filter((id) => id !== line.id) : [...prev, line.id]))}
                          className={[
                            'flex cursor-pointer items-center justify-between gap-2 rounded-control border-[1.5px] px-4 py-3 text-left transition-colors',
                            selected ? 'border-ink bg-sand-150' : 'border-sand-400 hover:border-ink',
                          ].join(' ')}
                        >
                          <span className="flex-1 font-sans text-note font-semibold text-ink">
                            {copy.new.items.line.replace('{quantity}', String(line.qty)).replace('{name}', line.name)}
                          </span>
                          {selected && <MobileIcon name="check-wide" size={17} className="text-olive-dark" />}
                        </button>
                      );
                    })}
                </>
              )}
            </>
          )}

          <h3 className={question}>{copy.new.message.title}</h3>
          <FormTextareaField
            label={copy.new.message.label}
            hideLabel
            placeholder={copy.new.message.placeholder}
            rows={4}
            value={body}
            disabled={busy}
            error={showBodyError ? copy.new.message.error : undefined}
            onChange={(event) => {
              setBody(event.target.value);
              // Yazmaya başlayınca eski ret düşer: kapanmış bir kapının uyarısı ekranda durmaz.
              if (showBodyError) setShowBodyError(false);
            }}
          />

          {/* Önce eklenenler, sonra iki kaynak: kamera o an çekmek için, galeri önceden çekilmiş fotoğraf için. */}
          {photo.photos.length + photo.pending > 0 && (
            <div className="flex flex-wrap gap-2">
              {photo.photos.map((item) => (
                <PhotoThumb
                  key={item.key}
                  size="lg"
                  preview={item.preview}
                  label={copy.detail.photo}
                  removeLabel={copy.new.photo.remove}
                  onRemove={() => photo.remove(item.key)}
                />
              ))}
              {Array.from({ length: photo.pending }, (_, index) => (
                <PhotoThumb
                  key={`pending-${index}`}
                  size="lg"
                  preview={null}
                  label={copy.new.photo.uploading}
                  removeLabel={copy.new.photo.remove}
                />
              ))}
            </div>
          )}
          {photo.photos.length > 0 && (
            <p className="font-sans text-body-sm leading-[1.6] text-sand-600">
              {copy.new.photo.count.replace('{count}', String(photo.photos.length)).replace('{max}', String(MAX_ATTACHMENTS_PER_MESSAGE))}
            </p>
          )}
          {/* Tavan dolunca kaynaklar çizilmez; sayaç nedenini zaten söylüyor. */}
          {photo.photos.length + photo.pending < MAX_ATTACHMENTS_PER_MESSAGE && (
            <div className="flex gap-2">
              <input ref={camera} type="file" accept="image/*" capture="environment" onChange={photo.pick} className="hidden" />
              <input ref={library} type="file" accept="image/*" onChange={photo.pick} className="hidden" />
              <button
                type="button"
                disabled={busy}
                onClick={() => camera.current?.click()}
                className="flex-1 cursor-pointer rounded-control border-[1.5px] border-dashed border-sand-500 px-2 py-3 text-center font-sans text-note font-bold text-olive transition-colors hover:border-olive"
              >
                {copy.new.photo.camera}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => library.current?.click()}
                className="flex-1 cursor-pointer rounded-control border-[1.5px] border-dashed border-sand-500 px-2 py-3 text-center font-sans text-note font-bold text-olive transition-colors hover:border-olive"
              >
                {copy.new.photo.library}
              </button>
            </div>
          )}
          <p className="font-sans text-body-sm leading-[1.6] text-sand-600">{copy.new.photo.note}</p>

          {error !== null && <Note description={error} tone="error" />}

          <PrimaryButton
            label={busy ? copy.new.submitting : copy.new.submit}
            shape="block"
            onClick={submit}
            disabled={busy || photo.pending > 0}
          />
        </>
      )}
    </Dialog>
  );
}
