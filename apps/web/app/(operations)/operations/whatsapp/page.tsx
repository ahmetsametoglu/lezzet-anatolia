import { ConversationInboxService, serviceDb } from '@lezzet/database';
import { DEFAULT_PAGE_SIZE, TICKET_STATUS_LABELS } from '@lezzet/types';
import { guarded, requireAdmin } from '@/lib/guard';
import { NoAccessPane } from '@/components/operation/ui/no-access-pane';
import { shortDate } from '@/components/operation/ui/format';
import { readConversationDetail } from '@/lib/whatsapp/read';
// Kardeş sayfadan YALNIZ adres sözleşmesi alınır (STACK §7): sipariş yolu elle kurulmaz, sahibinden.
import { ORDERS_PATH } from '../orders/orders-url';
import { WhatsappClient } from './whatsapp-client';
import { toInboxRows, toMessageViews, toWindowView } from './whatsapp-read';
import { parseWhatsappUrl } from './whatsapp-url';
import { CONTEXT_ORDER_LIMIT, type ConversationDetailView, type WhatsappData } from './whatsapp-types';

// WhatsApp konuşma izleme (15.5) — gelen kutusu, sohbet ve müşteri bağlamı tek ekranda.
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
// **"Devral" düğmesi ve AI rozeti YOK:** ajan yazılmadı (15.8/15.13) — bugün her sohbet zaten
// insanda. Var olmayan bir durumdan devralma düğmesi, olmayan bir yetenek vaat ederdi.
// **"Sipariş oluştur" düğmesi YOK:** köprü 15.4, hedefi ise elle sipariş girişi (09.8) ve o ekran
// yazılmadı. Rayın kendi dersi burada da geçerli — var olmayan yere götüren düğme konmaz.
// **"Kalıp mesaj" düğmesi YOK:** onaylı şablon da gönderim sürücüsü de 15.11'in işi. Pencere
// kapalıyken UYARI yine de gösteriliyor, çünkü uyarı ölçülmüş bir gerçek; eylem ise henüz yok.

interface WhatsappPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function WhatsappPage({ searchParams }: WhatsappPageProps) {
  const access = await guarded(requireAdmin);
  if (!access.ok) {
    return (
      <NoAccessPane
        title="WhatsApp"
        reason="Müşteri yazışması yönetime açıktır. Bir sohbetin ilerlemesi gerekiyorsa yöneticiye müşterinin numarasıyla bildirin."
      />
    );
  }

  const urlState = parseWhatsappUrl(await searchParams);
  const inbox = new ConversationInboxService(serviceDb());

  const [page, awaitingCount] = await Promise.all([
    inbox.list(urlState.f === 'awaiting' ? { awaitingReply: true } : {}, undefined, DEFAULT_PAGE_SIZE),
    inbox.countAwaitingReply(),
  ]);

  /**
   * **Seçim yoksa ilk satır açılır.** Sohbet panosu ekranın büyük yarısı: boş bırakmak operatöre
   * "önce bir şey seç" adımı dayatırdı ve kuyruk zaten cevap bekleyeni öne alan sırada geliyor.
   */
  const selectedId = urlState.c || (page.rows[0]?.id ?? '');
  const detail = selectedId ? await readConversationDetail(selectedId, CONTEXT_ORDER_LIMIT) : null;

  // Tek an, tüm pencereler: kuyruk rozetleri ve sohbet altlığı aynı `now`'a göre hesaplanır — ikisi
  // ayrı okunsaydı aynı konuşma listede "2 dk" derken altlıkta "kapalı" diyebilirdi.
  const now = new Date();

  const detailView: ConversationDetailView | null = detail && {
    id: detail.conversation.id,
    title: detail.customer?.name?.trim() || detail.conversation.externalRef,
    window: toWindowView(detail.conversation.windowExpiresAt, now),
    messages: toMessageViews(detail.messages),
    context: detail.customer && {
      customerId: detail.customer.id,
      name: detail.customer.name,
      phone: detail.conversation.externalRef,
      isDraft: detail.customer.isDraft,
      isCompany: detail.customer.type === 'company',
      whatsappConsent: detail.customer.marketingConsent.whatsapp ?? null,
      // Numarasız sipariş TASLAKTIR (yarım kalmış checkout) ve gizlenmez — tarihiyle görünür;
      // gizlemek "bu müşteri denedi ama tamamlamadı" bilgisini yok etmek olurdu.
      orders: detail.orders.map((o) => ({
        id: o.id,
        label: o.referenceNo ?? shortDate(o.createdAt),
        totalCents: o.totalCents,
        href: `${ORDERS_PATH}/${o.id}`,
      })),
    },
    tickets: detail.tickets.map((t) => ({
      id: t.id,
      subject: t.subject?.trim() || 'Başlıksız talep',
      statusLabel: TICKET_STATUS_LABELS[t.status],
    })),
  };

  const data: WhatsappData = {
    rows: toInboxRows(page.rows, now),
    nextCursor: page.nextCursor,
    awaitingCount,
    detail: detailView,
  };

  return <WhatsappClient data={data} urlState={{ ...urlState, c: selectedId }} />;
}
