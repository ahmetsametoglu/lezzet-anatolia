'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Badge } from '@/components/operation/ui/badge';
import { Button } from '@/components/operation/ui/button';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { WhatsAppIcon } from '@/components/operation/ui/icons';
import { money } from '@/components/operation/ui/format';
import { InputField, Textarea } from '@/components/operation/form/input';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import { TICKETS_PATH } from '../tickets/tickets-url';
import { customersUrl } from '../customers/customers-url';
import { WINDOW_NOTE, WINDOW_TONE } from './whatsapp-labels';
import { CONTEXT_ORDER_LIMIT, type ConversationContextView, type ConversationDetailView, type InboxRowView, type MessageView } from './whatsapp-types';

// WhatsApp izleme ekranının PANOLARI (15.5) — sol kuyruk satırı, orta sohbet, sağ müşteri bağlamı.
//
// Hepsi tek dosyada, çünkü üçü aynı konuşmanın üç yüzü: satırdaki pencere rozeti ile altlıktaki
// uyarı bandı AYNI karardan (`toWindowView`) besleniyor ve ayrı dosyalara bölünseydi biri
// güncellenip öteki unutulurdu.

// ─────────────────────────────────────────────────────────────────────────────
// SOL — gelen kutusu satırı
// ─────────────────────────────────────────────────────────────────────────────

interface InboxRowProps {
  row: InboxRowView;
  active: boolean;
  onSelect: (id: string) => void;
}

/**
 * Kuyruk satırı: kim · ne zaman · ne yazdı · hangi hâlde.
 *
 * Seçili satırın SOL KENARI WhatsApp yeşili (çizim): kuyrukta gezinirken hangi sohbetin açık
 * olduğu, satırın zemininden önce kenardan okunuyor.
 */
export function InboxRow({ row, active, onSelect }: InboxRowProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row.id)}
      className={[
        'flex w-full cursor-pointer flex-col gap-1 border-b border-l-[3px] border-b-ops-line-soft px-4 py-3 text-left transition-colors',
        active ? 'border-l-brand-whatsapp bg-ops-olive-bg' : 'border-l-transparent hover:bg-ops-gray-100',
      ].join(' ')}
    >
      <div className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate font-ops-body text-ops-sm font-semibold text-ops-ink">{row.title}</span>
        <span className="flex-none font-ops-mono text-ops-micro text-ops-faint">{row.ago}</span>
      </div>
      <span className="truncate font-ops-body text-ops-xs text-ops-body">{row.preview}</span>
      <div className="flex items-center gap-1.5">
        {row.awaitingReply ? <Badge tone="amber">cevap bekliyor</Badge> : null}
        {row.unidentified ? <Badge tone="slate">kimlik yok</Badge> : null}
        <Badge tone={WINDOW_TONE[row.window.tone]} className="ml-auto">
          {row.window.chip}
        </Badge>
      </div>
    </button>
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
    <EmptyState
      icon={<WhatsAppIcon size={22} />}
      title="Sohbet seçilmedi"
      description="Soldaki kuyruktan bir konuşma seçin; mesaj geçmişi ve müşteri bağlamı burada açılır."
    />
  );
}

function Bubble({ message }: { message: MessageView }) {
  const mine = message.direction === 'outbound';
  return (
    <div className={['flex max-w-[74%] flex-col gap-1', mine ? 'self-end items-end' : 'self-start items-start'].join(' ')}>
      <div
        className={[
          'rounded-[11px] border px-3 py-2 font-ops-body text-ops-sm leading-[1.5] whitespace-pre-wrap text-ops-ink',
          mine ? 'border-ops-olive-line bg-ops-olive-bg' : 'border-ops-line bg-ops-white',
        ].join(' ')}
      >
        {message.text}
      </div>
      <span className="flex items-center gap-1.5 px-1 font-ops-mono text-ops-micro text-ops-faint">
        {message.stamp}
        {/* Şablon etiketi rozet DEĞİL, künye: mesajın kendisi değil, ücret sınıfı hakkında bir not. */}
        {message.templateLabel ? <span className="font-ops-body text-ops-amber">· kalıp: {message.templateLabel}</span> : null}
      </span>
    </div>
  );
}

interface ConversationPaneProps {
  detail: ConversationDetailView;
  busy: boolean;
  error: string | null;
  onRecordInbound: (text: string, receivedAt: string) => Promise<boolean>;
  onRecordOutbound: (text: string) => Promise<boolean>;
}

export function ConversationPane({ detail, busy, error, onRecordInbound, onRecordOutbound }: ConversationPaneProps) {
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ops-gray-25">
      <div className="flex flex-none items-center gap-3 border-b border-ops-line bg-ops-card px-5 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{detail.title}</span>
          <span className="font-ops-body text-ops-xs text-ops-muted">
            {detail.context ? (detail.context.isCompany ? 'B2B' : 'B2C') : 'kimlik çözülmedi'} · {detail.messages.length} mesaj
          </span>
        </div>
        <Badge tone={WINDOW_TONE[detail.window.tone]}>{detail.window.chip}</Badge>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4">
        {detail.messages.length === 0 ? (
          <EmptyState
            title="Bu konuşmada henüz mesaj yok"
            description="Konuşma açıldı ama defterine hiç mesaj işlenmedi. Altlıktan ilk mesajı işleyebilirsiniz."
          />
        ) : (
          // `mt-auto` — kısa sohbet ALTA yaslanır, tepede boşluk bırakmaz. Sohbetin okunacak yeri
          // yazma kutusunun hemen üstüdür; yukarı yaslanan bir dizi, son mesajı ekranın öbür ucuna
          // atardı. Sarmalayıcıya `justify-end` vermek yerine `mt-auto`: taşan içerikte `justify-end`
          // kaydırma kutusunun TEPESİNİ kırpar (eski mesajlara hiç ulaşılamazdı).
          <div className="mt-auto flex flex-col gap-2.5">
            {detail.messages.map((m) => (
              <Bubble key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <MessageLedgerBox
        // Konuşma değişince kutu SIFIRLANIR: yarım kalmış bir metin bir sonraki müşterinin
        // penceresinde durursa yanlış sohbetin defterine işlenir.
        key={detail.id}
        window={detail.window}
        busy={busy}
        error={error}
        onRecordInbound={onRecordInbound}
        onRecordOutbound={onRecordOutbound}
      />
    </div>
  );
}

const LEDGER_SIDES = [
  { key: 'inbound' as const, label: 'Müşteri yazdı' },
  { key: 'outbound' as const, label: 'Ben cevapladım' },
];

interface MessageLedgerBoxProps {
  window: ConversationDetailView['window'];
  busy: boolean;
  error: string | null;
  onRecordInbound: (text: string, receivedAt: string) => Promise<boolean>;
  onRecordOutbound: (text: string) => Promise<boolean>;
}

/**
 * **Altlık bir GÖNDERME kutusu değil, DEFTER kutusudur** — ve bu ayrım ekranın en kritik yeri.
 *
 * Çizim buraya "Mesaj yaz…" + uçak düğmesi koyuyor, ama o düğmenin arkasında bugün hiçbir şey yok:
 * gönderim kanalı 360dialog'la geliyor (15.7/15.11). Yazdığını gönderdiğini sanan bir operatör,
 * cevapsız kalan müşteriyi asla fark etmez — çizip yazmamak, yazdığını sandırmanın en sessiz yolu.
 *
 * Bugün gerçek olan iş şu: yazışma admin'in kendi telefonundan yürüyor, ekran onun DEFTERİNİ tutuyor
 * (15.1'in beyanı: *"admin, gelen DM'i işler"*). Kutu bu yüzden iki yönlüdür ve düğmesi "işle" der.
 *
 * **Gelen mesajda ALINMA ANI sorulur, "şimdi" varsayılmaz.** Kapının kendi kuralı ve tam da bu ekran
 * için konmuş: admin sabah gelen DM'i öğlen işler, 24 saatlik pencere ise müşteri YAZDIĞINDA
 * başlamıştır. "Şimdi"den hesaplanan bitiş Meta'nınkinden saatlerce geç olur; ekran "serbest metin
 * gönderebilirsin" derken gönderim şablon ücretiyle geçer. Giden mesajda sorulmaz — giden mesaj
 * pencereye zaten dokunmuyor.
 */
function MessageLedgerBox({ window: win, busy, error, onRecordInbound, onRecordOutbound }: MessageLedgerBoxProps) {
  const [side, setSide] = useState<'inbound' | 'outbound'>('inbound');
  const [text, setText] = useState('');
  const [receivedAt, setReceivedAt] = useState('');

  const blocked = !text.trim() ? 'Mesaj metni yazılmalı' : side === 'inbound' && !receivedAt ? 'Mesajın geldiği an yazılmalı' : null;

  const submit = async () => {
    if (blocked) return;
    const ok = side === 'inbound' ? await onRecordInbound(text, new Date(receivedAt).toISOString()) : await onRecordOutbound(text);
    if (ok) {
      setText('');
      setReceivedAt('');
    }
  };

  return (
    <div className="flex flex-none flex-col gap-2.5 border-t border-ops-line bg-ops-card px-5 py-3">
      <div
        className={[
          'flex items-center gap-2 rounded-ops-card border px-3 py-2 font-ops-body text-ops-xs leading-[1.5]',
          win.state === 'open'
            ? 'border-ops-olive-line bg-ops-olive-bg text-ops-olive-dark'
            : 'border-ops-amber-line bg-ops-amber-bg text-ops-amber-dark',
        ].join(' ')}
      >
        {WINDOW_NOTE[win.state]}
      </div>

      <div className="flex items-end gap-3">
        <MultiToggle size="sm" label="Mesajın yönü" value={side} onChange={setSide} options={LEDGER_SIDES.map((s) => ({ key: s.key, label: s.label }))} />
        {side === 'inbound' ? (
          <InputField
            label="Geldiği an"
            labelAside="pencere buradan başlar"
            required
            fieldClassName="flex-none"
            type="datetime-local"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        ) : null}
      </div>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder={
          side === 'inbound'
            ? 'Müşterinin WhatsApp’tan yazdığı mesajı buraya geçirin…'
            : 'Telefonunuzdan gönderdiğiniz cevabı buraya geçirin…'
        }
      />

      <div className="flex items-center gap-3">
        <span className="mr-auto font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
          {error ? (
            <span className="font-semibold text-ops-red">{error}</span>
          ) : (
            'Buradan mesaj GÖNDERİLMEZ — yazışma telefondan yürür, buraya kaydı düşülür.'
          )}
        </span>
        <Button variant="primary" size="sm" onClick={() => void submit()} disabled={busy || blocked !== null} title={blocked ?? undefined}>
          {busy ? 'İşleniyor…' : 'Deftere işle'}
        </Button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SAĞ — müşteri bağlamı
// ─────────────────────────────────────────────────────────────────────────────

function ContextLabel({ children }: { children: string }) {
  return (
    <span className="font-ops-display text-ops-micro font-medium uppercase tracking-[0.06em] text-ops-muted">{children}</span>
  );
}

interface ContextPaneProps {
  context: ConversationContextView | null;
  phone: string;
  tickets: ConversationDetailView['tickets'];
  onNewTicket: () => void;
}

export function ContextPane({ context, phone, tickets, onNewTicket }: ContextPaneProps) {
  return (
    <div className="flex w-[232px] flex-none flex-col gap-3.5 overflow-y-auto border-l border-ops-line bg-ops-gray-25 px-4 py-3.5">
      {context ? (
        <>
          <div className="flex flex-col items-start gap-1.5">
            <span className="font-ops-display text-ops-base font-semibold text-ops-ink">{context.name}</span>
            <Badge tone={context.isDraft ? 'amber' : 'olive'}>
              {context.isDraft ? 'Taslak numara' : context.isCompany ? 'B2B müşteri' : 'B2C müşteri'}
            </Badge>
            <span className="font-ops-mono text-ops-xs text-ops-muted">{phone}</span>
          </div>

          {context.isDraft ? (
            <div className="flex flex-col gap-2 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3 py-2.5">
              <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
                Numara kayıtlı bir müşteriyle eşleşmedi — WhatsApp&apos;tan otomatik açılmış taslak kayıt.
              </span>
              {/* Birleştirme MÜŞTERİLER ekranının işi (09.10) ve orada gerçekten var; burada yalnız
                  o ekrana numarayla gidiliyor. Kendi birleştirme düğmemizi çizmek, aynı kararı iki
                  yerde yaşatmak olurdu. */}
              <Link
                href={customersUrl({ q: phone, type: 'all', scope: 'all', mc: 'any' })}
                className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-amber hover:underline"
              >
                Müşterilerde ara ve birleştir →
              </Link>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <ContextLabel>Son siparişler</ContextLabel>
            {context.orders.length === 0 ? (
              <span className="font-ops-body text-ops-xs text-ops-faint">Henüz sipariş yok.</span>
            ) : (
              context.orders.map((o) => (
                <Link
                  key={o.id}
                  href={o.href}
                  className="flex cursor-pointer items-center justify-between rounded-ops-card border border-ops-line bg-ops-card px-2.5 py-2 hover:border-ops-line-strong"
                >
                  <span className="font-ops-mono text-ops-xs text-ops-muted">{o.label}</span>
                  <span className="font-ops-mono text-ops-xs text-ops-ink">{money(o.totalCents)}</span>
                </Link>
              ))
            )}
            {/* Sınır GÖRÜNÜR: sessizce kesilen bir liste "bu müşterinin başka siparişi yok" diye
                okunur ve tam da geçmişe bakması gereken anda operatörü yanıltır. */}
            {context.orders.length === CONTEXT_ORDER_LIMIT ? (
              <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
                Son {CONTEXT_ORDER_LIMIT} sipariş — tamamı müşteri kartında.
              </span>
            ) : null}
          </div>

          <div className="flex flex-col items-start gap-1.5">
            <ContextLabel>Kampanya izni</ContextLabel>
            {/* Üç hâl AYRI: izin var · reddetti · hiç sorulmadı. `null`'ı "reddetti" saymak, GDPR
                kanıtını olmayan bir cevaba dönüştürürdü (müşteri paneliyle aynı kural). */}
            <Badge tone={context.whatsappConsent?.granted ? 'olive' : context.whatsappConsent ? 'neutral' : 'slate'}>
              {context.whatsappConsent?.granted ? 'Açık' : context.whatsappConsent ? 'Reddetti' : 'Sorulmadı'}
            </Badge>
          </div>

          <div className="flex flex-col gap-1.5">
            <ContextLabel>Bağlı talepler</ContextLabel>
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
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="font-ops-mono text-ops-sm text-ops-ink">{phone}</span>
          {/* Kimliksiz konuşma bir ARIZA DEĞİL, tasarımın bir hâli: adım 2'de webhook mesajı önce
              yazar, kimliği sonra çözer. Elle işlemede ise telefon ve e-posta ayrı müşterilere
              çıktığında konuşma bilerek bağlanmadan açılır — yanlış hesaba bağlanmış bir sohbet,
              bağlanmamış bir sohbetten pahalıdır. */}
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-body">
            Bu numara bir müşteriye bağlanmadı. Sipariş geçmişi ve izin bilgisi ancak kimlik çözülünce görünür.
          </span>
          <Link
            href={customersUrl({ q: phone, type: 'all', scope: 'all', mc: 'any' })}
            className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline"
          >
            Müşterilerde ara →
          </Link>
        </div>
      )}
    </div>
  );
}
