import { conversationChannelName, conversationsChannelName, defaultConversationHandler } from '@lezzet/application';
import { ConversationInboxService, ConversationService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE } from '@lezzet/types';
import { guarded, requireAdmin } from '@/lib/guard';
import { LiveRefresh } from '@/components/operation/ui/live-refresh';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { SocialClient } from './social-client';
import { readConversationDetailView } from './social-detail';
import { toInboxRows } from './social-read';
import { channelSource, parseSocialUrl } from './social-url';
import type { SocialData } from './social-types';

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
// **"Sipariş oluştur" BAŞLIKTA** (15.4 köprüsü): 14.09'da sağ panelin dibinden çizimin yerine taşındı
// — panelin dibinde ilk ekranda görünmüyordu.
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

  const [page, awaitingCount, aiCount, defaultHandler] = await Promise.all([
    inbox.list({ awaitingReply: urlState.f === 'awaiting' ? true : undefined, source }, undefined, DEFAULT_PAGE_SIZE),
    // Sayaçlar kanal süzgecine UYAR: süzgeçli kuyruğun başlığı süzgeçsiz sayı yazsaydı, tam da
    // kalabalıkta yalan söylerdi.
    inbox.countAwaitingReply(source),
    // Çizimin "1 AI yürütüyor" sayısı — 16.08'e kadar bilerek yoktu (daima 0 gösterirdi).
    new ConversationService(serviceDb()).countHandledByAi(source),
    // Yeni sohbetin varsayılan modu (15.30) — webhook'un okuduğu ayarın aynısı, başlıkta anahtar.
    defaultConversationHandler(serviceDb()),
  ]);

  /**
   * **Seçim yoksa ilk satır açılır.** Sohbet panosu ekranın büyük yarısı: boş bırakmak operatöre
   * "önce bir şey seç" adımı dayatırdı ve kuyruk zaten cevap bekleyeni öne alan sırada geliyor.
   */
  const selectedId = urlState.c || (page.rows[0]?.id ?? '');
  // Tek an, tüm pencereler: kuyruk rozetleri ve sohbet altlığı aynı `now`'a göre hesaplanır — ikisi
  // ayrı okunsaydı aynı konuşma listede "2 dk" derken altlıkta "kapalı" diyebilirdi.
  const now = new Date();

  // Detayın görünümü ORTAK okumadan (`social-detail`) — yüzen mesaj penceresi (15.32) aynısını okuyor.
  const detailView = selectedId ? await readConversationDetailView(selectedId, now) : null;

  const data: SocialData = {
    rows: toInboxRows(page.rows, now),
    nextCursor: page.nextCursor,
    awaitingCount,
    aiCount,
    defaultHandler,
    detail: detailView,
  };

  return (
    <>
      {/* CANLI BAĞ (16.8): bugün tek arka plan yazarı AI cron'unun hibrit taslağı — ekran açıkken
          taslak belirmeli. Kanal talep kuyruğununkinden AYRI: her müşteri talebinde bu ekranı da
          tazelemek, konuşmayı okuyan operatörün altından sayfayı çekerdi. */}
      <LiveRefresh channel={conversationsChannelName()} />
      {/* AÇIK SOHBETİN KENDİ ZİLİ (08.09, ölçüldü): kuyruk zili mesaj yazıldığı an ve ajan cevabında
          çalıyor; sesin transkripti ve çeviri ise saniyeler SONRA yazılıyor ve o an yalnız sohbetin
          tekil zili çalıyor (`triggerInboundPipeline`in ikinci zili). Bu ekran onu duymuyordu:
          operatör sesli mesajı transkriptsiz görüyor, metin ancak kendisi bir şey yapınca beliriyordu.
          Kanal adı sohbetin UUID'sinden türer — talep ekranındaki müşteri zilinin aynı kalıbı. */}
      {selectedId ? <LiveRefresh channel={conversationChannelName(selectedId)} /> : null}
      <SocialClient data={data} urlState={{ ...urlState, c: selectedId }} />
    </>
  );
}
