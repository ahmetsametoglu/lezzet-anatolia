import { Hono } from 'hono';
import type { Context, Next } from 'hono';
import { z } from 'zod';
import { getCustomerOrderDetail, listCustomerOrders, readOrderFeedbackInvite } from '@lezzet/application';
import type { CustomerOrderSummary } from '@lezzet/application';
import { serviceDb, UserProfileService } from '@lezzet/database';
import { logger } from '@lezzet/observability';
import {
  DEFAULT_PAGE_SIZE,
  MeOrderDetailSchema,
  MeOrderPageSchema,
  PreferredLanguageEnum,
} from '@lezzet/types';
import type { MeOrderShipment } from '@lezzet/types';
import { fail, ok } from '../../lib/respond';
import { decodeCursor, encodeCursor } from '../../lib/request';
import type { V1Env } from './auth';

/*
  `/me/orders` (21.18) — "Siparişlerim" listesi (v3 `vOrders`) + sipariş detayı (v3 `vOrder`).

  KURAL BURADA DEĞİL: taslak süzmesi, durum daraltması, paket katlaması, "ölçüm var mı" (eksik
  karşılama), zaman çizgisi ve takip adresi `@lezzet/application`ın müşteri sipariş kapısında
  (`order/customer-orders.ts` künyesi) — yani web sipariş sayfalarının okuduğu kararların TAM
  AYNISI. Bu dosya TAŞIMA katmanıdır: sorgu dizesini süzer, kimliği çözer, sözleşme şekline
  indirger, zarflar. Burada hesaplanan hiçbir iş kuralı yok.

  BEARER'IN ARKASINDA ve orada kalacak (adres uçlarının aynı kararı): sipariş müşterinin
  kendisidir, katalog gibi oturumsuz gezilmez.
*/

/** Sayfa boyutu tavanı — katalogun aynı kararı: tek istekle geçmişi boşaltmak sayfalamayı anlamsız kılar. */
const MAX_PAGE_SIZE = 50;

/** Sözleşmenin tanıdığı taşıyıcılar — bunun dışındaki her ad `other`a düşer (geriye uyum alanı). */
const BILINEN_TASIYICILAR = ['colissimo', 'chronopost', 'dhl', 'ups', 'other'] as const;

/**
 * Kargo künyesini sözleşmeye çevirir (07.12).
 *
 * **Neden bir çevirici var:** motor artık koli başına takip döndürüyor (multicollo), sözleşme ise
 * hem yeni listeyi hem de native ekranın hâlâ okuduğu üç eski alanı taşıyor. Eski alanlar İLK
 * koliyi anlatır — ve `carrier` sağlayıcının adını enum'a sıkıştırdığı için çoğu zaman `other`
 * der. Bu bir kayıp ama SESSİZ değil: gerçek ad `carrierName`de, öteki kutular `parcels`ta duruyor
 * ve native o alanlara geçince eski üçlü silinecek (`docs/talep/not-mobil-cok-kutulu-kargo-takibi.md`).
 */
function toMeShipment(shipment: NonNullable<Awaited<ReturnType<typeof getCustomerOrderDetail>>>['shipment']): MeOrderShipment | null {
  if (!shipment) return null;
  const ilk = shipment.parcels[0] ?? null;
  const bilinen = BILINEN_TASIYICILAR.find((c) => c === shipment.carrierName);
  return {
    carrier: bilinen ?? 'other',
    trackingNumber: ilk?.trackingNumber ?? null,
    trackingUrl: ilk?.trackingUrl ?? null,
    carrierName: shipment.carrierName,
    parcels: shipment.parcels.map((parcel) => ({ ...parcel })),
  };
}

/** `authUser` (auth uuid) ≠ müşteri kimliği (`user_profiles.id`) — kapıların istediği hep ikincisi. */
interface CustomerEnv {
  Variables: V1Env['Variables'] & { customerId: string };
}

/**
 * Profil çözümü TEK middleware'de (adres uçlarının deseni birebir). Profili olmayan auth kullanıcısı
 * `GET /me` ile aynı cevabı alır (`profile_not_found`, 404) — trigger boşluğu ya da silinmiş kayıt;
 * boş liste uydurmak arızayı görünmez kılardı.
 */
async function resolveCustomer(c: Context<CustomerEnv>, next: Next): Promise<Response | void> {
  const profile = await new UserProfileService(serviceDb()).findByAuthUserId(c.get('authUser').id);
  if (!profile) return fail(c, 'profile_not_found', 404);
  c.set('customerId', profile.id);
  await next();
}

/**
 * `locale` ZORUNLU ve varsayılansız (katalogun `LocaleSchema` künyesi): `resolveLocalizedText` dil
 * verilmezse sessizce TÜRKÇEYE düşer — Fransız müşteriye Türkçe ürün adı göndermek "makul
 * varsayılan" değil, gizli bir arıza. Sipariş satırlarının ürün adı da aynı zincirden geçiyor.
 */
const ListQuerySchema = z.object({
  locale: PreferredLanguageEnum,
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const orders = new Hono<CustomerEnv>();
orders.use('*', resolveCustomer);

/**
 * Sipariş listesi — keyset sayfalı, en yeni önce, taslaksız.
 *
 * **Numarasız satır zarfa girmez ve bu SESSİZ değildir.** Referans ilk kalıcı durumda doğuyor
 * (`create_order`/`advance_order`) ve taslak zaten süzülü; yani numarasız bir satır bir ANOMALİDİR.
 * Mobil siparişi referansla adresliyor — numarasız satır ekranda açılamayan bir satır olurdu ve
 * sözleşme onu `min(1)` ile keser. Düşen satır kayda geçer: kimlik yazılır, içerik yazılmaz
 * (CLAUDE §1) ve o kimlikle veritabanına bakılır.
 */
orders.get('/', async (c) => {
  const parsed = ListQuerySchema.safeParse(c.req.query());
  if (!parsed.success) {
    return fail(c, parsed.error.issues[0]?.path[0] === 'locale' ? 'invalid_locale' : 'invalid_query', 400);
  }

  const page = await listCustomerOrders(serviceDb(), {
    customerId: c.get('customerId'),
    locale: parsed.data.locale,
    cursor: decodeCursor(parsed.data.cursor),
    limit: parsed.data.limit,
  });

  const withReference = page.orders.filter((order): order is CustomerOrderSummary & { referenceNo: string } => {
    if (order.referenceNo) return true;
    logger.warn({ orderId: order.id, status: order.status }, 'referanssız sipariş listeden düşürüldü');
    return false;
  });

  // ── SÖZLEŞMENİN KİLİDİ (`catalog.ts` emsali) ────────────────────────────────
  // Gövde `z.input<…>` ile TİPLENİR: kapının döndürdüğü şekil sözleşmeden saparsa burası DERLENMEZ.
  // `parse` da süzgeçtir — kümede olmayan alan (sipariş UUID'si gibi) zarfa sızamaz.
  const body: z.input<typeof MeOrderPageSchema> = {
    orders: withReference.map((order) => ({
      reference: order.referenceNo,
      placedAt: order.createdAt,
      status: order.status,
      active: order.active,
      totalCents: order.totalCents,
      itemCount: order.itemCount,
      thumbs: order.thumbs.map((thumb) => ({ name: thumb.name, image: thumb.image })),
      moreCount: order.moreCount,
    })),
    nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
  };
  return ok(c, MeOrderPageSchema.parse(body));
});

/**
 * Sipariş detayı — sayfanın TAMAMI tek turda (kalemler, çizgi, adres, para; bölüm başına çağrı yok).
 *
 * **Bulunamayan · başkasına ait · taslak — üçü de AYNI cevabı alır** (404 `order_not_found`): ayrım
 * söylenirse deneme yanılmayla başkasının sipariş numarası doğrulatılabilirdi. Karar kapının içinde
 * (`null` döner), burada yalnız HTTP karşılığı veriliyor.
 *
 * Numarasız sipariş buraya HİÇ gelemez: adresin kendisi numaradır.
 */
orders.get('/:reference', async (c) => {
  const locale = PreferredLanguageEnum.safeParse(c.req.query('locale'));
  if (!locale.success) return fail(c, 'invalid_locale', 400);

  const detail = await getCustomerOrderDetail(serviceDb(), {
    customerId: c.get('customerId'),
    locale: locale.data,
    lookup: { reference: c.req.param('reference') },
  });
  if (!detail || !detail.referenceNo) return fail(c, 'order_not_found', 404);

  const feedback = await readOrderFeedbackInvite(serviceDb(), detail.id);

  const body: z.input<typeof MeOrderDetailSchema> = {
    reference: detail.referenceNo,
    placedAt: detail.createdAt,
    status: detail.status,
    active: detail.active,
    deliveryType: detail.deliveryType,
    deliveryDate: detail.deliveryDate,
    // Anlık görüntü serbest bir `jsonb`tır (adres o günden beri değişmiş olabilir, kolonu yok):
    // alanlar TEK TEK okunur ve eksik olan `null` düşer — ekran "bilinmiyor" ile "boş"u ayırmaz,
    // ikisinde de o satırı çizmez.
    address: detail.address
      ? {
          line1: detail.address.line1 ?? null,
          line2: detail.address.line2 ?? null,
          postalCode: detail.address.postalCode ?? null,
          city: detail.address.city ?? null,
        }
      : null,
    lines: detail.lines.map((line) => ({
      id: line.id,
      name: line.name,
      unitLabel: line.unit,
      image: line.image,
      bundle: line.bundle ? { itemCount: line.bundle.itemCount, contents: [...line.bundle.contents] } : null,
      qty: line.qty,
      billedQty: line.billedQty,
      shortfall: line.shortfall,
      shortfallCents: line.shortfallCents,
      unitPriceCents: line.unitPriceCents,
      lineTotalCents: line.lineTotalCents,
    })),
    // Motorun `OrderMilestone`u ile sözleşmenin `OrderMilestoneEnum`u burada karşılaşır: ikizler
    // ayrışırsa bu atama DERLENMEZ (`packages/types` domain-core'u bilemez — şema künyesi).
    timeline: detail.timeline ? detail.timeline.map((step) => ({ ...step })) : null,
    subtotalCents: detail.subtotalCents,
    discountCents: detail.discountCents,
    discountLabel: detail.discountLabel,
    shippingFeeCents: detail.shippingFeeCents,
    totalCents: detail.totalCents,
    paymentMethod: detail.paymentMethod,
    paymentStatus: detail.paymentStatus,
    onAccount: detail.onAccount,
    shipment: toMeShipment(detail.shipment),
    /* Davet okuması detayın ARDINDAN: siparişin var olduğu (ve bu müşteriye ait olduğu) kanıtlanmadan
       token okumak, başkasının siparişinin anahtarını sorgulamak olurdu. Kural motorda
       (`readOrderFeedbackInvite`), uç yalnız zarfa koyar. */
    feedback: feedback === null ? null : { token: feedback.token, points: feedback.completionPoints },
  };
  return ok(c, MeOrderDetailSchema.parse(body));
});
