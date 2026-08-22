import { conversationsChannelName } from '@lezzet/application';
import { ConversationInboxService, ConversationService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, TICKET_STATUS_LABELS } from '@lezzet/types';
import { guarded, requireAdmin } from '@/lib/guard';
import { LiveRefresh } from '@/components/operation/ui/live-refresh';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { readCustomerContext } from '@/lib/customer/context';
import { readConversationDetail } from '@/lib/messaging/read';
import { SocialClient } from './social-client';
import { titleOf, toInboxRows, toMessageViews, toWindowView } from './social-read';
import { channelSource, parseSocialUrl } from './social-url';
import type { ConversationDetailView, SocialData } from './social-types';

// Sosyal gelen kutusu (15.5 · üç kanal 15.15) — WhatsApp + Messenger + Instagram DM tek kuyrukta;
// sohbet ve müşteri bağlamı aynı ekranda.
//
// ── KAPI: YALNIZ YÖNETİCİ ────────────────────────────────────────────────────
// Talepler ekranıyla aynı gerekçe: burada müşterinin kendi cümleleri okunuyor ve elle işlenen her
// satır ticari bir kaydın (sipariş, talep) zeminine dönüşüyor. Depo ve kurye görmez.
//
// ── DEPO BAĞLAMI BU SAYFAYI DARALTMAZ ────────────────────────────────────────
// Konuşma bir müşteri ilişkisidir, bir depo işi değil — aynı sohbette iki deponun siparişi
// anılabilir. Depo süzgeci konsaydı, kuyruk deposu olmayan konuşmaları (henüz sipariş yok) sessizce
// yutardı ve tam da yeni müşteriler kaybolurdu.
//
// ── DETAY SUNUCUDA OKUNUR ────────────────────────────────────────────────────
// Seçili konuşma adreste (`?c=`), yani okuması burada. Talepler ekranı da buraya konuşma kimliğiyle
// bağlanıyor; istemcide tutulan bir seçim o bağlantıyı imkânsız kılardı.
//
// ── ÇİZİMİN ÇİZİP DE BUGÜN YAZILMAYANLARI ────────────────────────────────────
// **"Sipariş oluştur" düğmesi YOK:** köprü 15.4, hedefi ise elle sipariş girişi (09.8) ve o ekran
// yazılmadı. Rayın kendi dersi burada da geçerli — var olmayan yere götüren düğme konmaz.
// **"Kalıp mesaj" düğmesi YOK:** onaylı şablon da gönderim sürücüsü de 15.11'in işi. Pencere
// kapalıyken UYARI yine de gösteriliyor, çünkü uyarı ölçülmüş bir gerçek; eylem ise henüz yok.
// (AI rozeti + mod anahtarı + hibrit taslak 16.08'de geldi: mod bir VERİ ve `conversation.handled_by`
// gerçek — motorun kendisi hâlâ 15.8/15.13'ün işi.)

interface SocialPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function SocialPage({ searchParams }: SocialPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="Sosyal Mesajlar"
        reason="Müşteri yazışması yönetime açıktır. Bir sohbetin ilerlemesi gerekiyorsa yöneticiye müşterinin adı ya da numarasıyla bildirin."
      />
    );
  }

  const urlState = parseSocialUrl(await searchParams);
  const inbox = new ConversationInboxService(serviceDb());
  const source = channelSource(urlState.ch);

  const [page, awaitingCount, aiCount] = await Promise.all([
    inbox.list({ awaitingReply: urlState.f === 'awaiting' ? true : undefined, source }, undefined, DEFAULT_PAGE_SIZE),
    // Sayaçlar kanal süzgecine UYAR: süzgeçli kuyruğun başlığı süzgeçsiz sayı yazsaydı, tam da
    // kalabalıkta yalan söylerdi.
    inbox.countAwaitingReply(source),
    // Çizimin "1 AI yürütüyor" sayısı — 16.08'e kadar bilerek yoktu (daima 0 gösterirdi).
    new ConversationService(serviceDb()).countHandledByAi(source),
  ]);

  /**
   * **Seçim yoksa ilk satır açılır.** Sohbet panosu ekranın büyük yarısı: boş bırakmak operatöre
   * "önce bir şey seç" adımı dayatırdı ve kuyruk zaten cevap bekleyeni öne alan sırada geliyor.
   */
  const selectedId = urlState.c || (page.rows[0]?.id ?? '');
  const detail = selectedId ? await readConversationDetail(selectedId) : null;

  // Müşteri bağlamı ORTAK okumadan (`lib/customer/context`) — Talepler ekranı da aynısını okuyor.
  // Konuşmanın kendi okumasına gömülseydi iki ekran aynı soruyu iki biçimde cevaplardı.
  const context = detail?.conversation.customerId ? await readCustomerContext(detail.conversation.customerId) : null;

  // Tek an, tüm pencereler: kuyruk rozetleri ve sohbet altlığı aynı `now`'a göre hesaplanır — ikisi
  // ayrı okunsaydı aynı konuşma listede "2 dk" derken altlıkta "kapalı" diyebilirdi.
  const now = new Date();

  const detailView: ConversationDetailView | null = detail && {
    id: detail.conversation.id,
    source: detail.conversation.source,
    title: context?.name.trim() || titleOf({ profileName: detail.conversation.profileName, externalRef: detail.conversation.externalRef }),
    externalRef: detail.conversation.externalRef,
    profileName: detail.conversation.profileName,
    window: toWindowView(detail.conversation.windowExpiresAt, now),
    messages: toMessageViews(detail.messages),
    context,
    tickets: detail.tickets.map((t) => ({
      id: t.id,
      subject: t.subject?.trim() || 'Başlıksız talep',
      statusLabel: TICKET_STATUS_LABELS[t.status],
    })),
    handledBy: detail.conversation.handledBy,
    aiDraft: detail.conversation.aiDraftReply,
    optIn: detail.conversation.optIn,
  };

  const data: SocialData = {
    rows: toInboxRows(page.rows, now),
    nextCursor: page.nextCursor,
    awaitingCount,
    aiCount,
    detail: detailView,
  };

  return (
    <>
      {/* CANLI BAĞ (16.8): bugün tek arka plan yazarı AI cron'unun hibrit taslağı — ekran açıkken
          taslak belirmeli. Kanal talep kuyruğununkinden AYRI: her müşteri talebinde bu ekranı da
          tazelemek, konuşmayı okuyan operatörün altından sayfayı çekerdi. */}
      <LiveRefresh channel={conversationsChannelName()} />
      <SocialClient data={data} urlState={{ ...urlState, c: selectedId }} />
    </>
  );
}
