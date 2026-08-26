'use server';

import { revalidatePath } from 'next/cache';
import { AddressService, UserProfileService, serviceDb } from '@lezzet/database';
import { effectiveChannelOf, placeOrder } from '@lezzet/application';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { ORDERS_PATH } from '../orders-url';
import {
  readAddressOptions,
  readDeliveryContext,
  searchCustomerOptions,
  searchVariantRows,
} from './new-order-read';
import type {
  AddressPickOption,
  CustomerPickOption,
  DeliveryContext,
  NewAddressInput,
  NewCustomerInput,
  VariantPickRow,
} from './new-order-types';
import type { PaymentMethod } from '@lezzet/types';

// Elle sipariş girişi — server action'ları (09.8).
//
// Desen ekranın geri kalanıyla aynı: `'use server'` + `requireAdmin` İLK + servise/motora devret +
// `{ data, error }` döner (throw yok).
//
// **PAZARLIKLI FİYAT YALNIZ ADMİN** (tasarım sözleşmesi §3): kapı `requireAdmin` ve başka bir yeri
// yok. Ekranda gizlemek yetmez — istemci gizlenmiş bir alanı yine gönderebilir.

export async function searchCustomersAction(term: string): Promise<ActionResult<CustomerPickOption[]>> {
  try {
    await requireAdmin();
    return { data: await searchCustomerOptions(serviceDb(), term), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Müşteri bul-veya-OLUŞTUR'un "oluştur" tarafı** (09.8) — telefonla gelen müşterinin hesabı
 * olmayabilir ve olması da gerekmez.
 *
 * Kayıt `auth_user_id` OLMADAN açılır (kolon nullable) ve `is_draft` işaretlenir: doğrulanmamış bir
 * kimlik doğrulanmış gibi durmamalı. Müşteri bir gün siteye kaydolursa aynı satır oturuma bağlanır
 * (`04.4` tetikleyicisi + `09.10` birleştirme); şimdiden ikinci bir kayıt açmak, aynı kişiyi iki
 * kez oluşturmak olurdu.
 *
 * **Telefon ZORUNLU ama benzersiz DEĞİL:** aile numarası meşru bir hâldir (`0001` künyesi). Kimlik
 * anahtarı olmadığı için burada tekillik aranmıyor; operatör önce ARAR, çıkmazsa oluşturur —
 * "bul-veya-oluştur" akışının sırası budur ve ekran onu zorluyor.
 */
export async function createCustomerAction(input: NewCustomerInput): Promise<ActionResult<CustomerPickOption>> {
  try {
    await requireAdmin();
    const name = input.name.trim();
    if (!name) throw new Error('Müşteri adı girilmeli.');
    const phone = input.phone.trim();
    if (!phone) throw new Error('Telefon girilmeli — kurye kapıda kimi arayacağını bilmek zorunda.');

    const row = await new UserProfileService(serviceDb()).insert({
      name,
      phone,
      email: input.email?.trim() || null,
      type: input.type,
      // Doğrulanmamış kayıt: sayfanın başlık sayacı bunları ayrı gösteriyor (09.9).
      isDraft: true,
    });
    return {
      data: {
        id: row.id,
        name: row.name,
        phone: row.phone,
        email: row.email,
        type: row.type,
        channel: effectiveChannelOf(row),
        isDraft: row.isDraft,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function readAddressesAction(customerId: string): Promise<ActionResult<AddressPickOption[]>> {
  try {
    await requireAdmin();
    return { data: await readAddressOptions(serviceDb(), customerId), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Adres ekleme — sipariş deposu ve teslimat günü BUNDAN çözülür, yani adressiz sipariş açılamaz.
 *
 * Alıcı ve telefon zorunlu (22.08): kurye kapıda kimi soracağını ve kimi arayacağını bilmek
 * zorunda; hediye ya da iş adresinde o kişi hesap sahibinden başkasıdır.
 */
export async function createAddressAction(
  customerId: string,
  input: NewAddressInput,
): Promise<ActionResult<AddressPickOption>> {
  try {
    await requireAdmin();
    const recipient = input.recipient.trim();
    const phone = input.phone.trim();
    const line1 = input.line1.trim();
    const postalCode = input.postalCode.trim();
    const city = input.city.trim();
    if (!recipient || !phone) throw new Error('Alıcı ve telefon girilmeli.');
    if (!line1 || !postalCode || !city) throw new Error('Sokak, posta kodu ve şehir girilmeli.');

    const row = await new AddressService(serviceDb()).addForCustomer({
      customerId,
      recipient,
      phone,
      line1,
      line2: input.line2?.trim() || undefined,
      postalCode,
      city,
    });
    return {
      data: {
        id: row.id,
        label: [row.line1, row.line2, `${row.postalCode} ${row.city}`].filter(Boolean).join(', '),
        recipient: row.recipient,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function readDeliveryContextAction(
  customerId: string,
  addressId: string,
): Promise<ActionResult<DeliveryContext>> {
  try {
    await requireAdmin();
    const context = await readDeliveryContext(serviceDb(), customerId, addressId);
    if (!context) throw new Error('Adres bulunamadı.');
    return { data: context, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function searchVariantsAction(
  customerId: string,
  term: string,
  warehouseId: string | null,
): Promise<ActionResult<VariantPickRow[]>> {
  try {
    await requireAdmin();
    return { data: await searchVariantRows(serviceDb(), { customerId, term, warehouseId }), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Dışa AÇILMIYOR: tek çağıranı aşağıdaki kapı ve ekran onu çağrı yerinden çıkarıyor. Ayrıca
 * `'use server'` dosyasının dışa verdiği her ad bir UÇTUR — tip de olsa oraya bir isim koymak,
 * kapı sayısını olduğundan çok gösterir.
 */
interface ManualOrderInput {
  customerId: string;
  addressId: string;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  onAccount: boolean;
  isGiftOrder: boolean;
  /** Kalemler; `unitPriceCents` YALNIZ pazarlık edildiyse gönderilir (aşağıdaki künye). */
  lines: { variantId: string; qty: number; unitPriceCents: number | null }[];
}

/**
 * **Siparişi aç** — telefonla gelen siparişin masada yazılması (09.8).
 *
 * Zincir müşteri yolunun TA KENDİSİ (`placeOrder`): KDV işlemi, posta kodu → bölge → depo, tek
 * depo değişmezi, stok karşılanabilirliği, rezervasyon ve indirim dengesi aynı kurallardan geçer.
 * Farkı yalnız `staff` künyesi taşıyor (gerekçeler `CheckoutDraftInput.staff`ta).
 *
 * **PAZARLIKSIZ KALEM FİYAT GÖNDERMEZ ve bu bir güvenlik kararıdır.** İstemci her kalem için bir
 * sayı gönderseydi siparişin parası tarayıcıdan belirlenirdi — ekran liste fiyatını gösterip
 * konsoldan 1 kuruş göndermek mümkün olurdu. Operatör fiyata DOKUNMADIYSA sunucu fiyatı kendisi
 * çözer; dokunduysa gönderilen sayı bir KARARDIR ve izi (`list_unit_price` + `price_set_by`)
 * yazılır. Yetki kapısı `requireAdmin`.
 *
 * **Ödeme sağlayıcısı YOK** (`createPaymentSession: null`): masada kart çekilmiyor. Kartla ödeme
 * seçilirse sipariş yine açılır ve tahsilat kapıda/kuryede gerçekleşir — `payment_method` o anlamı
 * zaten taşıyor. Online ödeme müşterinin kendi checkout'unun işi.
 */
export async function createManualOrderAction(input: ManualOrderInput): Promise<ActionResult<{ orderId: string }>> {
  try {
    const staff = await requireAdmin();
    if (input.lines.length === 0) throw new Error('En az bir kalem girilmeli.');
    if (input.lines.some((l) => l.qty <= 0)) throw new Error('Adet sıfırdan büyük olmalı.');

    const overrides = new Map<string, number>();
    for (const line of input.lines) {
      if (line.unitPriceCents === null) continue;
      if (line.unitPriceCents < 0) throw new Error('Pazarlıklı fiyat eksi olamaz.');
      overrides.set(line.variantId, line.unitPriceCents);
    }

    const outcome = await placeOrder(serviceDb(), {
      locale: 'fr',
      customerId: input.customerId,
      entries: input.lines.map((l) => ({ kind: 'variant' as const, variantId: l.variantId, qty: l.qty, stockId: null })),
      addressId: input.addressId,
      deliveryDate: input.deliveryDate,
      paymentMethod: input.paymentMethod,
      onAccount: input.onAccount,
      staff: {
        // **PROFİL kimliği, auth kimliği DEĞİL** — `price_set_by` `user_profiles`a FK'li. İkisi de
        // `string` olduğu için tip denetimi ayırt etmez; yanlışı veritabanı kısıtı yakalardı ama
        // ancak ilk pazarlıklı siparişte, yani üretimde.
        actorId: staff.profileId,
        priceOverrides: overrides.size > 0 ? overrides : undefined,
        isGiftOrder: input.isGiftOrder,
      },
      createPaymentSession: null,
    });

    if (outcome.status !== 'placed') throw new Error(rejectionMessage(outcome));
    revalidatePath(ORDERS_PATH);
    return { data: { orderId: outcome.orderId }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Motorun yapısal reddini operatörün diline çevirir.
 *
 * Çeviri BURADA yapılıyor, motorda değil: aynı ret müşteri yüzeyinde başka bir cümleyle
 * anlatılıyor ("bir ürün tükendi" ≠ "bu depoda 3 tane var"). Motor ADLI ve YAPISAL sonuç döndürür,
 * dili çağıran seçer (`PlaceOrderRejection` künyesi).
 */
function rejectionMessage(outcome: Exclude<Awaited<ReturnType<typeof placeOrder>>, { status: 'placed' }>): string {
  switch (outcome.status) {
    case 'blocked_lines':
      return `Satışa kapalı ya da bu depoda bulunmayan kalem: ${outcome.lines.join(', ')}`;
    case 'insufficient_here':
      return `Depoda yeterli adet yok — ${outcome.lines.map((l) => `${l.name}: ${l.available} adet`).join(', ')}`;
    case 'date_unavailable':
      return outcome.availableDates.length
        ? `Seçilen gün bu bölgeye uygun değil. Uygun günler: ${outcome.availableDates.join(', ')}`
        : 'Bu adrese yaklaşan bir teslimat günü yok.';
    case 'payment_not_allowed':
      return `Bu ödeme yöntemi bu siparişte açık değil. Açık yöntemler: ${outcome.methods.join(', ')}`;
    case 'address_city_mismatch':
      return `Adresin şehri posta koduyla uyuşmuyor (${outcome.postalCode}). Beklenen: ${outcome.places.join(', ')}`;
    case 'cold_chain_unshippable':
      return 'Soğuk zincir ürünü bu adrese gönderilemez — rota dışı adrese kargoyla çıkamaz.';
    case 'warehouse_unresolved':
      return outcome.reason === 'ambiguous_zone'
        ? 'Posta kodu birden çok bölgeye bağlı — bölge tanımları düzeltilmeli.'
        : 'Kargo deposu tanımlı değil.';
    case 'customer_not_found':
      return 'Müşteri bulunamadı.';
    case 'address_not_found':
      return 'Adres bulunamadı.';
    case 'empty_cart':
      return 'Kalem girilmedi.';
    case 'insufficient_stock':
      return `Stok araya girdi — kalan adet: ${outcome.available}`;
    /**
     * Masada ödeme sağlayıcısı YOK (`createPaymentSession: null`) — online ödeme buraya hiç
     * gelmemeli ve seçici onu zaten çıkarıyor (`readDeliveryContext` künyesi). Yine de karşılıksız
     * bırakılmıyor: ölçüldü 26.08, liste sıralı olduğu için `online` İLK seçenekti, akış burada
     * kırıldı ve ekranda **"Sipariş açılamadı."** yazıyordu. Sebebi yutan bir mesaj, arızayı
     * gözden saklar (CLAUDE §0).
     */
    case 'payment_unavailable':
      return 'Bu ekranda online ödeme alınamaz — masada kart çekilmiyor. Nakit, kart (kapıda), çek ya da havale seçin.';
    case 'order_not_placed':
      return 'Sipariş açıldı ama kesinleşmedi — kayıt okunamadı ya da durum geçişi reddedildi. Tekrar deneyin.';
    /**
     * MÜŞTERİ YOLUNUN kapıları — personel yolunda doğmazlar (kupon onayı, sepet imzası ve asgari
     * sepet ya geçilmiyor ya muaf). Yine de sessiz kalmıyorlar: bir gün doğarlarsa operatör
     * "bir şey oldu" değil, NE olduğunu görür.
     */
    case 'price_changed':
      return `Fiyat bu arada değişti: ${outcome.lines.map((l) => l.name).join(', ')} — kalemi yeniden ekleyin.`;
    case 'cart_changed':
      return 'Kalem listesi bu arada değişti — ekranı yenileyip tekrar deneyin.';
    case 'min_basket':
      return `Asgari sepet tutmuyor (${outcome.missingCents} kuruş eksik).`;
    /**
     * Kart yolunun hâli: taslak açıldı, ödeme istemcide tamamlanacak. Buraya GELEMEZ çünkü kapı
     * sağlayıcıyı hiç açmıyor — ama tip birleşiminde var ve `never`e daraltılamaz. Yutmak yerine
     * adlandırılıyor: gelirse sipariş ORTADA kalmış demektir ve operatör bunu bilmeli.
     */
    case 'payment_required':
      return 'Sipariş taslak olarak açıldı ama ödeme adımı bu ekranda tamamlanamaz — siparişler listesinden takip edin.';
  }
  /**
   * `default` YOK ve bu bilinçli: bir toplayıcı dal, motora eklenen YENİ bir ret hâlini sessizce
   * "Sipariş açılamadı."ya çevirirdi — sebebi yutan mesajın ta kendisi (yukarıdaki ölçülmüş arıza).
   * Böyle yazılınca yeni bir hâl DERLEMEDE kırılır: operatör görmeden önce biz görürüz.
   */
  const kalanHal: never = outcome;
  return kalanHal;
}
