import 'server-only';
import { readHome } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import type { Locale } from '@lezzet/i18n';
import type { CustomerOrderStatus, Home } from '@lezzet/types';
import { readB2bApplicant } from '@/lib/b2b/application';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import type { Device } from '@/lib/device';
import { listCustomerOrders } from '@/lib/order/customer-orders';
import { getHomeData } from './home';
import { readPricingViewer } from './read-viewer';
import { readSiteImage, type SitePageImage } from './site-image';
import type { StorefrontHome } from './storefront-types';

/**
 * ANASAYFANIN İKİ YÜZÜ — telefon ile masaüstü artık FARKLI bileşimleri okur (14.09).
 *
 * Telefon görünümü native vitrini aldı (kullanıcı kararı): bölümleri native uçla AYNI okumadan gelir
 * (`readHome`, `@lezzet/application` — bant karışımı, on fırsat, altı seçki, tarif ve paket kartları,
 * keşif sayısı). Masaüstü v1 tasarımının bileşiminde kalır (`getHomeData`). İkisini birden okumak her
 * ziyaretin veritabanı maliyetini ikiye katlardı; sayfa sunucunun cihaz ipucuyla (UA) TEK yüzü okur,
 * ipucu yanlışsa istemci öteki yüzü `loadHomeViewAction` ile ister (`home-client.tsx` künyesi).
 *
 * Telefon yüzünün kimlikli iki parçası da BURADA okunur, çünkü native'de de ayrı uçlardan gelirler
 * (kullanıcı kararı 08.08 — vitrin ucu kimliksiz): süren/geçen sipariş bandı ve toptan başvurusunun
 * durumu. Selamlama adı, toptan rozeti ve bildirim zili kökteki bağlamdan okunur (layout).
 */

/** Vitrinin sipariş bandının taşıdığı kadarı — sipariş listesinin satırından daraltılmış. */
interface PhoneOrderBand {
  /** Bağlantı KİMLİKLE kurulur: web `/orders/[reference]` segmenti adına rağmen sipariş kimliği taşıyor. */
  id: string;
  referenceNo: string;
  status: CustomerOrderStatus;
  totalCents: number;
}

export interface PhoneHome {
  home: Home;
  /**
   * Süren (en yeni) ve teslim edilmiş (en yeni) sipariş — misafirde ikisi de `null`. Seçim native'in
   * aynısı: "süren" kararı sözleşmenin `active` alanından okunur (motorun kuralı), "geçen" `delivered`dır.
   */
  orders: { live: PhoneOrderBand | null; last: PhoneOrderBand | null };
  /** Toptan başvurusu incelemede mi — cevabı belli soru sorulmaz, profesyonel daveti çizilmez (native 20.08). */
  b2bPending: boolean;
}

export type HomeView =
  | { device: 'mobile'; data: PhoneHome }
  | { device: 'desktop'; data: StorefrontHome; hero: SitePageImage | null };

export async function loadHomeView(locale: Locale, device: Device): Promise<HomeView> {
  const [place, viewer] = await Promise.all([readPlaceWarehouses(), readPricingViewer()]);

  if (device === 'desktop') {
    // Kahraman görseli katalogla AYNI turda — ikisi arasında bağımlılık yok.
    const [data, hero] = await Promise.all([getHomeData(locale, place, viewer), readSiteImage('home_hero', locale)]);
    return { device, data, hero };
  }

  const customerId = viewer.customerId;
  const [home, orderPage, applicant] = await Promise.all([
    readHome(serviceDb(), locale, place, viewer),
    // İlk sayfa yeter: liste en yeni önce geliyor ve bantların sorusu "en yeni"dir (native kancasının
    // aynı kararı — geçmişin derinine inmek iki satır çizmek için ödenecek bedel değil).
    customerId === null ? null : listCustomerOrders(locale, customerId),
    customerId === null ? null : readB2bApplicant(locale),
  ]);

  const orders = orderPage?.orders ?? [];
  const bandOf = (status: (order: (typeof orders)[number]) => boolean): PhoneOrderBand | null => {
    const order = orders.find((o) => status(o) && o.referenceNo !== null);
    // `referenceNo` taslakta yoktur ve taslak listede yok; süzgeç tipin daraltmasıdır.
    return order === undefined || order.referenceNo === null
      ? null
      : { id: order.id, referenceNo: order.referenceNo, status: order.status, totalCents: order.totalCents };
  };

  return {
    device,
    data: {
      home,
      orders: { live: bandOf((o) => o.active), last: bandOf((o) => o.status === 'delivered') },
      b2bPending: applicant?.status === 'pending',
    },
  };
}
