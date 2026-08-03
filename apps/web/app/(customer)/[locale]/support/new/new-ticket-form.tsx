'use client';

import { useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { TicketType } from '@lezzet/types';
import { Button, buttonClass } from '@/components/customer/ui/button';
import { FormTextareaField } from '@/components/customer/form/form-textarea-field';
import { Link, useRouter } from '@/i18n/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { formatOrderDate } from '@/lib/storefront/format';
import type { CustomerOrderDetail, CustomerOrderSummary } from '@/lib/order/customer-orders';
import { errorText } from '@/lib/customer-error-text';
import { openTicketAction } from '../actions';
import { useTicketPhoto } from '../use-ticket-photo.hook';
import type { Messages } from '../support-types';

/**
 * Talep formu — tasarımın "Talep Olustur" akışı, üç sorusu ve iki yolu.
 *
 * **Tip çipi tek seçim, kalem işareti çoklu** (etkileşim sözleşmesi): B2B müşteri çoğu zaman birden
 * çok kalem işaretler, ama sorun tek türdür.
 *
 * **Paket tek satır olarak işaretlenir, kalemlerinin tamamı gider** (`orderItemIds`): müşteri
 * "Bayram Sofrası"ndan şikâyetçidir, onun içindeki üçüncü börekten değil.
 *
 * **Fotoğraf sunucudan geçmez** — imzalı adres alınır, dosya doğrudan R2'ye gider. Talep henüz
 * doğmadığı için anahtar müşterinin TASLAK klasörüne yazılır (`ticketId: null`); `openTicket`
 * yalnız oradan gelen anahtarı kabul eder.
 */
const TYPES: readonly TicketType[] = ['missing', 'damaged', 'question', 'other'];

/**
 * Hangi tipler bir ÜRÜNE dair? Yalnız bunlarda kalem işaretlemek ve fotoğraf istemek anlamlı.
 *
 * "Soru" ve "Diğer" siparişin bütününe ya da bambaşka bir şeye dair olabilir — orada kalem
 * listesi cevaplanacak bir soru değil, atlanacak bir bölümdür. Fotoğraf da öyle: amacı somut bir
 * kalemin hâline dair KANIT (tasarım: "bozuk ürün şikâyetinde çözümü hızlandırır"); soruda neyin
 * fotoğrafının isteneceği belli değildir ve boş duran bir kutu "bir şey eklemem mi gerekiyordu?"
 * diye sordurur.
 */
const ITEM_TYPES: readonly TicketType[] = ['missing', 'damaged'];
const isItemType = (type: TicketType | null): boolean => type !== null && ITEM_TYPES.includes(type);

interface NewTicketFormProps {
  t: Messages;
  locale: Locale;
  device: Device;
  /** Siparişten gelindiyse o siparişin künyesi ve kalemleri; genel yolda null. */
  order: CustomerOrderDetail | null;
  /** Genel yolda seçtirilecek siparişler; siparişten gelindiyse boş. */
  orders: readonly CustomerOrderSummary[];
}

export function NewTicketForm({ t, locale, device, order, orders }: NewTicketFormProps) {
  const router = useRouter();
  const isMobile = useDevice(device) === 'mobile';

  // Siparişten gelindiyse soru sorulmaz — cevap zaten belli. Genel yolda `null` = henüz sorulmadı.
  const [orderBound, setOrderBound] = useState<boolean | null>(order ? true : null);
  const [type, setType] = useState<TicketType | null>(null);
  const [body, setBody] = useState('');
  const [markedLines, setMarkedLines] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTicketId, setSentTicketId] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  // Yükleme akışı ortak hook'ta (denetim M4). `ticketId: null` — talep henüz açılmadı, dosya
  // taslak anahtarına yükleniyor ve kapı onu açılışta gerçek talebe bağlıyor.
  const photo = useTicketPhoto({ ticketId: null, busy, onFailed: (key) => setError(errorText(t.errors, key)) });

  const column = isMobile ? 'px-4 py-4' : 'mx-auto w-[560px] py-8';

  if (sentTicketId) {
    return (
      <div className={`flex flex-col items-center gap-2.5 text-center ${column}`}>
        <span className="text-[32px] leading-none">✓</span>
        <span className="font-serif text-card-title-sm leading-tight font-semibold text-ink">{t.new.sentTitle}</span>
        <span className="font-sans text-note leading-relaxed text-body">{t.new.sentBody}</span>
        <Link
          href={{ pathname: '/support/[ticket]', params: { ticket: sentTicketId } }}
          className={buttonClass({ className: 'mt-1' })}
        >
          {t.new.sentCta}
        </Link>
      </div>
    );
  }

  // ── Genel yolun ilk sorusu ────────────────────────────────────────────────
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

  // ── "Evet" dedi ama sipariş seçmedi: seçtir ───────────────────────────────
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
                {formatOrderDate(row.createdAt, locale, true)} · {row.productNames.join(', ')}
              </span>
            </Link>
          ))
        )}
      </div>
    );
  }

  /**
   * **Siparişsiz talepte tip SORULMAZ.** Dört değerin ikisi (eksik geldi · bozuk/hasarlı) fiziksel
   * olarak bir teslimata bağlıdır ve siparişsiz akışta anlamsızdır; geriye kalan ikisi ("Soru" ·
   * "Diğer") ise bir seçim değildir — hangisi seçilirse seçilsin operatör mesajı okuyacak, yani
   * soru bir dokunuş alıp hiçbir şey vermiyor. Tasarım zaten bunu söylüyordu: *"Hayır" → doğrudan
   * serbest mesaj formu*; aynı formu iki yola birden kullanmak benim fazlalığımdı.
   *
   * Değer `other`, `question` değil: "Soru" içerik hakkında BİZİM yapmadığımız bir iddiadır —
   * gelen mesaj şikâyet, öneri ya da teşekkür olabilir. `other` sormadığımızı dürüstçe söyler ve
   * operasyon kuyruğunda "okunması gereken" olarak durur. Sınıflandırma gerekirse personel yapar
   * (`type` onun tarafında düzenlenebilir); iade bağı zaten yalnız sipariş bağlı tiplerde var
   * (`isReturnBound`).
   */
  const effectiveType: TicketType | null = order ? type : 'other';

  const submit = () => {
    if (busy || !effectiveType || body.trim().length === 0) return;
    setBusy(true);
    setError(null);
    void openTicketAction({
      type: effectiveType,
      body,
      orderId: order?.id ?? null,
      // Satır kimlikleri ekranın işi, kalem kimlikleri kapının: paket satırı arkasında birden çok
      // kalem taşıyor ve şikâyet paketin bütününe yazılıyor.
      orderItemIds: (order?.lines ?? []).filter((l) => markedLines.includes(l.id)).flatMap((l) => l.orderItemIds),
      attachments: photo.attachments,
    })
      .then(({ data, errorKey }) => {
        if (errorKey || !data) {
          setError(errorText(t.errors, errorKey));
          return;
        }
        setSentTicketId(data.ticketId);
        // Liste sunucuda çizili; yeni talep oraya dönüldüğünde görünmeli.
        router.refresh();
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className={`flex flex-col gap-3.5 ${column}`}>
      {/* ── SIRA: ÖNCE SORUN, SONRA ÜRÜN (01.08, kullanıcı kararı) ────────────
          Tasarım kalemleri tipin ÜSTÜNE koyuyordu ve sıra tersti: müşteri neyi anlatacağını
          söylemeden hangi ürünleri işaretleyeceğini bilemez, üstelik kalem listesi soruların
          yarısında (soru · diğer) hiç gerekmiyor. Tip önce sorulunca form kendini kısaltıyor —
          "Soru" seçen müşteri üç bölüm yerine bir bölüm görüyor. */}
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
                // Ürünle ilgisi olmayan bir tipe geçildiğinde işaretler DÜŞER: gizlenen bir bölümün
                // state'i formla birlikte gönderilirse müşteri, ekranda görmediği bir seçimi
                // yapmış olur — "Soru" tipinde üç kaleme bağlanmış bir talep operatörü yanıltır.
                if (!isItemType(value)) setMarkedLines([]);
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

      {order && isItemType(type) && order.lines.length > 0 && (
        <section className="flex flex-col gap-2">
          <span className="font-sans text-body-sm font-bold text-ink">{t.new.items}</span>
          {order.lines.map((line) => {
            const marked = markedLines.includes(line.id);
            return (
              <button
                key={line.id}
                type="button"
                onClick={() =>
                  setMarkedLines((prev) => (marked ? prev.filter((id) => id !== line.id) : [...prev, line.id]))
                }
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
                  {marked ? '✓' : ''}
                </span>
                <span className="flex-1 truncate font-sans text-note font-bold leading-tight text-ink">{line.name}</span>
                <span className="flex-none font-sans text-micro text-muted">
                  {line.bundle ? t.new.bundleLabel : `× ${line.qty}`}
                </span>
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

      {/* **Fotoğraf yalnız ÜRÜNE dair talepte.** Amacı tasarımda yazılı: "bozuk ürün şikâyetinde
          çözümü hızlandırır" — yani kanıt, somut bir kalemin hâline dair. Kalem listesiyle aynı
          koşula bağlı ve aynı sebeple: soruda ya da genel bir mesajda neyin fotoğrafı isteneceği
          belli değildir. Tasarımın genel "bize yaz" karesinde de yok. */}
      {order && isItemType(type) && (
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
            className="grid size-19 cursor-pointer place-items-center rounded-[12px] border-[1.5px] border-dashed border-sand-500 bg-card font-sans text-icon text-muted transition-colors hover:border-olive"
          >
            📷
          </button>
          {photo.attachments.map((key, index) => (
            <button
              key={key}
              type="button"
              onClick={() => photo.remove(key)}
              aria-label={t.reply.removePhoto}
              className="grid size-19 cursor-pointer place-items-center rounded-[12px] border border-sand-200 bg-cream-deep font-sans text-micro text-muted transition-colors hover:border-terracotta-line"
            >
              {`${t.new.photo} ${index + 1} ✕`}
            </button>
          ))}
        </div>
      </section>
      )}

      {error && <span className="font-sans text-note text-terracotta-bright">{error}</span>}

      <Button fullWidth disabled={busy || !effectiveType || body.trim().length === 0} onClick={submit}>
        {busy ? t.new.submitting : t.new.submit}
      </Button>
      <span className="text-center font-sans text-micro leading-relaxed text-muted">{t.new.note}</span>
    </div>
  );
}
