import { UserProfileService } from '@lezzet/database';
import { isValidSiret, normalizeSiret } from '@lezzet/domain-core';
import { isValidEmail, normalizeEmail } from '@lezzet/helper';
import type { CustomerType, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  companyInfoOf,
  lookupCompanyBySiret,
  type CompanyLookupFailure,
  type CompanyRegistryRecord,
} from '../b2b/company-registry';
import { addCustomerAddress, setBillingCustomerAddress } from './addresses';

/*
  Personelin müşteri adına açtığı kayıt girişsiz ve taslaktır; müşteri bir gün aynı e-postayla girerse kayıt oturumuna bağlanır.
  Şirket kaydı SIRET'le açılır: künye ve fatura adresi resmî kayıttan okunur, kayıt B2B onay kuyruğuna girer (DOMAIN §10).
*/

export interface StaffCustomerInput {
  name: string;
  /** Kurye kapıda arayacağı için zorunlu; benzersiz değil, aile ve iş yeri numarası meşrudur. */
  phone: string;
  email: string | null;
  type: CustomerType;
  /** Yalnız şirket kaydında okunur; boş bırakılırsa kayıt künyesiz açılır. */
  siret: string | null;
}

export type StaffCustomerField = 'name' | 'phone' | 'email' | 'siret';

export type StaffCustomerOutcome =
  | { status: 'ok'; profile: UserProfile }
  | { status: 'invalid'; field: StaffCustomerField }
  /** Var olan kayıt seçilir, yenisi açılmaz: iki kayıt sipariş geçmişini ve cari bakiyeyi ikiye böler. */
  | { status: 'taken'; key: 'email' | 'siret'; existing: UserProfile }
  | { status: 'siret_not_found' };

/** Personelin SIRET'i yazdığı anda gördüğü önizleme; kaydı açmadan önce doğru işletmeye baktığını görsün diye. */
export interface StaffCompanyPreview {
  registry: CompanyRegistryRecord | CompanyLookupFailure;
  /** Aynı SIRET'i taşıyan müşteriler; doluysa yeni kayıt açılmaz. */
  existing: UserProfile[];
}

export async function previewStaffCompany(db: SupabaseClient, rawSiret: string): Promise<StaffCompanyPreview> {
  const siret = normalizeSiret(rawSiret);
  const [registry, existing] = await Promise.all([lookupCompanyBySiret(siret), new UserProfileService(db).listBySiret(siret)]);
  return { registry, existing };
}

export async function createStaffCustomer(db: SupabaseClient, input: StaffCustomerInput): Promise<StaffCustomerOutcome> {
  const name = input.name.trim();
  if (!name) return { status: 'invalid', field: 'name' };
  const phone = input.phone.trim();
  if (!phone) return { status: 'invalid', field: 'phone' };
  const email = normalizeEmail(input.email ?? '');
  if (email !== null && !isValidEmail(email)) return { status: 'invalid', field: 'email' };
  const siret = input.type === 'company' && input.siret?.trim() ? normalizeSiret(input.siret) : null;
  if (siret !== null && !isValidSiret(siret)) return { status: 'invalid', field: 'siret' };

  const profiles = new UserProfileService(db);
  const [byEmail, bySiret] = await Promise.all([
    email === null ? null : profiles.findByEmail(email),
    siret === null ? [] : profiles.listBySiret(siret),
  ]);
  if (byEmail) return { status: 'taken', key: 'email', existing: byEmail };
  const [siretOwner] = bySiret;
  if (siretOwner) return { status: 'taken', key: 'siret', existing: siretOwner };

  // Servis cevap vermezse kayıt yine açılır ve künye adı personelin yazdığı addır; onay kartı açılışta resmî kaydı yeniden sorar.
  const registry = siret === null ? null : await lookupCompanyBySiret(siret);
  if (registry === 'not_found') return { status: 'siret_not_found' };
  const record = registry === 'unavailable' ? null : registry;

  const profile = await profiles.insert({
    name,
    phone,
    email,
    type: input.type,
    isDraft: true,
    ...(siret === null
      ? {}
      : { companyInfo: record ? companyInfoOf(record) : { legalName: name, siret }, vatNumber: record?.vatNumber ?? null }),
  });

  // Künye adresi fatura adresidir; onay kartının rota sinyali de bu adresten ölçülür.
  if (record && record.line1 && record.postalCode && record.city) {
    const added = await addCustomerAddress(db, {
      customerId: profile.id,
      label: record.legalName,
      recipient: name,
      line1: record.line1,
      postalCode: record.postalCode,
      city: record.city,
      phone,
    });
    const [address] = added.status === 'ok' ? added.addresses : [];
    if (address) await setBillingCustomerAddress(db, { customerId: profile.id, addressId: address.id });
  }

  return { status: 'ok', profile };
}
