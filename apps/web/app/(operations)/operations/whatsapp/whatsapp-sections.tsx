'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { CustomerContextData } from '@/lib/customer/context';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import {
  ContextConsent,
  ContextIdentity,
  ContextNotice,
  ContextOrders,
  ContextPane,
} from '@/components/operation/ui/customer-context-pane';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { AlertIcon, WhatsAppIcon } from '@/components/operation/ui/icons';
import { bubbleClass, MessageRow, MessageThread, SectionLabel } from '@/components/operation/ui/message-thread';
import { QueueRow } from '@/components/operation/ui/queue-pane';
import { Textarea } from '@/components/operation/form/input';
import { TICKETS_PATH } from '../tickets/tickets-url';
import { customersUrl } from '../customers/customers-url';
import { OUTBOUND_LABEL, WINDOW_NOTE, WINDOW_TONE } from './whatsapp-labels';
import type { ConversationDetailView, InboxRowView, MessageView } from './whatsapp-types';

// WhatsApp izleme ekranının PANOLARI (15.5) — sol kuyruk satırı, orta sohbet, sağ müşteri bağlamı.
//
// Üçünün de İSKELETİ ortak kitten geliyor (`QueueRow` · `MessageThread` · `ContextPane`): Talepler
// ekranı aynı iskeleti kullanıyor ve iki kopya bir gün ayrışırdı. Burada kalan yalnız ANLAM —
// hangi rozet, hangi renk, hangi cümle.

// ─────────────────────────────────────────────────────────────────────────────
// SOL — gelen kutusu satırı
// ─────────────────────────────────────────────────────────────────────────────

interface InboxRowProps {
  row: InboxRowView;
  active: boolean;
  onSelect: (id: string) => void;
}

export function InboxRow({ row, active, onSelect }: InboxRowProps) {
  return (
    <QueueRow
      id={row.id}
      active={active}
      onSelect={onSelect}
      title={row.title}
      // Seçili kenar WhatsApp YEŞİLİ (çizim): kuyruk hangi kanalın kuyruğu olduğunu da söylüyor.
      edgeClass="border-l-brand-whatsapp"
      trailing={<span className="flex-none font-ops-mono text-ops-micro text-ops-faint">{row.ago}</span>}
      preview={row.preview}
      badges={
        <>
          {row.awaitingReply ? (
            <Badge tone="amber" dot>
              Cevap bekliyor
            </Badge>
          ) : null}
          {row.unidentified ? <Badge tone="slate">kimlik yok</Badge> : null}
          <Badge tone={WINDOW_TONE[row.window.tone]} className="ml-auto">
            {row.window.chip}
          </Badge>
        </>
      }
    />
  );
}

export function InboxEmpty({ filtered }: { filtered: boolean }) {
  return (
    <EmptyState
      icon={<WhatsAppIcon size={22} />}
      title={filtered ? 'Cevap bekleyen sohbet yok' : 'Henüz konuşma yok'}
      description={
        filtered
          ? 'Son sözü müşterinin söylediği bir sohbet kalmadı. Tümü çipiyle bütün konuşmalara dönebilirsiniz.'
          : 'Müşteri WhatsApp’tan yazdığında sohbeti buraya işleyin — üstteki "Gelen DM işle" düğmesi numaradan konuşmayı açar.'
      }
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ORTA — sohbet
// ─────────────────────────────────────────────────────────────────────────────

export function DetailPlaceholder() {
  return (
    <div className="flex flex-1 items-center justify-center bg-ops-gray-25">
      <EmptyState
        icon={<WhatsAppIcon size={22} />}
        title="Sohbet seçilmedi"
        description="Soldaki kuyruktan bir konuşma seçin; mesaj geçmişi ve müşteri bağlamı burada açılır."
      />
    </div>
  );
}

/**
 * Mesaj balonu — künye ÜSTTE, balon altta (ortak `MessageRow`).
 *
 * Çizim yalnız giden mesaja bir ad yazıyor ("Siz"), gelene yazmıyor: gelenin kim olduğunu zaten
 * başlık söylüyor ve her balona ad koymak diziyi gürültüye boğardı.
 *
 * **Çizimde saat YOK, burada VAR ve tek sapma bu:** defter ELLE tutuluyor ve 24 saatlik pencerenin
 * dayanağı mesajın ANI. Saati göstermeyen bir defterde "pencere neden kapalı" sorusunun cevabı
 * ekranda hiç görünmezdi. Ayrı satır AÇILMIYOR — çizimin zaten var olan künye satırına yazılıyor.
 */
function Bubble({ message }: { message: MessageView }) {
  const mine = message.direction === 'outbound';
  return (
    <MessageRow
      side={mine ? 'out' : 'in'}
      meta={
        <>
          {mine ? <span className="font-ops-display text-ops-micro font-semibold text-ops-olive-dark">{OUTBOUND_LABEL}</span> : null}
          <span className="font-ops-mono text-ops-micro text-ops-faint">{message.stamp}</span>
          {/* Şablon etiketi rozet DEĞİL, künye: mesajın kendisi değil, ücret sınıfı hakkında bir not. */}
          {message.templateLabel ? (
            <span className="font-ops-body text-ops-micro text-ops-amber">· kalıp: {message.templateLabel}</span>
          ) : null}
        </>
      }
    >
      <div className={bubbleClass(mine ? 'olive' : 'neutral')}>{message.text}</div>
    </MessageRow>
  );
}

interface ConversationPaneProps {
  detail: ConversationDetailView;
  busy: boolean;
  error: string | null;
  onIncoming: () => void;
  onRecordOutbound: (text: string) => Promise<boolean>;
}

export function ConversationPane({ detail, busy, error, onIncoming, onRecordOutbound }: ConversationPaneProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ops-gray-25">
      {/* Başlık barındaki eylem yeri ÇİZİMİN yeri ("Devral" · "Sipariş oluştur"); ikisi de bugün
          yok (ajan 15.13, köprü 15.4) ve yerlerine bu sohbete ait tek gerçek eylem konuyor. */}
      <div className="flex flex-none items-center gap-3 border-b border-ops-line bg-ops-card px-5 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{detail.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {detail.context ? (detail.context.isCompany ? 'B2B' : 'B2C') : 'kimlik çözülmedi'} · {detail.messages.length} mesaj
          </span>
        </div>
        <Badge tone={WINDOW_TONE[detail.window.tone]}>{detail.window.chip}</Badge>
        <Button variant="secondary" size="sm" className="flex-none whitespace-nowrap" onClick={onIncoming}>
          Gelen mesaj işle
        </Button>
      </div>

      {detail.messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            title="Bu konuşmada henüz mesaj yok"
            description="Konuşma açıldı ama defterine hiç mesaj işlenmedi."
          />
        </div>
      ) : (
        <MessageThread className="px-5 py-4">
          {detail.messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
        </MessageThread>
      )}

      <ReplyBox
        // Konuşma değişince kutu SIFIRLANIR: yarım kalmış bir metin bir sonraki müşterinin
        // penceresinde durursa yanlış sohbetin defterine işlenir.
        key={detail.id}
        window={detail.window}
        busy={busy}
        error={error}
        onRecordOutbound={onRecordOutbound}
      />
    </div>
  );
}

interface ReplyBoxProps {
  window: ConversationDetailView['window'];
  busy: boolean;
  error: string | null;
  onRecordOutbound: (text: string) => Promise<boolean>;
}

/**
 * Altlık — **çizimin iki hâli birebir**: pencere açıkken tek kutu + tek eylem, kapalıyken yalnız
 * uyarı bandı (kutu HİÇ çizilmez, çizimde de yok).
 *
 * Kapalıyken kutunun kalkması yalnız çizime uymak değil, DOĞRU: pencere kapalıyken admin kendi
 * telefonundan da serbest metin gönderemez — Meta engeller. Yani kaydedilecek bir cevap da yoktur.
 *
 * **Kutu bir GÖNDERME kutusu değil, DEFTER kutusudur** ve tek sapma bu. Çizim uçak düğmesi koyuyor
 * ama arkasında bugün hiçbir şey yok: gönderim kanalı 360dialog'la geliyor (15.7/15.11). Yazdığını
 * gönderdiğini sanan operatör, cevapsız kalan müşteriyi asla fark etmez.
 *
 * **GELEN mesaj burada işlenmez** — o iş "Gelen mesaj işle" penceresinin, çünkü gelen mesaj
 * pencereyi AÇAN olaydır ve alınma anını ister.
 */
function ReplyBox({ window: win, busy, error, onRecordOutbound }: ReplyBoxProps) {
  const [text, setText] = useState('');

  const submit = async () => {
    if (!text.trim()) return;
    if (await onRecordOutbound(text)) setText('');
  };

  if (win.state !== 'open') {
    return (
      <div className="flex flex-none border-t border-ops-line bg-ops-card px-5 py-3">
        <div className="flex w-full items-center gap-2.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5">
          <span className="flex-none text-ops-amber">
            <AlertIcon size={16} />
          </span>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">{WINDOW_NOTE[win.state]}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-none flex-col gap-1.5 border-t border-ops-line bg-ops-card px-5 py-3">
      <div className="flex items-end gap-2.5">
        <Textarea
          className="flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={1}
          placeholder="Telefonunuzdan gönderdiğiniz cevabı buraya geçirin…"
        />
        <Button variant="primary" className="flex-none whitespace-nowrap" onClick={() => void submit()} disabled={busy || !text.trim()}>
          {busy ? 'İşleniyor…' : 'Deftere işle'}
        </Button>
      </div>
      <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
        {error ? (
          <span className="font-semibold text-ops-red">{error}</span>
        ) : (
          <>
            {WINDOW_NOTE.open} {win.chip} kaldı · buradan mesaj GÖNDERİLMEZ, yazışma telefondan yürür.
          </>
        )}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAĞ — müşteri bağlamı (ORTAK pano + bu ekrana özel bloklar)
// ─────────────────────────────────────────────────────────────────────────────

interface WhatsappContextPaneProps {
  context: CustomerContextData | null;
  /** Konuşmanın numarası — kimlik çözülmese de bilinir ve gösterilmelidir. */
  phone: string;
  tickets: ConversationDetailView['tickets'];
  onNewTicket: () => void;
}

export function WhatsappContextPane({ context, phone, tickets, onNewTicket }: WhatsappContextPaneProps) {
  const searchHref = customersUrl({ q: phone, type: 'all', scope: 'all', mc: 'any' });

  if (!context) {
    return (
      <ContextPane>
        <span className="font-ops-mono text-ops-sm text-ops-ink">{phone}</span>
        {/* Kimliksiz konuşma bir ARIZA DEĞİL, tasarımın bir hâli: adım 2'de webhook mesajı önce
            yazar, kimliği sonra çözer. Elle işlemede ise telefon ve e-posta ayrı müşterilere
            çıktığında konuşma bilerek bağlanmadan açılır — yanlış hesaba bağlanmış bir sohbet,
            bağlanmamış bir sohbetten pahalıdır. */}
        <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
          Bu numara bir müşteriye bağlanmadı. Sipariş geçmişi ve izin bilgisi ancak kimlik çözülünce görünür.
        </span>
        <Link href={searchHref} className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline">
          Müşterilerde ara →
        </Link>
      </ContextPane>
    );
  }

  return (
    <ContextPane>
      {/* Ad müşteri ekranına NUMARAYLA gider: WhatsApp'ta kimliğin anahtarı numaradır ve aynı adlı
          iki müşteri varsa ad araması ikisini birden getirirdi. */}
      <ContextIdentity context={context} href={searchHref} secondary={phone} />

      {context.isDraft ? (
        <ContextNotice>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
            Numara kayıtlı bir müşteriyle eşleşmedi — WhatsApp&apos;tan otomatik açılmış taslak kayıt.
          </span>
          {/* Birleştirme MÜŞTERİLER ekranının işi (09.10) ve orada gerçekten var; burada yalnız o
              ekrana numarayla gidiliyor. Kendi birleştirme düğmemizi çizmek, aynı kararı iki yerde
              yaşatmak olurdu. */}
          <Link href={searchHref} className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-amber hover:underline">
            Müşterilerde ara ve birleştir →
          </Link>
        </ContextNotice>
      ) : null}

      <ContextOrders context={context} />
      <ContextConsent context={context} channel="whatsapp" />

      <div className="flex flex-col gap-1.5">
        <SectionLabel>Bağlı talepler</SectionLabel>
        {tickets.length === 0 ? (
          <span className="font-ops-body text-ops-xs text-ops-faint">Bu sohbetten talep açılmadı.</span>
        ) : (
          tickets.map((t) => (
            <Link
              key={t.id}
              href={`${TICKETS_PATH}?t=${t.id}`}
              className="flex cursor-pointer flex-col rounded-ops-card border border-ops-line bg-ops-card px-2.5 py-2 hover:border-ops-line-strong"
            >
              <span className="truncate font-ops-body text-ops-xs text-ops-ink">{t.subject}</span>
              <span className="font-ops-body text-ops-micro text-ops-muted">{t.statusLabel}</span>
            </Link>
          ))
        )}
        <Button variant="danger" size="sm" onClick={onNewTicket}>
          Talep (şikâyet) aç
        </Button>
      </div>
    </ContextPane>
  );
}
