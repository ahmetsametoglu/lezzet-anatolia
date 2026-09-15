import { SupplierService } from '@lezzet/database';
import { pinpointSupplier } from '@lezzet/domain-core';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * TEDARİKÇİ KARTININ KAPISI — Tedarik ekranının eylemi (`saveSupplierAction`) ve asistanın tedarikçi
 * önerisinin uygulayıcısı (`APPLIERS.supplier_create`, 22.44) aynı kurallardan geçer.
 *
 * Kapı web eyleminin içindeydi. Uygulayıcı eklenince ikinci bir kopya doğacaktı: iletişim alanlarının
 * kuruluşu ve mükerrer yoklaması iki yerde yazılır, bir gün biri ötekinden ayrışırdı (`APPLIERS` künyesi:
 * kuyruk ikinci bir yazma yolu açmaz).
 *
 * İletişim JSON olarak durur (`contact`) ve üç adlı alandan kurulur: telefon, e-posta, adres. Serbest
 * JSON'a bırakılsaydı her kayıt farklı anahtar kullanır ve "WhatsApp'tan sipariş gönder" bağlantısı hiçbir
 * kayıtta güvenle çalışmazdı — telefon o bağlantının anahtarıdır.
 */
export interface SupplierFields {
  name: string;
  vatNumber?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  country?: string | null;
  paymentTermDays?: number | null;
  note?: string | null;
  isActive: boolean;
}

/** Form ya da dilekçe → kaydın alanları. Boş metin `null`; ülke büyük harfle, boş = bilinmiyor ("FR" varsayılmaz). */
export function supplierRowOf(input: SupplierFields) {
  const contact = {
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.address?.trim() ? { address: input.address.trim() } : {}),
  };
  return {
    name: input.name.trim(),
    // Boş nesne yerine null: "iletişim bilgisi yok" ile "boş kayıt" aynı şey değil, ve okuyan taraf
    // `contact?.phone` diye bakıyor — boş nesne de aynı cevabı verir ama satırı kirletir.
    contact: Object.keys(contact).length > 0 ? contact : null,
    vatNumber: input.vatNumber?.trim() || null,
    // Ülke büyük harfle (12.26): "be" yazan da "BE" kaydeder.
    country: input.country?.trim().toUpperCase() || null,
    // null = peşin çalışıyoruz (şemanın kendi sözleşmesi); 0 gün yazmak "vade var ama sıfır" olurdu.
    paymentTermDays: input.paymentTermDays ?? null,
    note: input.note?.trim() || null,
    isActive: input.isActive,
  };
}

/**
 * Kayıtlı bir tedarikçiye NOKTA ATIŞI gidiyor mu (22.44 · kullanıcı kararı 14.09) — aynı vergi numarası,
 * telefon ya da tam ad; pasif kayıtlar da sayılır. Gidiyorsa kaydın adı (birden çok kayda gidiyorsa `null`),
 * gitmiyorsa `null` değil boş sonuç: faturadaki kimlik tek karta gitmeli, yoksa asistanın araması "birden
 * çok" der ve tedarikçinin borcu iki karta bölünür.
 */
export async function duplicateSupplierOf(
  db: SupabaseClient,
  input: Pick<SupplierFields, 'name' | 'vatNumber' | 'phone'>,
): Promise<{ existingName: string | null } | null> {
  const outcome = pinpointSupplier(await new SupplierService(db).list(), {
    vatNumber: input.vatNumber?.trim() || null,
    phone: input.phone?.trim() || null,
    name: input.name.trim(),
  });
  if (outcome.status === 'found') return { existingName: outcome.record.name };
  if (outcome.status === 'ambiguous') return { existingName: null };
  return null;
}

/** Mükerrer kaydın okunur cümlesi — ekran ve kuyruk aynı cümleyi söyler. */
export function duplicateSupplierMessage(existingName: string | null): string {
  return existingName
    ? `Bu tedarikçi zaten kayıtlı: ${existingName}.`
    : 'Vergi numarası, telefon ya da ad birden çok kayıtlı tedarikçiye gidiyor — önce kartları gözden geçirin.';
}

/** Yeni tedarikçi — önce mükerrer yoklaması, sonra kayıt. Ret fırlatılmaz, sonuç olarak döner. */
export async function createSupplier(
  db: SupabaseClient,
  input: SupplierFields,
): Promise<{ status: 'ok'; supplierId: string } | { status: 'duplicate'; existingName: string | null }> {
  const row = supplierRowOf(input);
  if (!row.name) throw new Error('Tedarikçi adı gerekli.');
  const duplicate = await duplicateSupplierOf(db, input);
  if (duplicate) return { status: 'duplicate', existingName: duplicate.existingName };
  const supplier = await new SupplierService(db).insert(row);
  return { status: 'ok', supplierId: supplier.id };
}
