'use client';

import { useState } from 'react';
import Link from 'next/link';
import { TICKET_STATUS_LABELS, TICKET_TYPE_LABELS, type TicketStatus } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { Thumbnail } from '@/components/operation/ui/thumbnail';
import { Textarea } from '@/components/operation/form/input';
import { MultiToggle, type MultiToggleOption } from '@/components/operation/form/multi-toggle';
import { CONTROL_H } from '@/components/operation/ui/control';
import { CameraIcon, SearchOffIcon, WhatsAppIcon } from '@/components/operation/ui/icons';
import { agoLabel, agoShort, money, shortDateTime } from '@/components/operation/ui/format';
import type { OpsTone } from '@/components/operation/ui/tone';
import type { TicketMessageView } from '@/lib/ticket/ticket-types';
// Başka ekranların URL SÖZLEŞMESİ (STACK §7 istisnası): adres elle kurulmaz, sahibinden alınır.
import { customersUrl } from '../customers/customers-url';
import { ORDERS_PATH } from '../orders/orders-url';
import { whatsappLink } from '../whatsapp/whatsapp-url';
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
 * Talepler ekranının ORTAK parçaları (16.3) — kuyruk satırı ve detay panosu tek yerde durur ki
 * aynı talep iki yerde farklı okunmasın. Operasyon web'i masaüstü-yalnız; mobil deneyim native
 * uygulamada (`docs/uygulama`).
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
  violet: 'border-l-ops-violet',
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
        {/* Çizim 13px → merdivende `base` (künye: `base ← 13 · 13,5 · 14`). Satırın ADI en büyük
            öğesi olmalı. Bir tur boyunca burası elle `lead`e çekilmişti — okunmuyordu diye; ama
            doğru çözüm ekranı değil ÖLÇEĞİ büyütmekti (globals §0.0, 03.08 ikinci kalibrasyon),
            yoksa bu ekran ötekilerden bir kademe büyük kalırdı. */}
        <span className="min-w-0 flex-1 truncate font-ops-body text-ops-base font-semibold text-ops-ink">{row.customerName}</span>
        <Badge tone={tone}>{TICKET_TYPE_LABELS[row.type]}</Badge>
      </span>

      {/* Önizleme `body` (#6a7065), `muted` DEĞİL: çizimin değeri bu ve kuyruğun asıl okunan
          satırı burası — bir kademe soluk token taramayı zorlaştırıyordu. */}
      <span className="truncate font-ops-body text-ops-xs text-ops-body">{row.preview || 'Mesaj yok'}</span>

      <span className="flex flex-wrap items-center gap-1.5">
        <Badge tone={TICKET_STATUS_TONE[row.status]}>{TICKET_STATUS_LABELS[row.status]}</Badge>
        {row.awaitingReply ? (
          <Badge tone="amber" dot>
            Cevap bekliyor
          </Badge>
        ) : null}
        {row.handledBy === 'ai' ? <Badge tone="violet">AI yürütüyor</Badge> : null}
        {/* Fotoğraf işareti YALNIZ İKON — sipariş numarası buradan kalktı (03.08). İkisi birlikte
            rozet şeridini taşırıp yaşı alt satıra atıyordu; sipariş bağı zaten detayda kartıyla
            duruyor ve kuyrukta okunması gereken şey "kim, ne tipte, ne durumda, ne kadar bekledi". */}
        {row.hasAttachment ? (
          <span className="text-ops-faint" title="Fotoğraf var">
            <CameraIcon size={13} />
          </span>
        ) : null}
        {/* Yaş KISA biçimde (`agoShort`): "önce" eki bu sütunda bilgi taşımıyor ama genişlik yiyordu
            ve rozetlerin yanına sığmayıp satırı ikiye bölüyordu — kuyruk çizimin iki katı yükseklikte
            görünüyordu. Tarama yüzeyinde satır sayısı bilginin kendisi. */}
        <span className="ml-auto flex-none font-ops-mono text-ops-micro text-ops-faint">{agoShort(row.ageMinutes)}</span>
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
  onStatus: (to: TicketStatus) => void;
  onReply: (body: string) => Promise<boolean>;
  onTakeOver: () => void;
  onTriggerReturn: () => void;
}

export function TicketDetail({ detail, busy, error, onStatus, onReply, onTakeOver, onTriggerReturn }: TicketDetailProps) {
  const { ticket, customer, order, messages, returnOutcome, returnTrigger } = detail;
  // İlk mesaj MÜŞTERİNİN ANLATIMIDIR (`TicketMessage` künyesi: ayrı bir `description` alanı yok).
  // Çizim onu "Müşterinin anlatımı" başlığı altında, yazışmadan ayrı gösteriyor — aynı kayıt, iki
  // farklı okuma işi: biri şikâyetin kendisi, öteki konuşmanın seyri.
  const [first, ...rest] = messages;

  return (
    <div className="flex h-full min-h-0 flex-col bg-ops-subtle">
      <div className="flex items-start gap-3 border-b border-ops-line px-5 py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex min-w-0 items-center gap-2">
            {/* Müşteri köprüsü (brief §2). Müşteri ekranının DETAY rotası yok — liste + pencere;
                bu yüzden köprü aramadır. Terim en ayırt edici kimlikten seçilir (e-posta → telefon
                → ad): aynı adlı iki müşteri varsa ad araması ikisini birden getirirdi. */}
            <Link
              href={customersUrl({ q: customer.email ?? customer.phone ?? customer.name, type: 'all', scope: 'all', mc: 'any' })}
              // Çizim 15px → merdivende `lead` (künye: `lead ← 15 · 16`). `section` (19px) İKİ
              // kademe büyüktü: detay panosunun künyesi bir kart adıdır, sayfa başlığı değil —
              // `PageHeader`'daki "Talepler" ile aynı ağırlıkta görünmemeli.
              className="min-w-0 truncate font-ops-display text-ops-lead font-semibold text-ops-ink hover:text-ops-olive"
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

          {/* WhatsApp köprüsü artık GERÇEK BAĞLANTI: izleme ekranı yazıldı (15.5) ve konuşmayı
              kimliğiyle açıyor. Bir tur boyunca düz metindi — o zaman doğruydu, çünkü var olmayan
              bir sayfaya götüren bağlantı çalışan bir şey vaat ederdi. */}
          {ticket.conversationId ? (
            <Link
              href={whatsappLink(ticket.conversationId)}
              className="flex cursor-pointer items-center gap-1.5 font-ops-body text-ops-micro text-ops-olive hover:underline"
            >
              <WhatsAppIcon size={12} /> Bağlı WhatsApp konuşmasını aç →
            </Link>
          ) : null}
        </div>

        <MultiToggle
          size="sm"
          label="Talep durumu"
          className="flex-none"
          value={ticket.status}
          options={statusOptions(ticket.status, detail.allowedTransitions, busy)}
          onChange={onStatus}
        />
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3.5 overflow-y-auto px-5 py-4">
        {order ? <OrderCard order={order} /> : null}

        {first ? (
          <section className="flex flex-col gap-2">
            <SectionLabel>Müşterinin anlatımı</SectionLabel>
            {/* Anlatım metni `strong` (#3a3f37) — çizimin değeri. Şikâyetin kendisi bu kutuda ve
                ekranın en dikkatli okunan yeri; balon metniyle aynı kademede olmalı.
                Çeviri rozeti BURADA en gerekli: iade kararının dayanağı tam olarak bu cümle. */}
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
        {/* AI şeridi yalnız AI yürütürken: bugün her talep `human` (16.5 yazılmadı), yani bu şerit
            pratikte hiç çıkmıyor — ama kapısı (`takeOverTicket`) hazır ve şerit AI geldiğinde
            kendiliğinden görünür. Çizili olduğu için de yazıldı: sonradan eklenen bir uyarı, AI'ın
            ilk çalıştığı gün eksik kalırdı. */}
        {ticket.handledBy === 'ai' ? (
          <div className="flex items-center gap-2.5 rounded-ops-card border border-ops-violet-line bg-ops-violet-bg px-3 py-2.5">
            <span className="flex-1 font-ops-body text-ops-xs leading-[1.6] text-ops-violet">
              Bu talebi şu an AI ajanı yürütüyor. Devralırsanız AI susturulur, sonraki cevaplar sizden gider.
            </span>
            {/* Çizimde DOLU mor: bu düğme kararın kendisi (AI susar, geri dönüşü yok), ikincil bir
                seçenek değil. Çerçeveli `secondary` onu bir "isterseniz" gibi gösteriyordu. */}
            <Button size="sm" variant="violet" onClick={onTakeOver} disabled={busy}>
              Devral
            </Button>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="font-ops-body text-ops-xs font-semibold text-ops-red">
            {error}
          </p>
        ) : null}

        {/* Kapalı düğmenin SEBEBİ yazılır, gizlenmez — ama SATIRIN ÜSTÜNDE: çizim üç kontrolü tek
            satırda tutuyor ve araya sığdırılan bir açıklama o satırı bozuyordu. */}
        {!returnTrigger.allowed ? (
          <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{RETURN_BLOCKED_REASON[returnTrigger.reason]}</span>
        ) : null}

        <ReplyBar
          busy={busy}
          returnAllowed={returnTrigger.allowed}
          returnReason={returnTrigger.allowed ? undefined : RETURN_BLOCKED_REASON[returnTrigger.reason]}
          onReply={onReply}
          onTriggerReturn={onTriggerReturn}
        />
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

/**
 * Durum kontrolünün SEÇENEKLERİ — kontrolün kendisi ortak (`MultiToggle`, Envanter O8).
 *
 * Bu ekran bir tur boyunca kendi segmentini elden yazmıştı ve bedeli ölçülebilirdi: `role="radiogroup"`,
 * ok tuşu gezinmesi, roving tabindex ve kayan hap yoktu; üstelik ray iki farklı gri tonda çiziliyordu
 * (aynı uygulamada iki "segment"). Eksik olan tek şey seçenek başına `disabled`'dı — o da artık
 * ortak komponentte.
 *
 * **İzinsiz geçiş DEVRE DIŞI, gizli DEĞİL.** Motor "çözülmüş talepte yalnız `open`" diyor
 * (`allowedTicketTransitions`). Gizlemek kontrolün genişliğini talebe göre oynatır ve operatör aynı
 * ekranı her seferinde farklı bulurdu; kapalı ama görünür bir seçenek kuralı da öğretir.
 *
 * **Ton VERİLMİYOR** (varsayılan olive) ve bu bilinçli bir geri adım: bir tur boyunca durum rozetiyle
 * aynı sözlük geçilmişti (`TICKET_STATUS_TONE`) ve sonuç ekranda yanlış okunuyordu — kuyruğun
 * VARSAYILAN hâli "Açık", yani hap neredeyse her zaman amber doluyordu ve nötr bir kontrol sürekli
 * uyarı veriyormuş gibi duruyordu. Çizim orada beyaz/nötr bir hap gösteriyor; sistemin bu kontrolde
 * beyazı yok (`MultiToggle` künyesindeki bilinçli sapma), en yakın nötr karşılık varsayılan olive.
 * Rozet ile hap "aynı gerçeği iki kez söylemiyor" zaten: rozet DURUMU, hap SEÇİMİ gösteriyor.
 */
function statusOptions(status: TicketStatus, allowed: readonly TicketStatus[], busy: boolean): MultiToggleOption<TicketStatus>[] {
  return (Object.keys(TICKET_STATUS_LABELS) as TicketStatus[]).map((key) => ({
    key,
    label: TICKET_STATUS_LABELS[key],
    disabled: busy || (key !== status && !allowed.includes(key)),
  }));
}

/** Bağlı sipariş + müşterinin işaretlediği kalemler — şikâyetin somut zemini (brief §2). */
function OrderCard({ order }: { order: NonNullable<TicketDetailView['order']> }) {
  return (
    <div className="flex flex-col gap-2 rounded-ops-card border border-ops-line bg-ops-white px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        {/* Çizim 12px → `xs`. Kart BAŞLIĞI ama kartın içeriğinden büyük değil: asıl okunacak şey
            kalem satırları. */}
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
              {/* Çizim: kalem adı 12,5px → `sm`, adet 11,5px → `xs`. İkisi de bir kademe küçüktü. */}
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

/** Balonun zemin+kenarlığı; METİN buraya girmez — gerekçe `MessageBubble` künyesinde. */
const BUBBLE_SKIN: Record<OpsTone, string> = {
  olive: 'border-ops-olive-line bg-ops-olive-bg',
  violet: 'border-ops-violet-line bg-ops-violet-bg',
  neutral: 'border-ops-line bg-ops-white',
  amber: 'border-ops-amber-line bg-ops-amber-bg',
  red: 'border-ops-red-line bg-ops-red-bg',
  blue: 'border-ops-blue-line bg-ops-blue-bg',
  slate: 'border-ops-slate-line bg-ops-slate-bg',
};

/** Gönderici ADININ rengi — ayrımı taşıyan yer burası. */
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
 * Yazışmadaki tek mesaj. Müşteri solda, operasyon ve AI sağda — ve **AI ayrı tonda**: "bunu kim
 * söyledi" sorusu sonradan da cevaplanabilmeli (`admin-talepler.md §6`).
 *
 * **RENK ADI TAŞIR, METNİ DEĞİL** — ve bu bir tur boyunca TERS kuruluydu: gönderici adı sabit gri,
 * balon metni tonluydu. Çizim tam tersini yapıyor ve haklı: ayrımı taşıması gereken şey kimliktir,
 * okunması gereken şey metindir. Tonlu bir metin, tonlu bir zeminin üstünde kontrastını kaybediyor
 * — üstelik en çok okunan yerde.
 */
/**
 * Müşteri metninin ÇEVİRİLİ gösterimi (20.2) — anlatım kutusu ve yazışma balonu bunu paylaşır.
 *
 * ── ÇEVİRİ ORİJİNALİN YERİNE GEÇMEZ ─────────────────────────────────────────
 * Varsayılan çeviridir (operatör kuyruğu tarayabilmeli), ama orijinal bir tık uzakta durur:
 * personel müşterinin cümlesini bazen aynen alıntılamak zorunda (iade kararı, kargo şikâyeti) ve
 * makine çevirisi bir yorum katmanıdır — "kutu ezilmişti" ile "kutu hasarlıydı" aynı tazminat
 * kararını vermez.
 *
 * Tek komponent çünkü aynı üçlü iki yerde çiziliyor; iki kopya bir gün ayrışır ve ayrıştığı gün
 * biri rozeti unutur, yani personel makine cümlesini müşterinin cümlesi sanar.
 */
function TranslatedBody({ message, className, align = 'start' }: { message: TicketMessageView; className: string; align?: 'start' | 'end' }) {
  const [showOriginal, setShowOriginal] = useState(false);
  const translated = message.bodyTranslated;
  const original = translated && showOriginal;

  return (
    <>
      <div
        className={className}
        // Gösterilen metin ORİJİNALSE dilini söylüyoruz: ekran okuyucusu ve tarayıcı çevirisi
        // Fransızca bir cümleyi Türkçe sanmasın. Çeviri gösteriliyorsa dil zaten yüzeyin dili.
        lang={original ? (message.language ?? undefined) : undefined}
      >
        {original ? message.originalBody : message.body}
      </div>
      {translated ? (
        <span className={`flex items-center gap-2 ${align === 'end' ? 'self-end' : ''}`}>
          {/* MOR = makine konuştu (`ui/tone.ts` sözlüğü): rozet bir durum değil, KİMİN yazdığını
              söylüyor — personelin okuduğu cümle müşterinin kendi cümlesi değil. */}
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

function MessageBubble({ message }: { message: TicketMessageView }) {
  const mine = message.sender !== 'customer';
  const tone = TICKET_SENDER_TONE[message.sender];
  return (
    <div className={`flex flex-col gap-1 ${mine ? 'items-end' : 'items-start'}`}>
      <span className={`flex items-center gap-1.5 font-ops-display text-ops-micro font-semibold ${SENDER_NAME[tone]}`}>
        {TICKET_SENDER_LABELS[message.sender]}
        <span className="font-ops-mono font-normal text-ops-faint">{shortDateTime(message.createdAt)}</span>
      </span>
      <TranslatedBody
        message={message}
        align={mine ? 'end' : 'start'}
        className={[
          // Çizim 12,5px → merdivende `sm` (künye: `sm ← 12 · 12,5`). Burası ekranın EN ÇOK OKUNAN
          // metni; okunabilirlik ölçeğin kendi kalibrasyonuyla çözüldü (globals §0.0), ekran
          // özelinde bir sapmayla değil.
          'max-w-[78%] rounded-ops-card border px-3 py-2 font-ops-body text-ops-sm leading-relaxed text-ops-strong',
          BUBBLE_SKIN[tone],
        ].join(' ')}
      />
      <Attachments urls={message.attachmentUrls} align={mine ? 'end' : 'start'} />
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
  onReply: (body: string) => Promise<boolean>;
  onTriggerReturn: () => void;
}

/**
 * Alt bar — **çizimdeki gibi TEK SATIR**: kutu, "İade tetikle", "Gönder".
 *
 * Bir tur boyunca üçe bölünmüştü (kutu · altında Gönder satırı · altında ayrı bir İade satırı) ve
 * çizimin niyeti orada kayboluyordu: bu üçü aynı kararın parçası — operatör cevabı yazarken "bu
 * para işi mi" sorusunu da veriyor. Üç kata yayılınca ikisi ayrı iş gibi okunuyordu.
 *
 * **Bir açıklama satırı da SİLİNDİ:** "cevap müşteriye e-posta ile de gider…" diye eklediğim cümle
 * zaten placeholder'ın söylediğini (*"aynen müşteriye görünür"*) ikinci kez söylüyordu ve satırı
 * bozan şeyin kendisiydi — `mr-auto` taşıyan bir yazı ile `fullWidth` bir düğme aynı flex satırında
 * çakışıyordu.
 *
 * **Kutu tek satırlık DEĞİL, `Textarea`** — çizimden bilinçli sapma: cevaplar paragraf uzunluğunda
 * yazılıyor ve tek satırlık bir kutuda operatör yazdığını göremezdi. Satırın kendisi `items-end`
 * hizalı, böylece kutu büyüse de düğmeler tabanda kalıyor.
 *
 * Metin BURADA durur, üst durumda değil: her tuşta client kökünü yeniden çizmenin karşılığı yok.
 * **Gönderilemeyen metin SİLİNMEZ** — kapı reddederse kutu olduğu gibi kalır; operatörün yazdığı
 * üç paragrafı bir hata mesajı uğruna kaybetmesi kabul edilemez.
 */
function ReplyBar({ busy, returnAllowed, returnReason, onReply, onTriggerReturn }: ReplyBarProps) {
  const [body, setBody] = useState('');
  const empty = body.trim().length === 0;

  const send = () => {
    if (empty || busy) return;
    void onReply(body).then((ok) => {
      if (ok) setBody('');
    });
  };

  // Kutu TEK SATIR yüksekliğinde (`CONTROL_H.md` = 36px) ve düğmeler de `md` — çizimde
  // üçünün dolgusu da `10px 13px`, yani AYNI yükseklik. Bir tur boyunca kutu iki satır (`rows=2`),
  // düğmeler `sm` (32px) idi: satır hem kalın hem hizasızdı (kullanıcı bildirimi, 03.08).
  // `Textarea` kalıyor (`Input` değil): tek satır GÖRÜNÜYOR ama yeni satır kabul ediyor ve
  // taşınca kendi içinde kayıyor — cevaplar paragraf uzunluğunda yazılıyor.
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

  // `items-center`: üçü de aynı yükseklikte olduğu için hizalama artık taban değil merkez —
  // `items-end` iki farklı yükseklik varken gerekliydi, eşitlendiğinde gereksiz.
  return (
    <div className="flex items-center gap-2.5">
      {box}
      {iade}
      {gonder}
    </div>
  );
}
