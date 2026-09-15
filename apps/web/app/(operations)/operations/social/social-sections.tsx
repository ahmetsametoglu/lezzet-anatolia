'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { AnchorSnapshot } from '@lezzet/application';
import type { ConversationSource, CustomerInboxThread, TicketHandler } from '@lezzet/types';
import type { CustomerContextData } from '@/lib/customer/context';
import { AiDraftCard, handlerOptions } from '@/components/operation/ui/ai-handling';
import { Badge } from '@/components/operation/ui/badge';
import { Button, buttonClass } from '@/components/operation/ui/button';
import { MultiToggle } from '@/components/operation/form/multi-toggle';
import {
  ContextConsent,
  ContextIdentity,
  ContextNotice,
  ContextOrders,
  ContextPane,
  type ConsentState,
} from '@/components/operation/ui/customer-context-pane';
import { EmptyState } from '@/components/operation/ui/empty-state';
import { AlertIcon, WhatsAppIcon } from '@/components/operation/ui/icons';
import { bubbleClass, MessageRow, MessageThread, SectionLabel } from '@/components/operation/ui/message-thread';
import { QueueRow } from '@/components/operation/ui/queue-pane';
import { SOURCE_LABELS, SOURCE_SOLID, SOURCE_TINT } from '@/components/operation/ui/conversation-source';
import { ChannelIcon } from '@/components/operation/ui/channel-icon';
import { ChatText } from '@/components/text/chat-text';
import { Textarea } from '@/components/operation/form/input';
import { useMessageDraft } from '@/components/operation/ui/use-message-draft.hook';
import { ORDERS_PATH } from '../orders/orders-url';
import { TICKETS_PATH } from '../tickets/tickets-url';
import { customersUrl } from '../customers/customers-url';
import {
  AI_OUTBOUND_LABEL,
  LANGUAGE_BASIS_NOTE,
  LANGUAGE_LABELS,
  languageLabel,
  OUTBOUND_LABEL,
  WINDOW_NOTE,
  WINDOW_TONE,
} from './social-labels';
import { humanCanReply } from './social-read';
import type { ConversationDetailView, InboxRowView, MessageView, NoteView } from './social-types';

interface ChannelDotProps {
  source: ConversationSource;
}

/** Ad `title`a ve ekran okuyucuya da yazılır: ikon tanınmasa da kanal söylenir. */
function ChannelDot({ source }: ChannelDotProps) {
  return (
    <span title={SOURCE_LABELS[source]} className={`flex items-center rounded-[5px] px-1.5 py-[3px] ${SOURCE_TINT[source]}`}>
      <ChannelIcon source={source} size={11} />
      <span className="sr-only">{SOURCE_LABELS[source]}</span>
    </span>
  );
}

interface InboxRowProps {
  row: InboxRowView;
  /** Basınca açılacak sohbet: satır bir kişidir ve birden çok sohbet taşıyabilir. */
  target: string;
  active: boolean;
  onSelect: (id: string) => void;
}

export function InboxRow({ row, target, active, onSelect }: InboxRowProps) {
  return (
    // Seçili kenar kanal renginde değil: satır bir kişidir, tek kanalın rengi birden çok kanalı olan satırı yanlış okuturdu.
    <QueueRow
      id={target}
      active={active}
      onSelect={onSelect}
      title={row.title}
      trailing={<span className="flex-none font-ops-mono text-ops-micro text-ops-faint">{row.ago}</span>}
      preview={row.preview}
      badges={
        <>
          {/* Tek kanala daralmış görünümde de bütün noktalar kalır: süzgeç kişiyi bulur, öteki kanallarını gizlemez. */}
          {row.channels.map((source) => (
            <ChannelDot key={source} source={source} />
          ))}
          {row.awaitingReply ? (
            <Badge tone="amber" dot>
              Cevap bekliyor
            </Badge>
          ) : null}
          {/* Hibrit satır da işaretlenir: bekleyen taslak ancak sohbet açılınca görünür. */}
          {row.handledBy === 'ai' ? <Badge tone="violet">AI</Badge> : null}
          {row.handledBy === 'hybrid' ? <Badge tone="violet">Hibrit</Badge> : null}
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
      title={filtered ? 'Bu süzgeçte sohbet yok' : 'Henüz konuşma yok'}
      description={
        filtered
          ? 'Süzgeçle eşleşen konuşma kalmadı. Tümü çipleriyle bütün konuşmalara dönebilirsiniz.'
          : 'Müşteri WhatsApp, Messenger ya da Instagram’dan yazdığında sohbet buraya kendiliğinden düşer.'
      }
    />
  );
}

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

/** Çizimde saat yok, burada var: pencerenin dayanağı mesajın anıdır ve saatsiz defterde "pencere neden kapalı" cevapsız kalırdı. */
export function Bubble({ message }: { message: MessageView }) {
  const mine = message.direction === 'outbound';
  // Müşteri farkı görmez ama operatör görmeli: "bunu kim söyledi" sonradan da cevaplanabilmeli.
  const ai = message.author === 'ai';
  // Çeviri orijinalin yerine geçmez, bir tık uzakta durur: gelen mesajda müşterinin cümlesi, giden mesajda müşterinin gerçekte okuduğu cümle.
  const [showOriginal, setShowOriginal] = useState(false);
  const original = message.translation && showOriginal ? message.translation : null;
  const transcript = original && message.mediaTranscript ? original.original : message.mediaTranscript;
  const text = original && !message.mediaTranscript ? original.original : message.text;
  return (
    <MessageRow
      side={mine ? 'out' : 'in'}
      meta={
        <>
          {mine ? (
            <span className={`font-ops-display text-ops-micro font-semibold ${ai ? 'text-ops-violet' : 'text-ops-olive-dark'}`}>
              {ai ? AI_OUTBOUND_LABEL : OUTBOUND_LABEL}
            </span>
          ) : null}
          <span className="font-ops-mono text-ops-micro text-ops-faint">{message.stamp}</span>
          {/* Kalıp etiketi rozet değil künyedir: mesajın değil, ücret sınıfının notu. */}
          {message.templateLabel ? (
            <span className="font-ops-body text-ops-micro text-ops-amber">· kalıp: {message.templateLabel}</span>
          ) : null}
        </>
      }
    >
      {/* Biçimli çizilir: müşteri `*kalın*`ı WhatsApp'ta çizili görüyor, operatör aynı cümleyi farklı okumamalı. */}
      <div className={bubbleClass(ai ? 'violet' : mine ? 'olive' : 'neutral', 'flex flex-col gap-2')}>
        <MediaBody message={message} transcript={transcript} lang={original?.language ?? undefined} />
        {/* Orijinal gösterilirken dili söylenir: tarayıcı çevirisi Fransızcayı Türkçe sanmasın. */}
        {text ? <ChatText text={text} lang={original && !message.mediaTranscript ? (original.language ?? undefined) : undefined} /> : null}
      </div>
      {message.translation ? (
        <span className={`flex items-center gap-2 ${mine ? 'self-end' : ''}`}>
          {/* Mor, makine konuştu demektir: gelen mesajda ekrandaki, giden mesajda müşteriye giden cümle makine çevirisidir. */}
          <Badge tone="violet">
            {mine
              ? `${languageLabel(message.translation.language)} gönderildi`
              : `otomatik çevrildi · ${languageLabel(message.translation.language)}`}
          </Badge>
          <button
            type="button"
            onClick={() => setShowOriginal((v) => !v)}
            className="cursor-pointer font-ops-body text-ops-micro font-semibold text-ops-olive-dark underline-offset-2 hover:underline"
          >
            {showOriginal ? (mine ? 'Türkçesini göster' : 'Çeviriyi göster') : mine ? 'Gönderileni göster' : 'Orijinali göster'}
          </button>
        </span>
      ) : null}
    </MessageRow>
  );
}

interface NoteLineProps {
  note: NoteView;
}

/** Ortada ve kesikli: bir yana hizalansaydı o tarafın mesajı sanılırdı. Künyedeki "müşteri görmez", notun müşteriye yazılmış sanılmaması için. */
export function NoteLine({ note }: NoteLineProps) {
  const ai = note.author === 'ai';
  return (
    <div className="flex flex-col items-center gap-1 px-6">
      <span className="font-ops-mono text-ops-micro text-ops-faint">{note.stamp} · iç not — müşteri görmez</span>
      <p
        className={`max-w-[78%] whitespace-pre-wrap rounded-ops-card border border-dashed px-3 py-1.5 text-center font-ops-body text-ops-xs ${
          ai ? 'border-ops-violet-line bg-ops-violet-bg text-ops-violet' : 'border-ops-line bg-ops-card text-ops-muted'
        }`}
      >
        {note.text}
      </p>
    </div>
  );
}

/** Adres yoksa gövde yine çizilir: mesaj kaybolmadı, yalnız dosyası elimizde yok. */
function MediaBody({ message, transcript, lang }: { message: MessageView; transcript: string | null; lang?: string }) {
  if (message.kind !== 'media') return null;

  const mime = message.mediaMime ?? '';
  if (!message.mediaUrl) {
    return <span className="font-ops-body text-ops-micro text-ops-faint">Medya dosyası alınamadı — mesaj kaydedildi.</span>;
  }
  if (mime.startsWith('image/')) {
    return (
      /* Tam boy yeni sekmede: ezik kutunun köşesi önizlemede görünmez, operatör kanıta yakından bakabilmeli. */
      <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="cursor-pointer transition-opacity hover:opacity-80">
        {/* Ham `<img>`: geçidin yönlendirdiği adres süreli, `next/image` önbelleğinde kırık kayıt kalırdı. */}
        <img src={message.mediaUrl} alt="Müşterinin gönderdiği görsel" className="max-h-72 w-auto rounded-ops-sm" />
      </a>
    );
  }
  if (mime.startsWith('audio/')) {
    return (
      <div className="flex flex-col gap-1.5">
        {/* Genişlik sabit: balon içeriğe göre daralır ve transkriptsiz balonda `w-full` oynatıcıyı sıfıra çekerdi. */}
        <audio controls src={message.mediaUrl} className="w-72 max-w-full" />
        {/* Çözülmüş metin kaydın altında ve künyeli: makine duyduğunu yazdı ve yanılmış olabilir, müşterinin yazdığı sanılmamalı. */}
        {transcript ? (
          <>
            <span className="font-ops-mono text-ops-micro text-ops-faint">yazıya çevrildi · makine</span>
            <span lang={lang} className="whitespace-pre-wrap font-ops-body text-ops-micro italic text-ops-lead">
              {transcript}
            </span>
          </>
        ) : null}
      </div>
    );
  }
  return (
    <a href={message.mediaUrl} target="_blank" rel="noreferrer" className="cursor-pointer font-ops-body text-ops-micro underline">
      Dosyayı aç
    </a>
  );
}

interface ChannelTabsProps {
  threads: readonly CustomerInboxThread[];
  activeId: string;
  onSelect: (conversationId: string) => void;
  /** Yüzen pencerenin dar hâli: kanal adı `title`da ve pencerenin künyesinde. */
  compact?: boolean;
}

/** Seçili olmayan sekmede top bizdeyse amber nokta: okunmadı sayacı yok, son sözü müşteri söylediyse o kanal cevap bekliyor. */
export function ChannelTabs({ threads, activeId, onSelect, compact = false }: ChannelTabsProps) {
  return (
    <div role="tablist" aria-label="Müşterinin kanalları" className="flex flex-wrap items-center gap-1.5">
      {threads.map((thread) => {
        const active = thread.id === activeId;
        return (
          <button
            key={thread.id}
            type="button"
            role="tab"
            aria-selected={active}
            title={`${SOURCE_LABELS[thread.source]} · ${thread.messageCount} mesaj`}
            onClick={() => {
              if (!active) onSelect(thread.id);
            }}
            className={[
              'flex cursor-pointer items-center gap-1.5 rounded-[7px] border font-ops-display text-ops-micro font-semibold transition-opacity hover:opacity-80',
              compact ? 'px-2 py-1' : 'px-2.5 py-[5px]',
              active ? SOURCE_SOLID[thread.source] : SOURCE_TINT[thread.source],
            ].join(' ')}
          >
            <ChannelIcon source={thread.source} size={12} />
            {compact ? null : SOURCE_LABELS[thread.source]}
            <span className="font-ops-mono opacity-80">{thread.messageCount}</span>
            {!active && thread.awaitingReply ? <span aria-label="cevap bekliyor" className="h-1.5 w-1.5 rounded-full bg-ops-amber-dot" /> : null}
          </button>
        );
      })}
    </div>
  );
}

interface ConversationPaneProps {
  detail: ConversationDetailView;
  busy: boolean;
  error: string | null;
  onSendReply: (text: string) => Promise<boolean>;
  onMode: (mode: TicketHandler) => void;
  onConsumeDraft: () => Promise<string | null>;
  onSuggestDraft: () => void;
  onSelectThread: (conversationId: string) => void;
}

export function ConversationPane({ detail, busy, error, onSendReply, onMode, onConsumeDraft, onSuggestDraft, onSelectThread }: ConversationPaneProps) {
  // Nesne kimliği tetikleyicidir: aynı taslak ikinci kez de taşınabilsin.
  const [prefill, setPrefill] = useState<{ text: string } | null>(null);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-ops-gray-25">
      {/* Başlık bir müşteri adıdır ve kişinin iki kanalda iki sohbeti olabilir; hangisine bakıldığını seçili sekme söyler.
          Satırlar sarar: dar sohbet sütununda sığmayan denetimler alt satıra düşer. */}
      <div className="flex flex-none flex-col gap-2.5 border-b border-ops-line bg-ops-card px-5 py-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="min-w-0 truncate font-ops-display text-ops-lead font-semibold text-ops-ink">{detail.title}</span>
          {detail.context ? (
            <Badge tone={detail.context.isDraft ? 'amber' : 'olive'}>
              {detail.context.isDraft ? 'Taslak kayıt' : detail.context.isCompany ? 'B2B müşteri' : 'B2C müşteri'}
            </Badge>
          ) : (
            <Badge tone="amber">Kimlik yok</Badge>
          )}
          <span className="font-ops-body text-ops-xs text-ops-faint">{LANGUAGE_LABELS[detail.language.language]}</span>
          <span className="ml-auto flex flex-none items-center gap-2.5">
            <Badge tone={WINDOW_TONE[detail.window.tone]}>{detail.window.chip}</Badge>
            {/* Yalnız kimlik çözülmüşken: köprü müşteri önseçili girişi açar. Kaynağı sunucu konuşmadan çözer; kanalı adrese
                yazdırmak raporlardaki dağılımı elle düzenlenebilir kılardı. */}
            {detail.context ? (
              <Link
                href={`${ORDERS_PATH}/new?conversation=${detail.id}`}
                className={buttonClass({ variant: 'secondary', size: 'sm', className: 'flex-none whitespace-nowrap' })}
              >
                Sipariş oluştur
              </Link>
            ) : null}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <ChannelTabs threads={detail.threads} activeId={detail.id} onSelect={onSelectThread} />
          <span className="min-w-0 flex-1 font-ops-body text-ops-xs text-ops-muted">
            {detail.messageCount} mesaj ·{' '}
            {/* Anahtar seçimi gösterir, cümle durumu okur. */}
            {detail.handledBy === 'ai'
              ? 'AI ajanı yürütüyor — gerekirse Devral ile araya girin'
              : detail.handledBy === 'hybrid'
                ? 'hibrit — AI taslak yazar'
                : 'insan yürütüyor'}
          </span>
          <MultiToggle size="sm" label="Yürütücü modu" value={detail.handledBy} options={handlerOptions(busy)} onChange={onMode} />
          {/* Özerk modun emniyet kemeri: müşteri yanlış anlaşıldığında beklenecek bir cron turu olmamalı. */}
          {detail.handledBy === 'ai' ? (
            <Button size="sm" variant="violet" className="flex-none" onClick={() => onMode('human')} disabled={busy}>
              Devral
            </Button>
          ) : null}
        </div>
      </div>

      {detail.thread.length === 0 ? (
        <div className="flex min-h-0 flex-1 items-center justify-center">
          <EmptyState
            title="Bu konuşmada henüz mesaj yok"
            description="Konuşma açıldı; müşteriden ya da bizden henüz mesaj yok."
          />
        </div>
      ) : (
        <MessageThread className="px-5 py-4">
          {detail.thread.map((item) =>
            item.kind === 'message' ? <Bubble key={item.message.id} message={item.message} /> : <NoteLine key={item.note.id} note={item.note} />,
          )}
        </MessageThread>
      )}

      {/* Pencere kapalıyken taşınacak kutu yok: kart yine görünür, eylem yerine sebep yazar. */}
      {detail.handledBy === 'hybrid' ? (
        <div className="flex flex-none flex-col border-t border-ops-line bg-ops-card px-5 pt-3">
          {detail.aiDraft ? (
            <AiDraftCard draft={detail.aiDraft}>
              {humanCanReply(detail.window) ? (
                <Button
                  size="sm"
                  variant="violet"
                  disabled={busy}
                  onClick={() => {
                    void onConsumeDraft().then((draft) => {
                      if (draft) setPrefill({ text: draft });
                    });
                  }}
                >
                  Cevap kutusuna taşı
                </Button>
              ) : (
                <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
                  Pencere kapalı — serbest mesaj gönderilemediği için taslak da gönderilemez.
                </span>
              )}
            </AiDraftCard>
          ) : (
            // Cron beş dakikada bir üretir; operatör beklemek zorunda değil.
            <div className="flex items-center gap-2.5 pb-1">
              <Button size="sm" variant="violet" onClick={onSuggestDraft} disabled={busy}>
                ✦ Taslak öner
              </Button>
              <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
                Hibrit mod — AI taslağı yok; düğmeyle şimdi üretin ya da turu bekleyin (5 dk'da bir).
              </span>
            </div>
          )}
        </div>
      ) : null}

      <ReplyBox
        // Kutu sohbet başına kurulur ve o sohbetin taslağını okur: yarım metin bir sonraki müşterinin kutusunda durmaz.
        key={detail.id}
        conversationId={detail.id}
        source={detail.source}
        window={detail.window}
        language={detail.language}
        busy={busy}
        error={error}
        prefill={prefill}
        onSendReply={onSendReply}
      />
    </div>
  );
}

interface ReplyBoxProps {
  /** Yazı sohbet başına saklanır: pencere ile sayfa aynı taslağı görür. */
  conversationId: string;
  source: ConversationDetailView['source'];
  window: ConversationDetailView['window'];
  language: ConversationDetailView['language'];
  busy: boolean;
  error: string | null;
  /** Nesne kimliği değişince kutuya yazılır. */
  prefill?: { text: string } | null;
  onSendReply: (text: string) => Promise<boolean>;
}

/** Pencere kapalıyken kutu hiç çizilmez: serbest metin kanalda da gönderilemez. Bandın cümlesi kanala göre seçilir (`WINDOW_NOTE`). */
export function ReplyBox({ conversationId, source, window: win, language, busy, error, prefill, onSendReply }: ReplyBoxProps) {
  // Yazı kabuğun taslak deposunda: pencere kapanıp açılınca, tam ekrana geçince ve ekran değişince yerinde kalır.
  const [text, setText] = useMessageDraft(conversationId);

  // Operatör Türkçe yazar, mesaj müşterinin diline çevrilerek gider: bunu görmeden gönderen müşterinin Fransızca okuduğunu bilmez.
  const dilNotu =
    language.language === 'tr'
      ? `Müşteriyle Türkçe yazışılıyor (${LANGUAGE_BASIS_NOTE[language.basis]}).`
      : `Türkçe yazın — müşteriye ${LANGUAGE_LABELS[language.language]} çevrilerek gider (${LANGUAGE_BASIS_NOTE[language.basis]}).`;

  // Taslağı operatör kendisi taşıdı; basılan düğme "bu metinle çalışacağım" demek, kutudakini ezmesi bu yüzden kabul.
  useEffect(() => {
    if (prefill) setText(prefill.text);
  }, [prefill, setText]);

  const submit = async () => {
    if (!text.trim()) return;
    if (await onSendReply(text)) setText('');
  };

  if (!humanCanReply(win)) {
    return (
      <div className="flex flex-none border-t border-ops-line bg-ops-card px-5 py-3">
        <div className="flex w-full items-center gap-2.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3.5 py-2.5">
          <span className="flex-none text-ops-amber">
            <AlertIcon size={16} />
          </span>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">{WINDOW_NOTE[source][win.state]}</span>
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
          placeholder="Cevabınızı yazın…"
        />
        <Button variant="primary" className="flex-none whitespace-nowrap" onClick={() => void submit()} disabled={busy || !text.trim()}>
          {busy ? 'Gönderiliyor…' : 'Gönder'}
        </Button>
      </div>
      <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">
        {error ? (
          <span className="font-semibold text-ops-red">{error}</span>
        ) : (
          <>
            {win.state === 'human'
              ? `${WINDOW_NOTE[source].human} ${win.chip} kaldı · yapay zekâ bu sürede yazamaz.`
              : `${WINDOW_NOTE[source].open} ${win.chip} kaldı · bu süre içinde cevap ücretsizdir.`}
          </>
        )}
      </span>
      <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-faint">{dilNotu}</span>
    </div>
  );
}

/**
 * Sistemin kendi başına bitiremediği tek hâl: cevap gelmezse sessizce bekleyen bir insan kalır ve sistem bunu bir daha
 * hatırlatmaz. Sipariş sayısı aciliyettir: soru açıkken gelen siparişler doğrulanmamış birinin, başkasının kaydına yazılıyor olabilir.
 */
function PendingChallenge({ challenge }: { challenge: AnchorSnapshot['challenge'] }) {
  if (!challenge) return null;

  const gun = Math.floor((Date.now() - new Date(challenge.raisedAt).getTime()) / 86_400_000);
  const sebep = challenge.reason === 'delivery_failed' ? 'taşıyıcı ulaşamadı' : 'uzun sessizlik';

  return (
    <div className="mt-1 flex w-full flex-col gap-0.5 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-2.5 py-2">
      <span className="font-ops-body text-ops-xs font-semibold text-ops-amber-dark">Kimlik sorusu cevapsız · {sebep}</span>
      <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
        {gun === 0 ? 'Bugün soruldu' : `${gun} gündür bekliyor`}
        {challenge.ordersSince > 0
          ? ` · o gün bugündür ${challenge.ordersSince} sipariş geldi. Numara devredilmiş olabilir — kayıtları ayırmayı değerlendirin.`
          : ' · sonrasında sipariş gelmedi.'}
      </span>
    </div>
  );
}

interface AnchorRowProps {
  anchor: AnchorSnapshot;
  busy: boolean;
  /** Bağlantı sohbete mesajdır: pencere kapalıyken düğme çizilmez. */
  canMessage: boolean;
  onSendLink: () => void;
}

/**
 * Çapayı müşteri kurar: hesap bağlantısını açıp e-postasıyla girer, doğrulama yalnız kendi posta kutusundan geçer. Operatör kod
 * üretmez; hesabını bağlamayan müşterinin güvenlik kodu otomatik akıştadır (`offerAnchorIfDue`) ve rozet onu da okur.
 */
function AnchorRow({ anchor, busy, canMessage, onSendLink }: AnchorRowProps) {
  const kurulu = anchor.state !== 'none';
  const rozet: { label: string; tone: 'olive' | 'slate' } = kurulu
    ? { label: anchor.state === 'email' ? 'E-posta bağlı' : 'Kod verildi', tone: 'olive' }
    : { label: 'Kurulmadı', tone: 'slate' };

  return (
    <div className="flex flex-col items-start gap-1.5">
      <SectionLabel>Kimlik çapası</SectionLabel>
      <div className="flex items-center gap-2">
        <Badge tone={rozet.tone}>{rozet.label}</Badge>
        {!kurulu && canMessage ? (
          <button
            type="button"
            disabled={busy}
            onClick={onSendLink}
            className="cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline disabled:cursor-not-allowed disabled:opacity-50"
          >
            Bağlantı gönder →
          </button>
        ) : null}
      </div>
      {kurulu ? <PendingChallenge challenge={anchor.challenge} /> : null}
    </div>
  );
}

interface LinkedTicketsProps {
  tickets: ConversationDetailView['tickets'];
}

/** Boşken hiç çizilmez: "açılmadı" cümlesi bir iş yaptırmıyordu. */
function LinkedTickets({ tickets }: LinkedTicketsProps) {
  if (tickets.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <SectionLabel>Bağlı talepler</SectionLabel>
      {tickets.map((t) => (
        <Link
          key={t.id}
          href={`${TICKETS_PATH}?t=${t.id}`}
          className="flex cursor-pointer flex-col rounded-ops-card border border-ops-line bg-ops-card px-2.5 py-2 hover:border-ops-line-strong"
        >
          <span className="truncate font-ops-body text-ops-xs text-ops-ink">{t.subject}</span>
          <span className="font-ops-body text-ops-micro text-ops-muted">{t.statusLabel}</span>
        </Link>
      ))}
    </div>
  );
}

interface SocialContextPaneProps {
  context: CustomerContextData | null;
  externalRef: string;
  source: ConversationDetailView['source'];
  profileName: string | null;
  tickets: ConversationDetailView['tickets'];
  consent: ConsentState;
  anchor: AnchorSnapshot | null;
  /** Bağlantı düğmeleri sohbete mesaj gönderir; pencere kapalıyken gönderim reddedilir ve düğmeler çizilmez. */
  canMessage: boolean;
  busy: boolean;
  onNewTicket: () => void;
  onOptIn: (granted: boolean) => void;
  onSendCartLink: () => void;
  onSendAccountLink: () => void;
}

export function SocialContextPane({
  context,
  externalRef,
  source,
  profileName,
  tickets,
  consent,
  anchor,
  canMessage,
  busy,
  onNewTicket,
  onOptIn,
  onSendCartLink,
  onSendAccountLink,
}: SocialContextPaneProps) {
  const whatsapp = source === 'whatsapp';
  // WhatsApp'ta numara kesin eşleşir; Messenger/Instagram'da elde yalnız görünen ad var ve arama yalnız aday verir.
  const searchHref = customersUrl({ q: whatsapp ? externalRef : (profileName ?? ''), type: 'all', scope: 'all', mc: 'any' });

  if (!context) {
    return (
      <ContextPane>
        <div className="flex flex-col items-start gap-1.5">
          {/* PSID/IGSID gösterilmez: operatöre bir şey söylemez, profil adı söyler. */}
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">
            {whatsapp ? externalRef : (profileName ?? 'İsimsiz profil')}
          </span>
          <Badge tone="amber">Kimlik yok</Badge>
        </div>
        {/* Kimliksiz sohbet arıza değil: Messenger/Instagram'da varsayılan hâl, WhatsApp'ta çakışmada bilerek bağlanmadan açılır. */}
        <ContextNotice>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
            {whatsapp ? 'Numara bir müşteriye bağlanmadı.' : 'Sohbet bir müşteriye bağlı değil.'} Bağı müşteri kurar: hesap
            bağlantısını açıp e-postasıyla girer.
          </span>
        </ContextNotice>
        {canMessage ? (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onSendAccountLink}>
            Hesap bağlantısı gönder
          </Button>
        ) : null}
      </ContextPane>
    );
  }

  return (
    <ContextPane>
      {/* WhatsApp'ta ad müşteri ekranına numarayla gider: aynı adlı iki müşteriyi ad araması birlikte getirirdi. */}
      <ContextIdentity context={context} href={searchHref} />

      {/* Elle birleştirme Müşteriler ekranının işi; WhatsApp taslağı müşteri hesap bağlantısıyla girince kendiliğinden birleşir. */}
      {context.isDraft ? (
        <ContextNotice>
          <span className="font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark">
            {whatsapp
              ? 'Numara kayıtlı müşteriyle eşleşmedi — taslak kayıt. Müşteri hesap bağlantısıyla girince kayıt hesabına birleşir.'
              : 'Sohbetten açılmış taslak kayıt.'}
          </span>
        </ContextNotice>
      ) : null}

      <ContextOrders context={context} />

      {/* Kaydın yeri menüde söylenir: WhatsApp'ta müşteri kartına da işlenir, Messenger/Instagram'da yalnız sohbete. */}
      <ContextConsent
        state={consent}
        onRecord={onOptIn}
        busy={busy}
        recordHint={whatsapp ? 'Müşteri kartına da işlenir.' : `Yalnız bu ${SOURCE_LABELS[source]} sohbetine yazılır.`}
      />

      {anchor ? <AnchorRow anchor={anchor} busy={busy} canMessage={canMessage} onSendLink={onSendAccountLink} /> : null}

      <LinkedTickets tickets={tickets} />

      {canMessage ? (
        <Button variant="secondary" size="sm" disabled={busy} onClick={onSendCartLink}>
          Sepet bağlantısı gönder
        </Button>
      ) : null}
      <Button variant="danger" size="sm" onClick={onNewTicket}>
        Talep (şikâyet) aç
      </Button>
    </ContextPane>
  );
}
