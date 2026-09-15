import { AddressService, UserProfileService } from '@lezzet/database';
import { normalizePostalCode } from '@lezzet/address';
import { normalizePhone } from '@lezzet/helper';
import {
  b2bApplicationIssues,
  b2bStatusOf,
  normalizeSiret,
  normalizeVatNumber,
  resolveUserText,
  type B2bApplicationField,
  type B2bApplicationInput,
  type B2bApplicationStatus,
  type B2bCompanyFacts,
} from '@lezzet/domain-core';
import type { CompanyInfo, PreferredLanguage, UserProfile } from '@lezzet/types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyB2bApplicationReceived } from '../notification/staff-events';

import { checkEuVatNumber } from '../b2b/vat-check';

/*
  Başvuru ayrı bir varlık değil, müşteri kaydının bir hâlidir: künye yazılır, `b2b_approved` `false` olur ve kayıt onay kuyruğuna
  düşer. SIRET herkese açık bir numara olduğu için yazma onay vermez; kimlik oturumdan gelir ve denetim istemciye güvenmeden burada
  tekrarlanır.
*/

export type B2bApplicationOutcome =
  | { status: 'ok'; profile: UserProfile }
  /** Cümleyi ekran kurar; liste telden geçer ki form sunucunun reddettiği alanı işaretleyebilsin. */
  | { status: 'invalid_application'; issues: B2bApplicationField[] }
  | { status: 'profile_not_found' };

/** Kaydın son hâlini döner ki çağıran yazının gerçekte ne bıraktığını görsün. */
export async function submitB2bApplication(
  db: SupabaseClient,
  customerId: string,
  input: B2bApplicationInput,
  facts: B2bCompanyFacts,
): Promise<B2bApplicationOutcome> {
  const issues = b2bApplicationIssues(input);
  if (issues.length > 0) return { status: 'invalid_application', issues };

  const profiles = new UserProfileService(db);
  const profile = await profiles.getById(customerId);
  if (!profile) return { status: 'profile_not_found' };

  const isEuVat = input.kind === 'eu_vat';
  const siret = input.kind === 'siret' ? normalizeSiret(input.siret) : null;

  // SIRET yolunda numara formun resmî kayıt sorgusundan gelir; burada yeniden sormak başvuruyu saniyelerce uzatırdı. Uydurma
  // numara yine geçerli sayılmaz, çünkü onay kartı açılışta resmî kaydı ve VIES'i yeniden sorar.
  const vatNumber = isEuVat ? normalizeVatNumber(input.vatNumber) : facts.vatNumber ?? null;

  // Doğrulama yalnız numarayı başvuranın yazdığı AB yolunda; `null` "sorulmadı" demektir ve onay kartı açılışta sorar. Sorulamayan
  // numarayı geçerli saymak ters vergilendirmeyi açardı.
  const vatNumberValid = isEuVat && vatNumber ? await checkEuVatNumber(vatNumber) : null;
  // Damga yalnız kesin cevapta; "sorulamadı" damgalansaydı onay kartı hiç yapılmamış bir doğrulamaya yaş verirdi.
  const vatNumberCheckedAt = vatNumberValid === null ? null : new Date().toISOString();

  const companyInfo: CompanyInfo = {
    legalName: input.legalName.trim(),
    siret,
    activityCode: facts.activityCode,
    foundedYear: facts.foundedYear,
    isActive: facts.isActive,
  };

  // Numara başka bir kayıtta dursa da yazılır: kolon kimlik anahtarı değil iletişim numarasıdır; mükerrer kayıt şüphesini onay
  // kartı gösterir.
  const phone = normalizePhone(input.phone, isEuVat ? 'DE' : 'FR');

  const updated = await profiles.update({
    id: profile.id,
    /**
     * Kayıt başvuruda şirket olur, çünkü `type` hukuki kimliktir ve KDV kanalını belirler. Toptan fiyatı ve vadeli ödemeyi açan
     * ayrı karar `b2bApproved`, o da operatörün.
     */
    type: 'company',
    companyInfo,
    vatNumber,
    vatNumberValid,
    vatNumberCheckedAt,
    // Kuyruğa girer, onaylanmaz; `null` yazmak kaydı bekleyen listesinden düşürürdü, çünkü kısmi indeks `false` arar.
    b2bApproved: false,
    // Ad ve telefon yalnız boşsa yazılır: B2C hesabıyla başvuranın adını yetkilinin adıyla ezmek geçmiş siparişlerin sahibini
    // değiştirirdi.
    ...(profile.name.trim().length === 0 ? { name: input.contactName.trim() } : {}),
    ...(profile.phone || !phone ? {} : { phone }),
    // Telefonla açılmış taslak kayıt, sahibi doğrulanmış bir başvuruyla kapanır.
    isDraft: false,
  });

  // Adres onay kartının rota sinyalini besler; adres yoksa sinyal ölçülemez.
  const addresses = new AddressService(db);
  const existing = await addresses.listByCustomer(customerId);
  const line1 = input.line1.trim();
  const postalCode = normalizePostalCode(input.postalCode);
  const alreadyThere = existing.some(
    (a) => a.line1.trim().toLowerCase() === line1.toLowerCase() && normalizePostalCode(a.postalCode) === postalCode,
  );
  /*
    Başvurunun adresi işletmenin künye adresidir, fatura da oradan çıkar; işaret bu yüzden burada konur. Zaten kayıtlı adres de
    işaretlenir: atlanan şey satırın kendisidir, rolü değil.
  */
  if (alreadyThere) {
    const mevcut = existing.find(
      (a) => a.line1.trim().toLowerCase() === line1.toLowerCase() && normalizePostalCode(a.postalCode) === postalCode,
    );
    if (mevcut && !mevcut.isBilling) await addresses.setBilling(mevcut.id);
  } else {
    const eklenen = await addresses.addForCustomer({
      customerId,
      // Müşterinin ödemede iki adres arasında ayırt edeceği şey sokak adı değil "burası iş yerim" bilgisidir.
      label: companyInfo.legalName,
      recipient: input.contactName.trim(),
      line1,
      postalCode,
      city: input.city.trim(),
      /* Kapıda aranacak numara adrese aittir. `normalizePhone` tanıyamazsa başvuranın yazdığı metin geçer: kolon boş kalamaz ve
         kurye numarasız kalmamalı. */
      phone: phone ?? input.phone.trim(),
      country: isEuVat ? 'DE' : 'FR',
    });
    /* İşaret eklemeden sonra konur: gövdede `isBilling: true` eski işaret temizlenmeden ikinci işaretli satırı yazar ve tekillik
       indeksine çarpar. */
    await addresses.setBilling(eklenen.id);
  }

  // Yönetim yeni başvuruyu bu bildirimden öğrenir; bildirim kendi hatasını yutar, çünkü başvuru kaydı ondan önemli.
  await notifyB2bApplicationReceived(db, customerId);

  return { status: 'ok', profile: updated };
}

export interface B2bApplicantView {
  status: B2bApplicationStatus;
  contactName: string;
  email: string;
  phone: string;
  /** Başvuranın dilinde; sebebini bilmeyen başvuran aynı eksikle yeniden başvurur. */
  rejectReason: string | null;
  /** Makine çevirisiyse ekran "otomatik çevrildi" der. */
  rejectReasonTranslated: boolean;
}

/**
 * Ön dolgu, aynı hesapta ikinci bir iletişim kişisi doğmasın diye; adres okunmaz, çünkü başvuru teslimat adresini değil işletme
 * adresini sorar. `viewLanguage` varsayılansız: unutulan dil Fransız başvurana Türkçe gerekçe gösterirdi.
 */
export async function readB2bApplicant(
  db: SupabaseClient,
  customerId: string,
  viewLanguage: PreferredLanguage,
): Promise<B2bApplicantView | null> {
  const profile = await new UserProfileService(db).getById(customerId);
  if (!profile) return null;

  // Kaynak dil sabit `tr`, çünkü operasyon yüzeyi tek dilli. Orijinal dışarı verilmez: Türkçe gerekçeyle başvuranın yapabileceği
  // bir şey yok.
  const gerekce = resolveUserText(
    { text: profile.b2bRejectReason, language: 'tr', translations: profile.b2bRejectReasonTranslations },
    viewLanguage,
  );

  return {
    status: b2bStatusOf(profile),
    contactName: profile.name ?? '',
    email: profile.email ?? '',
    phone: profile.phone ?? '',
    rejectReason: gerekce.text,
    rejectReasonTranslated: gerekce.isTranslated,
  };
}
