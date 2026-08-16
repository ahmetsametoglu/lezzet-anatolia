'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketHandler } from '@lezzet/types';
import {
  consumeConversationDraftAction,
  loadMoreConversationsAction,
  recordOutboundAction,
  setConversationModeAction,
} from './actions';
import { ConversationTicketDialog } from './conversation-ticket-dialog';
import { ManualDmDialog } from './manual-dm-dialog';
import { WhatsappDesktop } from './whatsapp.desktop';
import { whatsappUrl, type WhatsappFilterKey, type WhatsappUrlState } from './whatsapp-url';
import type { InboxRowView, WhatsappData } from './whatsapp-types';

// WhatsApp izleme ekranı client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız;
// personelin mobil deneyimi native uygulamanın işi (`docs/uygulama`).
//
// SÜZGEÇ ve SEÇİM gerçek gezinmedir (`?f=…&c=…`): detay sunucuda okunuyor ve bir sohbetin bağlantısı
// paylaşılabilir olmalı — Talepler ekranı da buraya konuşma kimliğiyle bağlanıyor.

interface WhatsappClientProps {
  data: WhatsappData;
  urlState: WhatsappUrlState;
}

export function WhatsappClient({ data, urlState }: WhatsappClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const go = (patch: Partial<WhatsappUrlState>) => {
    startNav(() => router.replace(whatsappUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // Liste: ilk sayfa sunucudan, devamı action ile EKLENİR. Sunucu verisi değişince (süzgeç ya da
  // yazımdan sonraki tazeleme) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin satırları kalırdı.
  const [extra, setExtra] = useState<InboxRowView[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtra([]);
    setCursor(data.nextCursor);
  }, [data.rows, data.nextCursor]);

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreConversationsAction(window.location.search, cursor)
      .then(({ data: page }) => {
        // Hata sessiz: kuyruk olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (!page) return;
        setExtra((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /**
   * Gelen mesaj penceresinin iki kapısı, TEK durum: `new` yeni bir numara, `follow` açık sohbetin
   * devamı (numara kilitli). İki ayrı bayrak tutmak, ikisinin aynı anda açık olabildiği bir hâl
   * üretirdi — üstelik pencere zaten aynı pencere.
   */
  const [dmMode, setDmMode] = useState<'new' | 'follow' | null>(null);
  const [ticketOpen, setTicketOpen] = useState(false);

  const detail = data.detail;

  /**
   * Yazma sarmalı: kilitle, hatayı göster, başarıda sunucuyu yeniden oku.
   *
   * Hata GÖRÜNÜR kalır ve kutu temizlenmez: reddedilen bir kaydın metni silinseydi operatör
   * yazdığını kaybeder ve — daha kötüsü — kaydın düştüğünü sanırdı.
   */
  async function run(call: () => Promise<{ data: unknown; error: string | null }>): Promise<boolean> {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      if (result.error !== null || result.data === null) {
        setError(result.error ?? 'İşlem tamamlanamadı.');
        return false;
      }
      // Action zaten `revalidatePath` çağırdı; `refresh` o taze RSC çıktısını ekrana getirir.
      router.refresh();
      return true;
    } finally {
      setBusy(false);
    }
  }

  const view = {
    data: { ...data, rows: [...data.rows, ...extra] },
    urlState,
    navPending,
    busy,
    error,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    onFilter: (f: WhatsappFilterKey) => go({ f }),
    // Süzgeç değişmiyor, seçim değişiyor: aynı adres iki soruyu birden taşıyor.
    onSelect: (c: string) => go({ c }),
    onRecordOutbound: (text: string) =>
      detail ? run(() => recordOutboundAction({ conversationId: detail.id, text })) : Promise.resolve(false),
    // Mod anahtarı (16.08) — onaysız: anahtar kararın kendisi; Devral düğmesi de buradan geçer.
    onMode: (mode: TicketHandler) => {
      if (detail) void run(() => setConversationModeAction(detail.id, mode));
    },
    /** Hibrit taslağı tüket — dönen metni ekran defter kutusuna taşır (16.08). */
    onConsumeDraft: async (): Promise<string | null> => {
      if (!detail) return null;
      let draft: string | null = null;
      await run(async () => {
        const result = await consumeConversationDraftAction(detail.id);
        draft = result.data?.draft ?? null;
        return result;
      });
      return draft;
    },
    onIncoming: () => setDmMode('follow'),
    onNewDm: () => setDmMode('new'),
    onNewTicket: () => setTicketOpen(true),
  };

  return (
    <>
      <WhatsappDesktop {...view} />

      {dmMode ? (
        <ManualDmDialog
          // Devam kapısı numarayı SOHBETTEN alır, operatör yeniden yazmaz — ve yazamaz da:
          // değiştirilebilir olsaydı mesaj farkında olmadan başka birinin sohbetine düşerdi.
          existingPhone={dmMode === 'follow' ? detail?.phone : undefined}
          onClose={() => setDmMode(null)}
          onOpened={(conversationId) => {
            setDmMode(null);
            // İşlenen sohbet AÇILIR: operatör onu okumak için buraya geldi, kuyrukta aramamalı.
            go({ c: conversationId });
            router.refresh();
          }}
        />
      ) : null}

      {/* Talep penceresi YALNIZ kimliği çözülmüş sohbette açılır: talep bir müşteriye açılır ve
          müşterisi olmayan bir sohbette açılacak talebin sahibi yoktur. */}
      {ticketOpen && detail?.context?.customerId ? (
        <ConversationTicketDialog
          conversationId={detail.id}
          customerId={detail.context.customerId}
          customerName={detail.context.name}
          onClose={() => setTicketOpen(false)}
          onCreated={() => {
            setTicketOpen(false);
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
