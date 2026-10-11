'use server';

import { revalidatePath } from 'next/cache';
import { AddressService, ConversationService, serviceDb } from '@lezzet/database';
import { placeOrder } from '@lezzet/application';
import {
  createStaffCustomer,
  previewStaffCompany,
  type StaffCustomerField,
  type StaffCustomerInput,
  type StaffCustomerOutcome,
} from '@lezzet/application/customer/staff-customer';
import { isValidPostalCode, normalizePostalCode } from '@lezzet/address';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { ORDERS_PATH } from '../orders-url';
import {
  readAddressOptions,
  readDeliveryContext,
  searchCustomerOptions,
  searchVariantRows,
  toCustomerOption,
} from './new-order-read';
import type { OrderSource } from '@lezzet/types';
import type {
  AddressPickOption,
  CompanyPreview,
  CustomerPickOption,
  DeliveryContext,
  NewAddressInput,
  VariantPickRow,
} from './new-order-types';
import type { PaymentMethod } from '@lezzet/types';

// Elle sipariş girişinin sunucu eylemleri: `requireAdmin` ilk satırda, iş servise ve motora devredilir, sonuç `{ data, error }`
// döner. Pazarlıklı fiyat yalnız admin, çünkü ekranda gizlemek yetmez: istemci gizlenmiş bir alanı yine gönderebilir.

export async function searchCustomersAction(term: string): Promise<ActionResult<CustomerPickOption[]>> {
  try {
    await requireAdmin();
    return { data: await searchCustomerOptions(serviceDb(), term), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

const INVALID_FIELD_MESSAGE: Record<StaffCustomerField, string> = {
  name: 'Müşteri adı girilmeli.',
  phone: 'Telefon girilmeli — kurye kapıda kimi arayacağını bilmek zorunda.',
  email: 'E-posta geçersiz.',
  siret: 'SIRET geçersiz: 14 hane olmalı ve kontrol hanesi tutmalı.',
};

/** Var olan kayıt adıyla anılır ki personel yenisini açmak yerine onu seçsin. */
function staffCustomerError(outcome: Exclude<StaffCustomerOutcome, { status: 'ok' }>): string {
  switch (outcome.status) {
    case 'invalid':
      return INVALID_FIELD_MESSAGE[outcome.field];
    case 'taken':
      return `Bu ${outcome.key === 'email' ? 'e-posta' : 'SIRET'} "${outcome.existing.name}" kaydında; aramadan o kaydı seçin.`;
    case 'siret_not_found':
      return 'Bu SIRET resmî kayıtta yok; numarayı kontrol edin.';
  }
}

/** SIRET yazılınca resmî kayıt satırı ve aynı SIRET'li kayıtlar; personel kaydı açmadan doğru işletmeye baktığını görür. */
export async function previewCompanyAction(siret: string): Promise<ActionResult<CompanyPreview>> {
  try {
    await requireAdmin();
    const preview = await previewStaffCompany(serviceDb(), siret);
    return { data: { registry: preview.registry, existing: preview.existing.map(toCustomerOption) }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Bul ya da oluştur akışının "oluştur" tarafı; kural ortak kapıda (`createStaffCustomer`), burada yetki ve cümle. */
export async function createCustomerAction(input: StaffCustomerInput): Promise<ActionResult<CustomerPickOption>> {
  try {
    await requireAdmin();
    const outcome = await createStaffCustomer(serviceDb(), input);
    if (outcome.status !== 'ok') return { data: null, error: staffCustomerError(outcome) };
    return { data: toCustomerOption(outcome.profile), error: null };
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
 * Adres ekleme: sipariş deposu ve teslimat günü adresten çözülür, yani adressiz sipariş açılamaz. Alıcı ve telefon zorunlu, çünkü
 * kurye kapıda kimi soracağını ve kimi arayacağını bilmek zorunda.
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
    const postalCode = normalizePostalCode(input.postalCode);
    const city = input.city.trim();
    if (!recipient || !phone) throw new Error('Alıcı ve telefon girilmeli.');
    if (!line1 || !postalCode || !city) throw new Error('Sokak, posta kodu ve şehir girilmeli.');
    if (!isValidPostalCode(postalCode)) throw new Error('Posta kodu beş rakam olmalı.');

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
  /**
   * Sipariş bir konuşmadan açıldıysa onun kimliği; kaynak (`order_source`) istemciden alınmaz, sunucu konuşmaya bakıp türetir,
   * çünkü aksi hâlde istemci raporlardaki kanal dağılımını yazabilirdi.
   */
  conversationId?: string | null;
  /** Kalemler; `unitPriceCents` YALNIZ pazarlık edildiyse gönderilir (aşağıdaki künye). */
  lines: { variantId: string; qty: number; unitPriceCents: number | null }[];
}

/**
 * Sohbetten açılan siparişin kaynağı konuşmanın kanalından türer; konuşma yoksa `undefined` döner ve motor kendi varsayılanını
 * (`manual`) kullanır. Bugün yalnız WhatsApp eşlenir, çünkü `order_source`ta Messenger ve Instagram yok ve eksik ama doğru kayıt
 * uydurulmuş bir kanaldan iyidir.
 */
async function orderSourceOfConversation(conversationId: string | null | undefined): Promise<OrderSource | undefined> {
  if (!conversationId) return undefined;
  const conversation = await new ConversationService(serviceDb()).getById(conversationId);
  return conversation?.source === 'whatsapp' ? 'whatsapp' : undefined;
}

/**
 * Telefonla gelen siparişin masada yazılması; zincir müşteri yolunun kendisidir (`placeOrder`), farkı yalnız `staff` künyesi.
 * Pazarlıksız kalem fiyat göndermez, çünkü istemcinin gönderdiği sayı siparişin parasını belirlerdi; masada ödeme sağlayıcısı
 * yoktur, kart seçilirse tahsilat kapıda yapılır.
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
        // Kaynak sunucuda, konuşmanın kanalından çözülür (`orderSourceOfConversation`).
        orderSource: await orderSourceOfConversation(input.conversationId),
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
 * Motorun yapısal reddini operatörün diline çevirir; çeviri motorda değil burada, çünkü aynı ret müşteri yüzeyinde başka bir
 * cümleyle anlatılır ve dili çağıran seçer.
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
      if (outcome.reason === 'outside_zones') return 'Adres müşterinin işinin bölgeleri dışında; QUALITE kargo göndermez.';
      return outcome.reason === 'ambiguous_zone'
        ? 'Posta kodu birden çok bölgeye bağlı — bölge tanımları düzeltilmeli.'
        : 'Kargo deposu tanımlı değil.';
    case 'customer_not_found':
      return 'Müşteri bulunamadı.';
    case 'shipping_option_unavailable':
      return 'Bu adrese eve teslim eden kargo servisi bulunamadı.';
    case 'shipping_unpriced':
      return outcome.reason === 'carrier'
        ? 'Taşıyıcıdan kargo fiyatı alınamadı; birkaç dakika sonra tekrar deneyin.'
        : 'Kargo fiyatı hesaplanamıyor: ürünün ambalaj ölçüsü, deponun kargo kutusu ya da depo adresi eksik.';
    case 'service_point_invalid':
      return 'Seçilen kargo servisi teslim noktası istiyor; nokta geçerli değil.';
    case 'address_not_found':
      return 'Adres bulunamadı.';
    case 'empty_cart':
      return 'Kalem girilmedi.';
    case 'insufficient_stock':
      return `Stok araya girdi — kalan adet: ${outcome.available}`;
    /**
     * Masada ödeme sağlayıcısı yok ve seçici online ödemeyi zaten çıkarıyor; yine de karşılıksız bırakılmaz, çünkü sebebi yutan
     * "Sipariş açılamadı." mesajı arızayı gözden saklar.
     */
    case 'payment_unavailable':
      return 'Bu ekranda online ödeme alınamaz — masada kart çekilmiyor. Nakit, kart (kapıda) ya da havale seçin.';
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
     * Kart yolunun hâli buraya gelemez, çünkü kapı sağlayıcıyı hiç açmıyor; ama tip birleşiminde var ve adlandırılıyor, çünkü
     * gelirse sipariş ortada kalmış demektir ve operatör bunu bilmeli.
     */
    case 'payment_required':
    case 'open_payment':
      return 'Sipariş taslak olarak açıldı ama ödeme adımı bu ekranda tamamlanamaz — siparişler listesinden takip edin.';
    // Elle giriş gel-al seçmez (adres yolu); bu iki ret ancak istek elle kurulursa doğar ve adlandırılır ki sessiz kalmasın.
    case 'pickup_not_allowed':
    case 'pickup_warehouse_unavailable':
      return 'Gel-al seçimi elle sipariş girişinde yok — sipariş adrese teslim olarak yazılır, yeniden deneyin.';
  }
  /**
   * `default` YOK ve bu bilinçli: bir toplayıcı dal, motora eklenen YENİ bir ret hâlini sessizce
   * "Sipariş açılamadı."ya çevirirdi — sebebi yutan mesajın ta kendisi (yukarıdaki ölçülmüş arıza).
   * Böyle yazılınca yeni bir hâl DERLEMEDE kırılır: operatör görmeden önce biz görürüz.
   */
  const kalanHal: never = outcome;
  return kalanHal;
}
