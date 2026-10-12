'use server';

import { revalidatePath } from 'next/cache';
import { AddressService, ConversationService, serviceDb } from '@lezzet/database';
import { createStaffCustomer, previewStaffCompany, type StaffCustomerOutcome } from '@lezzet/application/customer/staff-customer';
import {
  addStaffAddress,
  placeStaffOrder,
  readStaffAddresses,
  readStaffDeliveryContext,
  searchStaffCustomers,
  searchStaffVariants,
  staffCustomerOptionOf,
  staffCustomerOptionsOf,
  staffOrderRejectionText,
} from '@lezzet/application/order/staff-order';
import type {
  OrderSource,
  PaymentMethod,
  StaffCustomerField,
  StaffCustomerInput,
  StaffAddressField,
  StaffAddressInput,
  StaffAddressOption,
  StaffCustomerOption,
  StaffVariantRow,
} from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { ORDERS_PATH } from '../orders-url';
import type { CompanyPreview, DeliveryContext } from './new-order-types';

// Elle sipariş girişinin sunucu eylemleri: `requireAdmin` ilk satırda, okumalar ve yazım mobil sipariş girişiyle ortak katmandadır
// (`staff-order`), sonuç `{ data, error }` döner.

export async function searchCustomersAction(term: string): Promise<ActionResult<StaffCustomerOption[]>> {
  try {
    await requireAdmin();
    return { data: (await searchStaffCustomers(serviceDb(), { term })).rows, error: null };
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
    const db = serviceDb();
    const preview = await previewStaffCompany(db, siret);
    return { data: { registry: preview.registry, existing: await staffCustomerOptionsOf(db, preview.existing) }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Bul ya da oluştur akışının "oluştur" tarafı; kural ortak kapıda (`createStaffCustomer`), burada yetki ve cümle. */
export async function createCustomerAction(input: StaffCustomerInput): Promise<ActionResult<StaffCustomerOption>> {
  try {
    await requireAdmin();
    const db = serviceDb();
    const outcome = await createStaffCustomer(db, input);
    if (outcome.status !== 'ok') return { data: null, error: staffCustomerError(outcome) };
    return { data: await staffCustomerOptionOf(db, outcome.profile), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function readAddressesAction(customerId: string): Promise<ActionResult<StaffAddressOption[]>> {
  try {
    await requireAdmin();
    return { data: await readStaffAddresses(serviceDb(), customerId), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

const ADDRESS_FIELD_MESSAGE: Record<StaffAddressField, string> = {
  recipient: 'Alıcı ve telefon girilmeli.',
  phone: 'Alıcı ve telefon girilmeli.',
  line1: 'Sokak, posta kodu ve şehir girilmeli.',
  postalCode: 'Posta kodu beş rakam olmalı.',
  city: 'Sokak, posta kodu ve şehir girilmeli.',
};

/** Adres ekleme; siparişin deposu ve teslim günü adresten çözülür, yani adressiz sipariş açılamaz. */
export async function createAddressAction(customerId: string, input: StaffAddressInput): Promise<ActionResult<StaffAddressOption>> {
  try {
    await requireAdmin();
    const outcome = await addStaffAddress(serviceDb(), customerId, input);
    if (outcome.status === 'invalid') return { data: null, error: ADDRESS_FIELD_MESSAGE[outcome.field] };
    if (outcome.status === 'not_found') return { data: null, error: 'Müşteri bulunamadı.' };
    return { data: outcome.address, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Adres seçilince teslim bağlamı; sepet boşken açık yöntemler gösterilir, kesin tavan kontrolü sipariş yazılırken yapılır. */
export async function readDeliveryContextAction(customerId: string, addressId: string): Promise<ActionResult<DeliveryContext>> {
  try {
    await requireAdmin();
    const context = await readStaffDeliveryContext(serviceDb(), { customerId, addressId, lines: [] });
    if (!context) throw new Error('Adres bulunamadı.');
    return {
      data: { ...context.delivery, paymentMethods: context.payment.methods, creditAvailable: context.payment.creditAvailable },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Kalem seçicisinin araması: fiyat ve satılabilirlik teslim adresinin ülkesinden okunur, adres seçilmediyse genel fiyat. Ülke adresin
 * kaydından okunur, çünkü seçicinin adres satırı ülke taşımaz; adres başka müşterininse yok sayılır.
 */
export async function searchVariantsAction(
  customerId: string,
  term: string,
  warehouseId: string | null,
  addressId: string | null,
): Promise<ActionResult<StaffVariantRow[]>> {
  try {
    await requireAdmin();
    const db = serviceDb();
    const address = addressId ? await new AddressService(db).getById(addressId) : null;
    const country = address?.customerId === customerId ? address.country : null;
    // Masa yöneticinindir ve yönetici pazarlık yazar; maliyet ve hedef marj marj-altı uyarısı için satırda gelir.
    const page = await searchStaffVariants(db, { customerId, term, warehouseId, includeCost: true, country });
    return { data: page.rows, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Dışa açılmıyor: `'use server'` dosyasının dışa verdiği her ad bir uçtur ve tek çağıranı aşağıdaki eylemdir.
 */
interface ManualOrderInput {
  customerId: string;
  addressId: string;
  deliveryDate: string | null;
  paymentMethod: PaymentMethod;
  onAccount: boolean;
  isGiftOrder: boolean;
  /**
   * Sipariş bir konuşmadan açıldıysa onun kimliği; kaynak istemciden alınmaz, sunucu konuşmaya bakıp türetir, çünkü aksi hâlde
   * istemci raporlardaki kanal dağılımını yazabilirdi.
   */
  conversationId?: string | null;
  /** `unitPriceCents` yalnız pazarlık edildiyse gelir; öteki kalemin fiyatını motor çözer. */
  lines: { variantId: string; qty: number; unitPriceCents: number | null }[];
}

/**
 * Sohbetten açılan siparişin kaynağı konuşmanın kanalından türer; konuşma yoksa `undefined` döner ve motor kendi varsayılanını
 * (`manual`) kullanır. Bugün yalnız WhatsApp eşlenir, çünkü `order_source`ta Messenger ve Instagram yok.
 */
async function orderSourceOfConversation(conversationId: string | null | undefined): Promise<OrderSource | undefined> {
  if (!conversationId) return undefined;
  const conversation = await new ConversationService(serviceDb()).getById(conversationId);
  return conversation?.source === 'whatsapp' ? 'whatsapp' : undefined;
}

/** Telefonla gelen siparişin masada yazılması; kapılar ve ret cümlesi mobil sipariş girişiyle ortak (`placeStaffOrder`). */
export async function createManualOrderAction(input: ManualOrderInput): Promise<ActionResult<{ orderId: string }>> {
  try {
    const staff = await requireAdmin();
    const { conversationId, ...order } = input;
    const outcome = await placeStaffOrder(serviceDb(), {
      ...order,
      actorId: staff.profileId,
      orderSource: await orderSourceOfConversation(conversationId),
    });
    if (outcome.status !== 'placed') throw new Error(staffOrderRejectionText(outcome));
    revalidatePath(ORDERS_PATH);
    return { data: { orderId: outcome.orderId }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
