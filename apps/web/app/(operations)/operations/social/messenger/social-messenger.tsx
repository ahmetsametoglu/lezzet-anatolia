'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { alertAllowed, hasNewInbound } from '@lezzet/domain-core';
import { conversationChannelName, type KeysetCursor } from '@lezzet/types';
import { Badge } from '@/components/operation/ui/badge';
import { ArrowLeftIcon, ChatIcon, XIcon } from '@/components/operation/ui/icons';
import { MessageThread } from '@/components/operation/ui/message-thread';
import { Skeleton } from '@/components/operation/ui/skeleton';
import { useBell } from '@/components/operation/ui/use-bell.hook';
import { playMessageChime, unlockMessageChime } from '@/components/operation/ui/message-chime';
import { SOURCE_LABELS } from '@/components/operation/ui/conversation-source';
import { SocialMessengerContext, type SocialMessengerApi } from '@/components/operation/ui/use-social-messenger.hook';
import { MessageDraftContext, type MessageDraftStore } from '@/components/operation/ui/use-message-draft.hook';
import { appendToDraft, chatTargetOf, type MessengerContext } from '@/components/operation/ui/customer-channel-model';
import { customerChannelsAction } from '@/lib/messaging/customer-channel-actions';
import { loadMoreConversationsAction, sendOutboundAction } from '../actions';
import { WINDOW_TONE } from '../social-labels';
import { humanCanReply } from '../social-read';
import { Bubble, ChannelTabs, InboxRow, NoteLine, ReplyBox } from '../social-sections';
import { SOCIAL_PATH, socialLink } from '../social-url';
import type { ConversationDetailView, InboxRowView } from '../social-types';
import { messengerConversationAction, messengerPulseAction, startWhatsappConversationAction } from './actions';

/**
 * Operasyon müşteriye yalnız uygulamanın içinden yazar (`wa.me` ve personelin kendi telefonu yok); bu pencere o kuralın web ayağı.
 * Parçalar sohbet sayfasınınki (`InboxRow`, `Bubble`, `ReplyBox`, `ChannelTabs`): kopya parça, aynı sohbetin bir gün iki yerde farklı çizilmesi demekti.
 */

interface SocialMessengerProviderProps {
  /** Yalnız yönetici: pencere ikinci bir yetki yolu değil, sohbet sayfasına kısayoldur. */
  enabled: boolean;
  /** Kanal adı sunucu sırrından türer, bu yüzden layout'tan gelir (`conversationsChannelName`). */
  inboxChannel: string | null;
  children: ReactNode;
}

export function SocialMessengerProvider({ enabled, inboxChannel, children }: SocialMessengerProviderProps) {
  const pathname = usePathname();
  const onSocialPage = pathname?.startsWith(SOCIAL_PATH) ?? false;

  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [context, setContext] = useState<MessengerContext | null>(null);
  // `null` = henüz ölçülmedi: rozet uydurulmaz, "0" iş yok derdi.
  const [awaiting, setAwaiting] = useState<number | null>(null);
  // Kuyruk zili tek yerde dinlenir, liste bu sayaçla haberdar olur: aynı kanala iki abonelik açılmasın.
  const [inboxTick, setInboxTick] = useState(0);

  // `undefined` = henüz ölçülmedi: açılıştaki ilk ölçüm taban çizgisidir, zaten bekleyen mesajlar ses çaldırmaz.
  const latestInbound = useRef<string | null | undefined>(undefined);
  const lastChimeAt = useRef<number | null>(null);

  const pulse = useCallback(() => {
    void messengerPulseAction().then(({ data }) => {
      if (data === null) return;
      setAwaiting(data.awaiting);
      const now = Date.now();
      if (hasNewInbound(latestInbound.current, data.latestInboundAt) && alertAllowed(lastChimeAt.current, now)) {
        lastChimeAt.current = now;
        playMessageChime();
      }
      latestInbound.current = data.latestInboundAt;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    pulse();
    // Tarayıcı sesi ancak kişi sayfaya bir kez dokunduktan sonra çaldırır; kilidi ilk dokunuş açar.
    return unlockMessageChime();
  }, [enabled, pulse]);

  // Nabız her ekranda ve sekme arka plandayken de dinlenir: ses tam da operatör başka sekmedeyken gerekir.
  useBell(enabled ? inboxChannel : null, pulse, { whileHidden: 'run' });
  // Liste yalnız görünürken tazelenir: gizli sekmede tur harcanmaz.
  useBell(enabled && open && !onSocialPage ? inboxChannel : null, () => setInboxTick((tick) => tick + 1));

  // Taslak deposu kabuğun ömrü boyunca yaşar: sayfanın cevap kutusu da buradan okur, "Tam ekran"a geçince yarım cümle taşınır.
  const drafts = useRef(new Map<string, string>());
  const draftStore = useMemo<MessageDraftStore>(
    () => ({
      read: (id) => drafts.current.get(id) ?? '',
      write: (id, text) => {
        if (text) drafts.current.set(id, text);
        else drafts.current.delete(id);
      },
    }),
    [],
  );

  const openConversation = useCallback((id: string, ctx?: MessengerContext) => {
    setOpen(true);
    setNotice(null);
    setContext(ctx ?? null);
    setConversationId(id);
  }, []);

  // Sohbeti bulan iş ya sohbet kimliği döner ya operatöre söylenecek sebebi: sessiz boş pencere olmaz.
  const openVia = useCallback((resolve: () => Promise<OpenOutcome>, ctx?: MessengerContext) => {
    setOpen(true);
    setConversationId(null);
    setNotice(null);
    setContext(ctx ?? null);
    setOpening(true);
    void resolve().then((outcome) => {
      setOpening(false);
      if ('conversationId' in outcome) setConversationId(outcome.conversationId);
      else setNotice(outcome.notice);
    });
  }, []);

  const startWhatsapp = useCallback(
    (customerId: string, ctx?: MessengerContext) => openVia(() => whatsappOutcome(customerId), ctx),
    [openVia],
  );

  const openForCustomer = useCallback(
    (customerId: string, ctx?: MessengerContext) =>
      openVia(async () => {
        const { data, error } = await customerChannelsAction(customerId);
        if (!data) return { notice: error ?? 'Sohbet kanalları okunamadı.' };
        const target = chatTargetOf(data);
        if (target.kind === 'conversation') return { conversationId: target.conversationId };
        if (target.kind === 'start_whatsapp') return whatsappOutcome(customerId);
        return { notice: 'Bu müşteri bize hiçbir kanaldan yazmadı ve telefonu kayıtlı değil — yazılacak kanal yok.' };
      }, ctx),
    [openVia],
  );

  const api = useMemo<SocialMessengerApi | null>(
    () => (enabled ? { openConversation, openForCustomer, startWhatsapp } : null),
    [enabled, openConversation, openForCustomer, startWhatsapp],
  );

  const close = () => {
    setOpen(false);
    setNotice(null);
  };

  return (
    <MessageDraftContext.Provider value={draftStore}>
      <SocialMessengerContext.Provider value={api}>
        {children}
        {/* Sohbet sayfasında pencere çizilmez: aynı sohbet iki yerde açık kalır ve aynı zile iki abonelik düşerdi.
            Katman `Dialog`un (z-50) üstünde: geri çağırma penceresinden açılınca örtünün arkasında kalmasın. */}
        {enabled && open && !onSocialPage ? (
          <section
            role="dialog"
            aria-label="Mesajlar"
            className="fixed right-5 bottom-[84px] z-[55] flex h-[min(600px,calc(100vh-110px))] w-[380px] flex-col overflow-hidden rounded-ops-card border border-ops-line bg-ops-card shadow-[0_24px_70px_rgba(20,22,18,0.4)] print:hidden"
          >
            {conversationId ? (
              <ConversationView
                key={conversationId}
                conversationId={conversationId}
                context={context}
                // Kişinin öteki kanalı: aynı kişi, bağlam kalır.
                onSelectThread={setConversationId}
                onBack={() => setConversationId(null)}
                onClose={close}
              />
            ) : (
              <ListView
                opening={opening}
                notice={notice}
                awaiting={awaiting}
                tick={inboxTick}
                onSelect={(id) => {
                  setNotice(null);
                  // Listeden seçilen sohbet açan ekranın müşterisi olmayabilir; bağlam düşer.
                  setContext(null);
                  setConversationId(id);
                }}
                onClose={close}
              />
            )}
          </section>
        ) : null}
        {enabled && !onSocialPage ? <MessengerFab open={open} awaiting={awaiting} onToggle={() => (open ? close() : setOpen(true))} /> : null}
      </SocialMessengerContext.Provider>
    </MessageDraftContext.Provider>
  );
}

type OpenOutcome = { conversationId: string } | { notice: string };

async function whatsappOutcome(customerId: string): Promise<OpenOutcome> {
  const { data, error } = await startWhatsappConversationAction(customerId);
  return data ? { conversationId: data.conversationId } : { notice: error ?? 'WhatsApp sohbeti açılamadı.' };
}

interface MessengerFabProps {
  open: boolean;
  awaiting: number | null;
  onToggle: () => void;
}

function MessengerFab({ open, awaiting, onToggle }: MessengerFabProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={open ? 'Mesaj penceresini kapat' : 'Mesajlar'}
      aria-expanded={open}
      className="fixed right-5 bottom-5 z-40 flex h-13 w-13 cursor-pointer items-center justify-center rounded-full bg-ops-olive text-ops-card shadow-[0_8px_24px_rgba(20,22,18,0.12)] transition-colors hover:bg-ops-olive-dark print:hidden"
    >
      {open ? <XIcon size={20} /> : <ChatIcon size={22} />}
      {!open && awaiting !== null && awaiting > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-ops-red px-1 font-ops-mono text-ops-micro font-semibold text-ops-card">
          {awaiting > 99 ? '99+' : awaiting}
        </span>
      ) : null}
    </button>
  );
}

interface CloseButtonProps {
  onClose: () => void;
}

function CloseButton({ onClose }: CloseButtonProps) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Pencereyi kapat"
      className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-ops-btn text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
    >
      <XIcon size={14} />
    </button>
  );
}

interface ListViewProps {
  opening: boolean;
  /** Liste yine görünür: operatör başka sohbete geçebilir. */
  notice: string | null;
  awaiting: number | null;
  /** Değişince liste sunucudan yeniden okunur. */
  tick: number;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function ListView({ opening, notice, awaiting, tick, onSelect, onClose }: ListViewProps) {
  // `null` = ilk okuma bitmedi: "sohbet yok" yazılmaz, iskelet çizilir.
  const [rows, setRows] = useState<InboxRowView[] | null>(null);
  const [cursor, setCursor] = useState<KeysetCursor | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  // Zil gelince sayfalar sıfırlanır: yeni mesaj bir satırı tepeye taşımış olabilir.
  useEffect(() => {
    void loadMoreConversationsAction('', null).then(({ data, error: actionError }) => {
      if (!data) {
        setError(actionError ?? 'Sohbetler okunamadı.');
        return;
      }
      setError(null);
      setRows(data.rows);
      setCursor(data.nextCursor);
    });
  }, [tick]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreConversationsAction('', cursor)
      .then(({ data }) => {
        // Düşen devam sessiz değil: düğme yerinde kalır ve yeniden denenebilir.
        if (!data) return;
        setRows((prev) => [...(prev ?? []), ...data.rows]);
        setCursor(data.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  return (
    <>
      <header className="flex flex-none items-center gap-2 border-b border-ops-line px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="font-ops-display text-ops-base font-semibold text-ops-ink">Sosyal Mesajlar</span>
          {awaiting !== null ? <span className="font-ops-body text-ops-micro text-ops-muted">{awaiting} cevap bekliyor</span> : null}
        </div>
        <Link
          href={SOCIAL_PATH}
          onClick={onClose}
          className="flex-none cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline"
        >
          Tümü →
        </Link>
        <CloseButton onClose={onClose} />
      </header>
      {opening ? (
        <p className="flex-none border-b border-ops-line px-4 py-2 font-ops-body text-ops-xs text-ops-muted">
          Müşterinin sohbeti açılıyor…
        </p>
      ) : null}
      {notice ? (
        <p
          role="alert"
          className="flex-none border-b border-ops-amber-line bg-ops-amber-bg px-4 py-2 font-ops-body text-ops-xs leading-[1.5] text-ops-amber-dark"
        >
          {notice}
        </p>
      ) : null}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {error ? (
          <p className="px-4 py-3 font-ops-body text-ops-xs text-ops-red">{error}</p>
        ) : rows === null ? (
          <div className="flex flex-col gap-3 px-4 py-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <Skeleton className="h-3 w-2/5" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-3 font-ops-body text-ops-xs text-ops-muted">Henüz sohbet yok.</p>
        ) : (
          rows.map((row) => <InboxRow key={row.id} row={row} target={row.id} active={false} onSelect={onSelect} />)
        )}
        {cursor ? (
          <button
            type="button"
            onClick={loadMore}
            disabled={loadingMore}
            className="cursor-pointer px-4 py-2.5 text-left font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline disabled:cursor-wait disabled:opacity-60"
          >
            {loadingMore ? 'Yükleniyor…' : 'Daha eski sohbetler'}
          </button>
        ) : null}
      </div>
    </>
  );
}

interface ConversationViewProps {
  conversationId: string;
  context: MessengerContext | null;
  onSelectThread: (conversationId: string) => void;
  onBack: () => void;
  onClose: () => void;
}

function ConversationView({ conversationId, context, onSelectThread, onBack, onClose }: ConversationViewProps) {
  const [detail, setDetail] = useState<ConversationDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  // "Ekle", sayfanın "Cevap kutusuna taşı"sıyla aynı kapıdan yazar.
  const [prefill, setPrefill] = useState<{ text: string } | null>(null);
  const drafts = useContext(MessageDraftContext);

  const addContext = () => {
    if (context) setPrefill({ text: appendToDraft(drafts?.read(conversationId) ?? '', context.summary) });
  };

  const load = useCallback(() => {
    void messengerConversationAction(conversationId).then(({ data, error: actionError }) => {
      if (!data) {
        setError(actionError ?? 'Sohbet okunamadı.');
        return;
      }
      setError(null);
      setDetail(data);
    });
  }, [conversationId]);

  useEffect(() => {
    load();
  }, [load]);
  // Sohbetin kendi zili: transkript ve çeviri mesajdan saniyeler sonra yazılır.
  useBell(conversationChannelName(conversationId), load);

  const onSendReply = async (text: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setSendError(null);
    const { data, error: actionError } = await sendOutboundAction({ conversationId, text });
    setBusy(false);
    // Red görünür kalır ve kutu temizlenmez: operatör yazdığını kaybetmesin.
    if (data === null) {
      setSendError(actionError ?? 'Gönderilemedi.');
      return false;
    }
    load();
    return true;
  };

  return (
    <>
      <header className="flex flex-none items-center gap-2 border-b border-ops-line px-3 py-2.5">
        <button
          type="button"
          onClick={onBack}
          aria-label="Sohbet listesine dön"
          className="flex h-7 w-7 flex-none cursor-pointer items-center justify-center rounded-ops-btn text-ops-muted transition-colors hover:bg-ops-subtle hover:text-ops-ink"
        >
          <ArrowLeftIcon size={15} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate font-ops-display text-ops-sm font-semibold text-ops-ink">{detail?.title ?? 'Sohbet'}</span>
          {detail ? (
            <span className="flex min-w-0 items-center gap-1.5 font-ops-body text-ops-micro text-ops-muted">
              <span className="truncate">
                {context ? `${context.origin} · ` : ''}
                {SOURCE_LABELS[detail.source]}
              </span>
              <Badge tone={WINDOW_TONE[detail.window.tone]}>{detail.window.chip}</Badge>
            </span>
          ) : null}
        </div>
        <Link
          href={socialLink(conversationId)}
          onClick={onClose}
          className="flex-none cursor-pointer font-ops-display text-ops-xs font-semibold text-ops-olive hover:underline"
        >
          Tam ekran ↗
        </Link>
        <CloseButton onClose={onClose} />
      </header>
      {error ? (
        <p className="px-4 py-3 font-ops-body text-ops-xs text-ops-red">{error}</p>
      ) : detail === null ? (
        <div className="flex flex-1 flex-col gap-3 bg-ops-gray-25 px-4 py-3">
          <Skeleton className="h-8 w-3/5" />
          <Skeleton className="ml-auto h-8 w-2/3" />
          <Skeleton className="h-8 w-1/2" />
        </div>
      ) : (
        <>
          <div className="flex flex-none items-center gap-2 border-b border-ops-line-soft px-3 py-2">
            <ChannelTabs compact threads={detail.threads} activeId={detail.id} onSelect={onSelectThread} />
            <span className="ml-auto flex-none font-ops-body text-ops-micro text-ops-faint">{SOURCE_LABELS[detail.source]}</span>
          </div>
          {/* Kutu yokken (pencere kapalı) eklenecek yer de yok; "Ekle" o hâlde çizilmez. */}
          {context ? (
            <div className="flex flex-none items-center gap-2 border-b border-ops-olive-line bg-ops-olive-bg px-3 py-1.5">
              <span className="flex-none font-ops-display text-ops-micro font-semibold tracking-[0.04em] text-ops-olive-dark">BAĞLAM</span>
              <span title={context.summary} className="min-w-0 flex-1 truncate font-ops-body text-ops-xs text-ops-olive-dark">
                {context.summary}
              </span>
              {humanCanReply(detail.window) ? (
                <button
                  type="button"
                  onClick={addContext}
                  className="flex-none cursor-pointer rounded-[5px] border border-ops-olive-line bg-ops-card px-2 py-0.5 font-ops-display text-ops-micro font-semibold text-ops-olive transition-colors hover:border-ops-olive"
                >
                  Ekle
                </button>
              ) : null}
            </div>
          ) : null}
          {detail.thread.length === 0 ? (
            <p className="flex flex-1 items-center justify-center bg-ops-gray-25 px-4 font-ops-body text-ops-xs text-ops-muted">
              Bu sohbette henüz mesaj yok.
            </p>
          ) : (
            <MessageThread className="bg-ops-gray-25 px-3 py-3">
              {detail.thread.map((item) =>
                item.kind === 'message' ? (
                  <Bubble key={item.message.id} message={item.message} />
                ) : (
                  <NoteLine key={item.note.id} note={item.note} />
                ),
              )}
            </MessageThread>
          )}
          <ReplyBox
            conversationId={conversationId}
            source={detail.source}
            window={detail.window}
            language={detail.language}
            busy={busy}
            error={sendError}
            prefill={prefill}
            onSendReply={onSendReply}
          />
        </>
      )}
    </>
  );
}
