import { conversationChannelName, conversationsChannelName, defaultConversationHandler } from '@lezzet/application';
import { ConversationService, CustomerInboxService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import { guarded, requireAdmin } from '@/lib/guard';
import { LiveRefresh } from '@/components/operation/ui/live-refresh';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { SocialClient } from './social-client';
import { readConversationDetailView } from './social-detail';
import { rowTarget, toInboxRows } from './social-read';
import { channelSource, parseSocialUrl } from './social-url';
import type { SocialData } from './social-types';

// Yalnız yönetici: müşterinin kendi cümleleri okunuyor ve işlenen her satır ticari bir kaydın zeminine dönüşüyor.

// Depo bağlamı süzmez: konuşma bir müşteri ilişkisidir ve depo süzgeci henüz siparişi olmayan yeni müşterileri yutardı.

// BEKLEYEN(15.11): başlıktaki "Kalıp mesaj" düğmesi; kapalı pencerenin uyarısı şimdiden gösteriliyor.

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
  const inbox = new CustomerInboxService(serviceDb());
  const source = channelSource(urlState.ch);

  const [page, awaitingCount, aiCount, defaultHandler] = await Promise.all([
    inbox.list({ awaitingReply: urlState.f === 'awaiting' ? true : undefined, source }, undefined, DEFAULT_PAGE_SIZE),
    // Sayaçlar kanal süzgecine uyar: süzgeçli kuyruğun başlığı süzgeçsiz sayı yazsaydı tam da kalabalıkta yalan söylerdi.
    inbox.countAwaitingReply(source),
    new ConversationService(serviceDb()).countHandledByAi(source),
    defaultConversationHandler(serviceDb()),
  ]);

  // Tek an: ayrı okunsaydı aynı konuşma listede "2 dk" derken sohbet altlığında "kapalı" diyebilirdi.
  const now = new Date();
  const rows = toInboxRows(page.rows, now);

  // Seçim yoksa süzgece uyan ilk sohbet açılır: sohbet panosu ekranın büyük yarısı, boş kalması "önce seç" adımı dayatırdı.
  const selectedId = urlState.c || (rows[0] ? rowTarget(rows[0], urlState) : '');

  // Seçim adreste durur ve detay sunucuda okunur: talepler ekranı sohbete bağlantıyla gelir.
  const detailView = selectedId ? await readConversationDetailView(selectedId, now) : null;

  const data: SocialData = {
    rows,
    nextCursor: page.nextCursor,
    awaitingCount,
    aiCount,
    defaultHandler,
    detail: detailView,
  };

  return (
    <>
      {/* Hibrit taslak arka planda yazılır. Kanal talep kuyruğundan ayrı: her talepte bu ekran da tazelenirdi. */}
      <LiveRefresh channel={conversationsChannelName()} />
      {/* Transkript ve çeviri mesajdan saniyeler sonra yazılır ve yalnız sohbetin kendi zilini çalar. */}
      {selectedId ? <LiveRefresh channel={conversationChannelName(selectedId)} /> : null}
      <SocialClient data={data} urlState={{ ...urlState, c: selectedId }} />
    </>
  );
}
