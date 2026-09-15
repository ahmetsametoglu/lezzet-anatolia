'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, type TicketHandler, type TicketStatus } from '@lezzet/types';
import { AiDraftCard, handlerOptions } from '@/components/operation/ui/ai-handling';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import {
  ContextIdentity,
  ContextOrders,
  ContextPane,
} from '@/components/operation/ui/customer-context-pane';
import { CustomerChannels } from '@/components/operation/ui/customer-channels';
import type { MessengerContext } from '@/components/operation/ui/customer-channel-model';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { bubbleClass, MessageRow, SectionLabel } from '@/components/operation/ui/message-thread';
import { EDGE_CLASS, QueueRow as SharedQueueRow } from '@/components/operation/ui/queue-pane';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { ChatText } from '@/components/text/chat-text';
import { Textarea } from '@/components/operation/form/input';
import { MultiToggle, type MultiToggleOption } from '@/components/operation/form/multi-toggle';
import { CONTROL_H } from '@/components/operation/ui/control';
import { CameraIcon, SearchOffIcon, WhatsAppIcon } from '@/components/operation/ui/icons';
import { agoLabel, agoShort, money, shortDateTime } from '@/components/operation/ui/format';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { CustomerContextData } from '@/lib/customer/context';
import type { TicketMessageView } from '@/lib/ticket/ticket-types';
// Başka ekranların URL sözleşmesi: adres elle kurulmaz, sahibinden alınır.
import { customersUrl } from '../customers/customers-url';
import { ORDERS_PATH } from '../orders/orders-url';
import { socialLink } from '../social/social-url';
import {
  RETURN_BLOCKED_REASON,
  TICKET_SENDER_LABELS,
  TICKET_SENDER_TONE,
  TICKET_SOURCE_LABELS,
  TICKET_STATUS_TONE,
  TICKET_TYPE_TONE,
} from './tickets-labels';
import type { TicketDetailView, TicketRowView } from './tickets-types';

interface QueueRowProps {
  row: TicketRowView;
  active: boolean;
  onSelect: (id: string) => void;
}

/**
 * Çizimde olmayan iki işaret bilerek eklendi: "Cevap bekliyor" (kuyruğun tek amacı cevap bekleyeni bekletmemek) ve kamera (bozuk
 * ürün kararı çoğu kez fotoğraftan verilir).
 */
export function QueueRow({ row, active, onSelect }: QueueRowProps) {
  const tone = TICKET_TYPE_TONE[row.type];
  return (
    <SharedQueueRow
      id={row.id}
      active={active}
      onSelect={onSelect}
      // Sol kenar türün rengi: tarama sırasında hangi satırın para işi olduğu okunmadan görünsün.
      edgeClass={EDGE_CLASS[tone]}
      title={row.customerName}
      trailing={<Badge tone={tone}>{TICKET_TYPE_LABELS[row.type]}</Badge>}
      preview={row.preview || 'Mesaj yok'}
      badges={
        <>
          <Badge tone={TICKET_STATUS_TONE[row.status]}>{TICKET_STATUS_LABELS[row.status]}</Badge>
          {row.awaitingReply ? (
            <Badge tone="amber" dot>
              Cevap bekliyor
            </Badge>
          ) : null}
          {row.handledBy === 'ai' ? <Badge tone="violet">AI yürütüyor</Badge> : null}
          {/* Hibrit satır işaretlenir: bekleyen taslak ancak talep açılınca görünür. */}
          {row.handledBy === 'hybrid' ? <Badge tone="violet">Hibrit</Badge> : null}
          {/* Fotoğraf işareti yalnız ikon: kuyrukta okunacak şey kim, ne tipte, ne durumda, ne kadar bekledi; sipariş bağı detayda. */}
          {row.hasAttachment ? (
            <span className="text-ops-faint" title="Fotoğraf var">
              <CameraIcon size={13} />
            </span>
          ) : null}
          {/* Yaş kısa biçimde: "önce" eki bu sütunda bilgi taşımaz ama genişlik yer ve satırı ikiye bölerdi. */}
          <span className="ml-auto flex-none font-ops-mono text-ops-micro text-ops-faint">{agoShort(row.ageMinutes)}</span>
        </>
      }
    />
  );
}

/** "Hiç talep yok" ile "bu süzgeçte yok" ayrı cümlelerdir. */
export function QueueEmpty({ filtered }: { filtered: boolean }) {
  return (
    <EmptyState
      icon={<SearchOffIcon />}
      title={filtered ? 'Bu süzgeçte talep yok' : 'Kuyruk boş'}
      description={
        filtered
          ? 'Başka bir çip deneyin — talep başka bir durumda ya da siparişsiz olabilir.'
          : 'Bekleyen talep yok. Yeni bir talep düştüğünde burada görünür.'
      }
    />
  );
}

interface TicketDetailProps {
  detail: TicketDetailView;
  busy: boolean;
  error: string | null;
  onStatus: (to: TicketStatus) => void;
  onReply: (body: string) => Promise<boolean>;
  onMode: (mode: TicketHandler) => void;
  /** `send=true` olduğu gibi gönderir, `send=false` metni döndürür ve kutuya taşınır. */
  onConsumeDraft: (send: boolean) => Promise<string | null>;
  onSuggestDraft: () => void;
  onTakeOver: () => void;
  onTriggerReturn: () => void;
}

export function TicketDetail({ detail, busy, error, onStatus, onReply, onMode, onConsumeDraft, onSuggestDraft, onTakeOver, onTriggerReturn }: TicketDetailProps) {
  const { ticket, customer, order, messages, returnOutcome, returnTrigger } = detail;
  // İlk mesaj müşterinin anlatımıdır (ayrı `description` alanı yok): aynı kayıt, iki okuma işi, şikâyetin kendisi ve konuşmanın seyri.
  const [first, ...rest] = messages;
  // Nesne kimliği tetikleyicidir: aynı taslak iki kez taşınabilmeli, düz string ikinciyi yutardı.
  const [prefill, setPrefill] = useState<{ text: string } | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ops-subtle">
      <div className="flex items-start gap-3 border-b border-ops-line px-5 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            {/* Müşteri ekranının detay rotası yok, köprü aramadır; terim en ayırt edici kimlikten seçilir (e-posta → telefon → ad),
                çünkü aynı adlı iki müşteri ad aramasında birlikte gelirdi. */}
            <Link
              href={customersUrl({ q: customer.email ?? customer.phone ?? customer.name, type: 'all', scope: 'all', mc: 'any' })}
              // `lead`, `section` değil: detay künyesi bir kart adıdır, sayfa başlığıyla aynı ağırlıkta görünmemeli.
              className="min-w-0 truncate font-ops-display text-ops-lead font-semibold text-ops-ink hover:text-ops-olive"
            >
              {customer.name}
            </Link>
            <Badge tone={TICKET_TYPE_TONE[ticket.type]}>{TICKET_TYPE_LABELS[ticket.type]}</Badge>
          </span>

          {/* Müşteri geçmişi ve iadenin sonucu ayrı blokta değil künyede: karar verirken okunacaklar. */}
          <span className="font-ops-body text-ops-xs leading-[1.6] text-ops-muted">
            {TICKET_SOURCE_LABELS[ticket.source]} · açıldı {agoLabel(detail.openedAgoMinutes)} ·{' '}
            {customer.totalTickets > 1 ? `${customer.totalTickets}. talebi` : 'ilk talebi'}
            {returnOutcome ? (
              <>
                {' · '}
                <span className="font-semibold text-ops-red">
                  iade tetiklendi{returnOutcome.refundedCents > 0 ? ` · ${money(returnOutcome.refundedCents)} iade edildi` : ' · henüz ödenmedi'}
                </span>
              </>
            ) : null}
          </span>

          {ticket.conversationId ? (
            <Link
              href={socialLink(ticket.conversationId)}
              className="flex cursor-pointer items-center gap-1.5 font-ops-body text-ops-micro text-ops-olive hover:underline"
            >
              <WhatsAppIcon size={12} /> Bağlı konuşmayı aç →
            </Link>
          ) : null}
        </div>

        {/* İki anahtar üst üste: durum "iş nerede", mod "cevabı kim yazıyor"; ikisi de talebin künyesidir ve karar yeri başlıktır. */}
        <div className="flex flex-none flex-col items-end gap-1.5">
          <MultiToggle
            size="sm"
            label="Talep durumu"
            value={ticket.status}
            options={statusOptions(ticket.status, detail.allowedTransitions, busy)}
            onChange={onStatus}
          />
          <MultiToggle
            size="sm"
            label="Yürütücü modu"
            value={ticket.handledBy}
            options={handlerOptions(busy)}
            onChange={onMode}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
        {order ? <OrderCard order={order} /> : null}

        {first ? (
          <section className="flex flex-col gap-2">
            <SectionLabel>Müşterinin anlatımı</SectionLabel>
            {/* Anlatım ekranın en dikkatli okunan yeri ve iade kararının dayanağı: metin balonla aynı kademede, çeviri rozeti burada en gerekli. */}
            <TranslatedBody
              message={first}
              className="rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3 font-ops-body text-ops-base leading-relaxed text-ops-strong"
            />
            <Attachments urls={first.attachmentUrls} />
          </section>
        ) : null}

        {rest.length > 0 ? (
          <section className="flex flex-col gap-2">
            <SectionLabel>Yazışma</SectionLabel>
            {rest.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </section>
        ) : null}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-ops-line px-5 py-3.5">
        {/* AI şeridi yalnız AI özerk yürütürken; Devral insana geçer ve bekleyen taslağı düşürür (`takeOverTicket`). */}
        {ticket.handledBy === 'ai' ? (
          <div className="flex items-center gap-2.5 rounded-ops-card border border-ops-violet-line bg-ops-violet-bg px-3 py-2.5">
            <span className="flex-1 font-ops-body text-ops-xs leading-[1.6] text-ops-violet">
              Bu talebi şu an AI ajanı yürütüyor. Devralırsanız AI susturulur, sonraki cevaplar sizden gider.
            </span>
            {/* Dolu mor: bu düğme kararın kendisi (AI susar), ikincil bir seçenek değil. */}
            <Button size="sm" variant="violet" onClick={onTakeOver} disabled={busy}>
              Devral
            </Button>
          </div>
        ) : null}

        {/* Kesikli çerçeve taslak olduğunu şeklinden söyler, mor makine konuştu demektir. Taslak yoksa boş kart değil cümle: boş kart
            bekleyen bir cevap varmış gibi okunurdu. */}
        {ticket.handledBy === 'hybrid' ? (
          ticket.aiDraftReply ? (
            <AiDraftCard draft={ticket.aiDraftReply}>
              {/* İki çıkış da taslağı tüketir: çevirmek olduğu gibi gönderir, düzenlemek metni kutuya taşır. */}
              <Button size="sm" variant="violet" disabled={busy} onClick={() => void onConsumeDraft(true)}>
                Cevaba çevir →
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => {
                  void onConsumeDraft(false).then((draft) => {
                    if (draft) setPrefill({ text: draft });
                  });
                }}
              >
                Düzenleyerek gönder
              </Button>
            </AiDraftCard>
          ) : (
            // Cron beş dakikada bir üretir; operatör şimdi istiyorsa beklemez.
            <div className="flex items-center gap-2.5">
              <Button size="sm" variant="violet" onClick={onSuggestDraft} disabled={busy}>
                ✦ Taslak öner
              </Button>
              <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
                Hibrit mod — AI taslağı yok; düğmeyle şimdi üretin ya da turu bekleyin (5 dk'da bir).
              </span>
            </div>
          )
        ) : null}

        {error ? (
          <p role="alert" className="font-ops-body text-ops-xs font-semibold text-ops-red">
            {error}
          </p>
        ) : null}

        {/* Kapalı düğmenin sebebi yazılır, gizlenmez; satırın üstünde, çünkü çizim üç kontrolü tek satırda tutar. */}
        {!returnTrigger.allowed ? (
          <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{RETURN_BLOCKED_REASON[returnTrigger.reason]}</span>
        ) : null}

        <ReplyBar
          busy={busy}
          returnAllowed={returnTrigger.allowed}
          returnReason={returnTrigger.allowed ? undefined : RETURN_BLOCKED_REASON[returnTrigger.reason]}
          prefill={prefill}
          onReply={onReply}
          onTriggerReturn={onTriggerReturn}
        />
      </div>
    </div>
  );
}

export function DetailPlaceholder() {
  return (
    <div className="flex h-full items-center justify-center bg-ops-subtle">
      <EmptyState
        title="Talep seçilmedi"
        description="Soldaki kuyruktan bir talebe dokunun — yazışma, sipariş bağı ve iade köprüsü burada açılır."
      />
    </div>
  );
}

/**
 * İzinsiz geçiş devre dışı, gizli değil: gizlemek kontrolün genişliğini talebe göre oynatır, kapalı ama görünür seçenek kuralı da
 * öğretir. Ton verilmez: durum tonu varsayılan "Açık"ta hapı sürekli amber doldurur ve nötr kontrol uyarı veriyormuş gibi durur.
 */
function statusOptions(status: TicketStatus, allowed: readonly TicketStatus[], busy: boolean): MultiToggleOption<TicketStatus>[] {
  return (Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((key) => ({
    key,
    label: TICKET_STATUS_LABELS[key],
    disabled: busy || (key !== status && !allowed.includes(key)),
  }));
}

/** Müşterinin işaretlediği kalemler şikâyetin somut zeminidir. */
function OrderCard({ order }: { order: NonNullable<TicketDetailView['order']> }) {
  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        {/* Kart başlığı içerikten büyük değil: asıl okunacak şey kalem satırları. */}
        <span className="font-ops-display text-ops-xs font-semibold text-ops-ink">
          Bağlı sipariş {order.referenceNo ?? `#${order.id.slice(0, 8)}`}
        </span>
        <Link href={`${ORDERS_PATH}/${order.id}`} className="flex-none font-ops-display text-ops-xs font-semibold text-ops-olive hover:text-ops-olive-dark">
          Siparişi aç →
        </Link>
      </div>
      {order.markedItems.length > 0 ? (
        <ul className="flex flex-col">
          {order.markedItems.map((item) => (
            <li key={item.id} className="flex items-center gap-2 border-t border-ops-line-soft py-1.5">
              <span className="grid h-4 w-4 flex-none place-items-center rounded-[4px] bg-ops-red-bg font-ops-display text-ops-micro font-bold text-ops-red">
                !
              </span>
              <span className="min-w-0 flex-1 truncate font-ops-body text-ops-sm text-ops-body">{item.name}</span>
              <span className="flex-none font-ops-mono text-ops-xs text-ops-muted">{item.qty} ad.</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="font-ops-body text-ops-micro text-ops-faint">
          Kalem işaretlenmemiş — şikâyet siparişin tamamına dair.
        </span>
      )}
    </div>
  );
}

/** Ayrımı gönderici adının rengi taşır, metin değil: tonlu metin tonlu zeminde en çok okunan yerde kontrastını kaybederdi. */
const SENDER_NAME: Record<OpsTone, string> = {
  olive: 'text-ops-olive-dark',
  violet: 'text-ops-violet',
  neutral: 'text-ops-muted',
  amber: 'text-ops-amber-dark',
  red: 'text-ops-red',
  blue: 'text-ops-blue',
  slate: 'text-ops-slate',
};

/**
 * Çeviri orijinalin yerine geçmez, bir tık uzakta durur: personel müşterinin cümlesini bazen aynen alıntılamak zorunda ve "kutu
 * ezilmişti" ile "kutu hasarlıydı" aynı tazminat kararını vermez.
 */
function TranslatedBody({ message, className, align = 'start' }: { message: TicketMessageView; className: string; align?: 'start' | 'end' }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const translated = message.bodyTranslated;
  const original = translated && showOriginal;

  return (
    <>
      {/* Metin biçimli çizilir: müşteriye giden `*kalın*` vurgusu operatörde de görünmeli. */}
      <ChatText
        className={className}
        // Gösterilen metin orijinalse dili söylenir: tarayıcı çevirisi Fransızca cümleyi Türkçe sanmasın.
        lang={original ? (message.language ?? undefined) : undefined}
        text={original ? message.originalBody : message.body}
      />
      {translated ? (
        <span className={`flex items-center gap-2 ${align === 'end' ? 'self-end' : ''}`}>
          {/* Mor, makine konuştu demektir: personelin okuduğu cümle müşterinin kendi cümlesi değil. */}
          <Badge tone="violet">otomatik çevrildi</Badge>
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="cursor-pointer font-ops-body text-ops-micro font-semibold text-ops-olive-dark underline-offset-2 hover:underline"
          >
            {showOriginal ? 'Çeviriyi göster' : 'Orijinali göster'}
          </button>
        </span>
      ) : null}
    </>
  );
}

/** Müşteri solda, operasyon ve AI sağda; AI ayrı tonda, çünkü "bunu kim söyledi" sonradan da cevaplanabilmeli. */
function MessageBubble({ message }: { message: TicketMessageView }) {
  const mine = message.sender !== 'customer';
  const tone = TICKET_SENDER_TONE[message.sender];
  return (
    <MessageRow
      side={mine ? 'out' : 'in'}
      meta={
        <span className={`flex items-center gap-1.5 font-ops-display text-ops-micro font-semibold ${SENDER_NAME[tone]}`}>
          {TICKET_SENDER_LABELS[message.sender]}
          <span className="font-ops-mono font-normal text-ops-faint">{shortDateTime(message.createdAt)}</span>
        </span>
      }
    >
      <TranslatedBody message={message} align={mine ? 'end' : 'start'} className={bubbleClass(tone)} />
      <Attachments urls={message.attachmentUrls} align={mine ? 'end' : 'start'} />
    </MessageRow>
  );
}

/** Ekler her mesajda olabilir, yalnız ilkinde değil. Yeni sekmede açılır: karar çoğu kez fotoğraftan verilir ve küçük kutu yetmez. */
function Attachments({ urls, align = 'start' }: { urls: readonly string[]; align?: 'start' | 'end' }) {
  if (urls.length === 0) return null;
  const size = 72;
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'end' ? 'justify-end' : ''}`}>
      {urls.map((url, i) => (
        <a key={url} href={url} target="_blank" rel="noreferrer" className="cursor-pointer transition-opacity hover:opacity-80">
          <Thumbnail src={url} alt={`Ek ${i + 1}`} size={size} />
        </a>
      ))}
    </div>
  );
}

interface ReplyBarProps {
  busy: boolean;
  returnAllowed: boolean;
  returnReason?: string;
  /** Nesne kimliği değişince kutuya yazılır. */
  prefill?: { text: string } | null;
  onReply: (body: string) => Promise<boolean>;
  onTriggerReturn: () => void;
}

/**
 * Kutu, "İade tetikle" ve "Gönder" tek satırda: operatör cevabı yazarken "bu para işi mi" kararını da verir. Gönderilemeyen metin
 * silinmez: yazılan üç paragraf bir hata mesajı uğruna kaybolmamalı.
 */
function ReplyBar({ busy, returnAllowed, returnReason, prefill, onReply, onTriggerReturn }: ReplyBarProps) {
  const [body, setBody] = useState('');
  const empty = body.trim().length === 0;

  // Taslağı operatör kendisi taşıdı; basılan düğme "bu metinle çalışacağım" demek, kutudakini ezmesi bu yüzden kabul.
  useEffect(() => {
    if (prefill) setBody(prefill.text);
  }, [prefill]);

  const send = () => {
    if (empty || busy) return;
    void onReply(body).then((ok) => {
      if (ok) setBody('');
    });
  };

  // Kutu tek satır yüksekliğinde ve düğmelerle aynı boyda; `Textarea`, çünkü cevap paragraf uzunluğunda yazılır ve taşınca kendi içinde kayar.
  const box = (
    <Textarea
      value={body}
      onChange={(e) => setBody(e.target.value)}
      rows={1}
      placeholder="Müşteriye cevap yaz… (aynen müşteriye görünür)"
      disabled={busy}
      aria-label="Müşteriye cevap"
      className={`flex-1 ${CONTROL_H.md} py-[7px]`}
    />
  );

  const iade = (
    <Button size="md" variant="danger" onClick={onTriggerReturn} disabled={busy || !returnAllowed} title={returnReason}>
      İade tetikle
    </Button>
  );
  const gonder = (
    <Button size="md" variant="primary" onClick={send} disabled={busy || empty}>
      {busy ? 'Gönderiliyor…' : 'Gönder'}
    </Button>
  );

  return (
    <div className="flex items-center gap-2.5">
      {box}
      {iade}
      {gonder}
    </div>
  );
}

interface TicketContextPaneProps {
  context: CustomerContextData | null;
  customerName: string;
  chat: MessengerContext;
}

/** Talebin kendi siparişi burada değil gövdedeki `OrderCard`'dadır: buradaki liste müşterinin öteki alışverişleri, ayrı bir soru. */
export function TicketContextPane({ context, customerName, chat }: TicketContextPaneProps) {
  if (!context) {
    return (
      <ContextPane>
        <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{customerName}</span>
        {/* Bağlam okunamadıysa söylenir: boş pano "siparişi yok" diye okunur ve iade kararı ona dayanabilirdi. */}
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">Sipariş geçmişi okunamadı.</span>
      </ContextPane>
    );
  }

  return (
    <ContextPane>
      {/* Ad müşteri ekranına en ayırt edici anahtarla gider: aynı adlı iki müşteri ad aramasında birlikte gelirdi. */}
      <ContextIdentity
        context={context}
        href={customersUrl({ q: context.email ?? context.phone ?? context.name, type: 'all', scope: 'all', mc: 'any' })}
      />
      {/* Talebin cevabı talep akışında kalır; kanal düğmesi müşteriye en son yazdığı yerden ulaşmak içindir. */}
      <CustomerChannels customerId={context.customerId} context={chat} />
      <ContextOrders context={context} />
    </ContextPane>
  );
}
