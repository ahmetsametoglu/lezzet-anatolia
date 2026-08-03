'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, type TicketStatus } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { Textarea } from '@/components/operation/form/input';
import { CameraIcon, SearchOffIcon, WhatsAppIcon } from '@/components/operation/ui/icons';
import { agoLabel, money, shortDateTime } from '@/components/operation/ui/format';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { TicketMessageView } from '@/lib/ticket/ticket-types';
// Başka ekranların URL SÖZLEŞMESİ (STACK §7 istisnası): adres elle kurulmaz, sahibinden alınır.
import { customersUrl } from '../customers/customers-url';
import { ORDERS_PATH } from '../orders/orders-url';
import {
  RETURN_BLOCKED_REASON,
  TICKET_SENDER_LABELS,
  TICKET_SENDER_TONE,
  TICKET_SOURCE_LABELS,
  TICKET_STATUS_TONE,
  TICKET_TYPE_TONE,
} from './tickets-labels';
import type { TicketDetailView, TicketRowView } from './tickets-types';

/**
 * Talepler ekranının ORTAK parçaları (16.3) — web ve mobil ikisini de kullanır.
 *
 * Kuyruk satırı ve detay panosu iki yüzeyde de AYNI: telefonda bir talebe bakan operatör ile
 * masaüstünde bakan aynı bilgiyi görmeli, yoksa "telefonda görünmüyordu" diye bir cevapsızlık
 * doğar. Farklı olan yalnız KABUK — masaüstünde iki sütun, telefonda alt tabaka.
 */

// ── Kuyruk satırı ────────────────────────────────────────────────────────────

interface QueueRowProps {
  row: TicketRowView;
  active: boolean;
  onSelect: (id: string) => void;
}

/**
 * Kuyruğun tek satırı. Sol kenar çubuğu TÜRÜN rengidir (çizim): tarama sırasında hangi satırın para
 * işi olduğu okunmadan görünsün.
 *
 * **Çizimde olmayan iki işaret bilerek eklendi ve ikisi de brief'ten geliyor** (`admin-talepler.md
 * §2`): *"cevap bekleyenin bekletilmemesi kuyruğun tek amacıdır"* → `Cevap bekliyor` rozeti, ve
 * fotoğraflı şikâyetin ayırt edilmesi (*"bozuk ürün kararı çoğu kez fotoğraftan verilir"*) → kamera
 * işareti. İkisinin de verisi görünümde hazır (`awaiting_reply`, `has_attachment`) ve çizim onları
 * kullanmıyordu; sapma `design/BACKLOG.md`'de kayıtlı.
 */
/**
 * Seçili satırın sol kenar rengi. Sınıf adı ÜRETİLMEZ (`border-l-ops-${tone}`), sabit sözlükten
 * gelir: Tailwind sınıfları kaynaktan statik olarak toplar ve birleştirilmiş bir ad hiç üretilmez —
 * kenar sessizce renksiz kalırdı.
 */
const EDGE_CLASS: Record<OpsTone, string> = {
  neutral: 'border-l-ops-line-strong',
  olive: 'border-l-ops-olive',
  amber: 'border-l-ops-amber',
  red: 'border-l-ops-red',
  blue: 'border-l-ops-blue',
  slate: 'border-l-ops-slate',
};

export function QueueRow({ row, active, onSelect }: QueueRowProps) {
  const tone = TICKET_TYPE_TONE[row.type];
  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      aria-current={active || undefined}
      className={[
        'flex w-full cursor-pointer flex-col gap-1.5 border-b border-l-[3px] border-b-ops-line-soft px-4 py-3 text-left transition-colors',
        active ? `${EDGE_CLASS[tone]} bg-ops-olive-bg` : 'border-l-transparent hover:bg-ops-subtle',
      ].join(' ')}
    >
      <span className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{row.customerName}</span>
        <Badge tone={tone}>{TICKET_TYPE_LABELS[row.type]}</Badge>
      </span>

      <span className="truncate font-ops-body text-ops-xs text-ops-muted">{row.preview || 'Mesaj yok'}</span>

      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={TICKET_STATUS_TONE[row.status]}>{TICKET_STATUS_LABELS[row.status]}</Badge>
        {row.awaitingReply ? (
          <Badge tone="amber" dot>
            Cevap bekliyor
          </Badge>
        ) : null}
        {row.handledBy === 'ai' ? <Badge tone="slate">AI yürütüyor</Badge> : null}
        {row.hasAttachment ? (
          <span className="text-ops-faint" title="Fotoğraf var">
            <CameraIcon size={13} />
          </span>
        ) : null}
        {row.orderReferenceNo ? <span className="font-ops-mono text-ops-micro text-ops-faint">{row.orderReferenceNo}</span> : null}
        <span className="ml-auto flex-none font-ops-mono text-ops-micro text-ops-faint">{agoLabel(row.ageMinutes)}</span>
      </span>
    </button>
  );
}

/** Kuyruk boşken: "hiç talep yok" ile "bu süzgeçte yok" AYRI cümlelerdir (EmptyState künyesi). */
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

// ── Detay panosu ─────────────────────────────────────────────────────────────

interface TicketDetailProps {
  detail: TicketDetailView;
  busy: boolean;
  error: string | null;
  compact: boolean;
  onStatus: (to: TicketStatus) => void;
  onReply: (body: string) => Promise<boolean>;
  onTakeOver: () => void;
  onTriggerReturn: () => void;
}

export function TicketDetail({ detail, busy, error, compact, onStatus, onReply, onTakeOver, onTriggerReturn }: TicketDetailProps) {
  const { ticket, customer, order, messages, returnOutcome, returnTrigger } = detail;
  // İlk mesaj MÜŞTERİNİN ANLATIMIDIR (`TicketMessage` künyesi: ayrı bir `description` alanı yok).
  // Çizim onu "Müşterinin anlatımı" başlığı altında, yazışmadan ayrı gösteriyor — aynı kayıt, iki
  // farklı okuma işi: biri şikâyetin kendisi, öteki konuşmanın seyri.
  const [first, ...rest] = messages;

  return (
    <div className="flex h-full min-h-0 flex-col bg-ops-subtle">
      <div className={`flex items-start gap-3 border-b border-ops-line ${compact ? 'px-4 py-3' : 'px-5 py-3.5'}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            {/* Müşteri köprüsü (brief §2). Müşteri ekranının DETAY rotası yok — liste + pencere;
                bu yüzden köprü aramadır. Terim en ayırt edici kimlikten seçilir (e-posta → telefon
                → ad): aynı adlı iki müşteri varsa ad araması ikisini birden getirirdi. */}
            <Link
              href={customersUrl({ q: customer.email ?? customer.phone ?? customer.name, type: 'all', scope: 'all' })}
              className="min-w-0 truncate font-ops-display text-ops-section font-semibold text-ops-ink hover:text-ops-olive"
            >
              {customer.name}
            </Link>
            <Badge tone={TICKET_TYPE_TONE[ticket.type]}>{TICKET_TYPE_LABELS[ticket.type]}</Badge>
          </span>

          {/* KÜNYE — çizimde tek satır ("geliş yolu · açıldı X önce"); brief iki şey daha istiyor
              (§2 müşteri geçmişi, §3 iadenin sonucu izlenebilsin) ve ikisinin de verisi sözleşmede
              hazır. Ayrı bir bloğa değil aynı künyeye kondular: karar verirken okunacaklar. */}
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

          {/* WhatsApp köprüsü DÜZ METİN: `/operations/whatsapp` ekranı henüz yok (nav girişi var,
              klasör yok). Var olmayan bir sayfaya götüren bağlantı, çalışan bir şey vaat ederdi. */}
          {ticket.conversationId ? (
            <span className="flex items-center gap-1.5 font-ops-body text-ops-micro text-ops-faint">
              <WhatsAppIcon size={12} /> Bağlı WhatsApp konuşması var — izleme ekranı açıldığında buradan bağlanacak.
            </span>
          ) : null}
        </div>

        <StatusSegments status={ticket.status} allowed={detail.allowedTransitions} busy={busy} onStatus={onStatus} />
      </div>

      <div className={`flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto ${compact ? 'px-4 py-3' : 'px-5 py-4'}`}>
        {order ? <OrderCard order={order} /> : null}

        {first ? (
          <section className="flex flex-col gap-2">
            <SectionLabel>Müşterinin anlatımı</SectionLabel>
            <div className="rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3 font-ops-body text-ops-sm leading-relaxed text-ops-body">
              {first.body}
            </div>
            <Attachments urls={first.attachmentUrls} compact={compact} />
          </section>
        ) : null}

        {rest.length > 0 ? (
          <section className="flex flex-col gap-2">
            <SectionLabel>Yazışma</SectionLabel>
            {rest.map((message) => (
              <MessageBubble key={message.id} message={message} compact={compact} />
            ))}
          </section>
        ) : null}
      </div>

      <div className={`flex flex-col gap-2.5 border-t border-ops-line ${compact ? 'px-4 py-3' : 'px-5 py-3.5'}`}>
        {/* AI şeridi yalnız AI yürütürken: bugün her talep `human` (16.5 yazılmadı), yani bu şerit
            pratikte hiç çıkmıyor — ama kapısı (`takeOverTicket`) hazır ve şerit AI geldiğinde
            kendiliğinden görünür. Çizili olduğu için de yazıldı: sonradan eklenen bir uyarı, AI'ın
            ilk çalıştığı gün eksik kalırdı. */}
        {ticket.handledBy === 'ai' ? (
          <div className="flex items-center gap-2.5 rounded-ops-card border border-ops-slate-line bg-ops-slate-bg px-3 py-2.5">
            <span className="flex-1 font-ops-body text-ops-xs leading-[1.6] text-ops-slate">
              Bu talebi şu an AI ajanı yürütüyor. Devralırsanız AI susturulur, sonraki cevaplar sizden gider.
            </span>
            <Button size="sm" variant="secondary" onClick={onTakeOver} disabled={busy}>
              Devral
            </Button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="font-ops-body text-ops-xs font-semibold text-ops-red">
            {error}
          </p>
        ) : null}

        <ReplyComposer busy={busy} compact={compact} onReply={onReply} />

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="danger"
            onClick={onTriggerReturn}
            disabled={busy || !returnTrigger.allowed}
            title={returnTrigger.allowed ? undefined : RETURN_BLOCKED_REASON[returnTrigger.reason]}
            fullWidth={compact}
          >
            İade tetikle
          </Button>
          {/* Kapalı düğmenin SEBEBİ yazılır, gizlenmez: "neden basamıyorum" sorusu ekranda
              cevaplanmazsa operatör onu bir arıza sanır. */}
          {!returnTrigger.allowed && !compact ? (
            <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
              {RETURN_BLOCKED_REASON[returnTrigger.reason]}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Detay seçilmemişken masaüstünün sağ sütunu — boş bir pano değil, ne yapılacağını söyleyen bir yüzey. */
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

// ── Parçalar ─────────────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: string }) {
  return (
    <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">{children}</span>
  );
}

interface StatusSegmentsProps {
  status: TicketStatus;
  allowed: readonly TicketStatus[];
  busy: boolean;
  onStatus: (to: TicketStatus) => void;
}

/**
 * Durum kontrolü — üç segment, çizimdeki gibi.
 *
 * **İzinsiz geçiş DEVRE DIŞI çizilir, gizlenmez.** Motor "çözülmüş talepte yalnız `open`" diyor
 * (`allowedTicketTransitions`), yani çözülmüş bir talepte "İlgileniliyor" tıklanamaz. Segmenti
 * gizlemek kontrolün genişliğini talebe göre oynatır ve operatör aynı ekranı her seferinde farklı
 * bulurdu; kapalı ama görünür bir segment ise durumu da öğretir.
 */
function StatusSegments({ status, allowed, busy, onStatus }: StatusSegmentsProps) {
  return (
    <div role="group" aria-label="Talep durumu" className="flex flex-none rounded-ops-btn border border-ops-line-strong bg-ops-line-soft p-0.5">
      {(Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((key) => {
        const current = key === status;
        const usable = current || allowed.includes(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onStatus(key)}
            disabled={busy || current || !usable}
            aria-pressed={current}
            className={[
              'rounded-[6px] px-2.5 py-1 font-ops-display text-ops-micro font-semibold transition-colors',
              current
                ? 'bg-ops-white text-ops-ink'
                : usable
                  ? 'cursor-pointer text-ops-muted hover:text-ops-ink'
                  : 'cursor-not-allowed text-ops-faint',
            ].join(' ')}
          >
            {TICKET_STATUS_LABELS[key]}
          </button>
        );
      })}
    </div>
  );
}

/** Bağlı sipariş + müşterinin işaretlediği kalemler — şikâyetin somut zemini (brief §2). */
function OrderCard({ order }: { order: NonNullable<TicketDetailView['order']> }) {
  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="font-ops-display text-ops-sm font-semibold text-ops-ink">
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
              <span className="min-w-0 flex-1 truncate font-ops-body text-ops-xs text-ops-body">{item.name}</span>
              <span className="flex-none font-ops-mono text-ops-micro text-ops-muted">{item.qty} ad.</span>
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

/**
 * Yazışmadaki tek mesaj. Müşteri solda, operasyon ve AI sağda — ve **AI ayrı tonda**: "bunu kim
 * söyledi" sorusu sonradan da cevaplanabilmeli (`admin-talepler.md §6`).
 */
function MessageBubble({ message, compact }: { message: TicketMessageView; compact: boolean }) {
  const mine = message.sender !== 'customer';
  const tone = TICKET_SENDER_TONE[message.sender];
  return (
    <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      <span className="flex items-center gap-1.5 font-ops-display text-ops-micro font-semibold text-ops-muted">
        {TICKET_SENDER_LABELS[message.sender]}
        <span className="font-ops-mono font-normal text-ops-faint">{shortDateTime(message.createdAt)}</span>
      </span>
      <div
        className={[
          'max-w-[78%] rounded-ops-card border px-3 py-2 font-ops-body text-ops-xs leading-relaxed',
          tone === 'olive'
            ? 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
            : tone === 'slate'
              ? 'border-ops-slate-line bg-ops-slate-bg text-ops-slate'
              : 'border-ops-line bg-ops-white text-ops-body',
        ].join(' ')}
      >
        {message.body}
      </div>
      <Attachments urls={message.attachmentUrls} compact={compact} align={mine ? 'end' : 'start'} />
    </div>
  );
}

/**
 * Mesajın ekleri. **Her mesajda olabilir** (`ticket_message.attachments`), yalnız ilkinde değil —
 * çizim fotoğrafları anlatımın altına koymuş ama şema onları mesaja bağlıyor; ekler bu yüzden
 * mesajın içinde duruyor (ilk mesajınki yine anlatımın altında görünür, aynı şey).
 *
 * Adres SÜRELİ ve imzalı (`privateReadUrl`, 15 dk): bozuk ürün fotoğrafı private kovada durur.
 * Yeni sekmede açılır çünkü karar çoğu kez fotoğraftan verilir ve küçük kutu buna yetmez.
 */
function Attachments({ urls, compact, align = 'start' }: { urls: readonly string[]; compact: boolean; align?: 'start' | 'end' }) {
  if (urls.length === 0) return null;
  const size = compact ? 80 : 72;
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

/**
 * Cevap kutusu. Metin BURADA durur, üst durumda değil: her tuşta client kökünü yeniden çizmenin
 * karşılığı yok ve gönderilene kadar kimsenin bu metinle işi yok.
 *
 * **Gönderilemeyen metin SİLİNMEZ:** kapı reddederse (ağ düştü, talep silindi) kutu olduğu gibi
 * kalır — operatörün yazdığı üç paragrafı bir hata mesajı uğruna kaybetmesi kabul edilemez.
 */
function ReplyComposer({ busy, compact, onReply }: { busy: boolean; compact: boolean; onReply: (body: string) => Promise<boolean> }) {
  const [body, setBody] = useState('');
  const empty = body.trim().length === 0;

  const send = () => {
    if (empty || busy) return;
    void onReply(body).then((ok) => {
      if (ok) setBody('');
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={compact ? 3 : 2}
        placeholder="Müşteriye cevap yaz… (aynen müşteriye görünür)"
        disabled={busy}
        aria-label="Müşteriye cevap"
      />
      <div className="flex items-center gap-2">
        {/* Ekranın en önemli cümlesi: yazılan metin AYNEN müşteriye gidiyor, iç not diye bir şey
            yok (DOMAIN §15, brief §6 — "admin yazdığının müşteriye aynen görüneceğini bilmeli"). */}
        <span className="mr-auto font-ops-body text-ops-micro text-ops-faint">
          Cevap müşteriye e-posta ile de gider. Marj, maliyet ve müşteri karnesi bu metne girmez.
        </span>
        <Button size="sm" variant="primary" onClick={send} disabled={busy || empty} fullWidth={compact}>
          {busy ? 'Gönderiliyor…' : 'Gönder'}
        </Button>
      </div>
    </div>
  );
}
