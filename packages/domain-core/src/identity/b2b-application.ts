import { isValidEmail, normalizePhone, isValidPostalCode } from '@lezzet/helper';
import type { CompanyInfo } from '@lezzet/types';

/**
 * B2B **başvurusunun** saf kuralları (08.7) — onay kartının sinyalleri değil (`b2b-approval`).
 *
 * İkisi bilerek ayrı dosyada: burası müşterinin GÖNDERDİĞİ formu denetler, öteki adminin GÖRDÜĞÜ
 * kartı besler. Aynı dosyada olsalardı "başvuru geçerli mi" ile "başvuru iyi mi" soruları
 * karışırdı — birincisi biçim, ikincisi karar.
 *
 * Kuralların burada olmasının sebebi çift tüketim: aynı denetimi hem form (düğmeyi ne zaman
 * açacağını bilmeli) hem server action (istemciye güvenilmez) yapıyor. Ekranda yazılsaydı
 * sunucu kendi kopyasını yazardı ve iki taraf bir gün ayrışırdı — ekran "gönderilebilir" derken
 * sunucu reddeden bir form, kullanıcının çıkamayacağı bir döngüdür.
 */

/**
 * Başvurunun İKİ YOLU (tasarımın iki sekmesi).
 *
 * `siret` Fransız şirketi: numara resmî kayıttan künyeyi getirir, aday yalnız doğrular.
 * `eu_vat` Almanya (ve ileride AB): resmî kayıt muadili açık bir kaynak yok, künye elle girilir
 * ve doğrulama AB vergi numarası üzerinden yürür.
 *
 * Ad ülkeyle DEĞİL yöntemle anıldı: yarın Belçikalı bir alıcı da AB vergi numarasıyla başvurabilir
 * ve o gün `de` adında bir yol saçma olurdu.
 */
export type B2bApplicationKind = 'siret' | 'eu_vat';

/** Rakam dışını atar — "907 496 640 00026" ve "90749664000026" aynı numaradır. */
export function normalizeSiret(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * SIRET'in KENDİ İÇİNDE tutarlı olup olmadığı — 14 hane + Luhn.
 *
 * Bu bir varlık denetimi DEĞİL: numara Luhn'dan geçse de öyle bir işletme olmayabilir. Değeri
 * şurada: elle yazılan 14 hanenin tek hane hatası (`00026` yerine `00025`) resmî kayda hiç
 * gitmeden yakalanır ve müşteri "kayıt bulunamadı" yerine "numarayı kontrol edin" görür.
 *
 * **La Poste istisnası gerçek:** SIREN `356 000 000` Luhn'a uymaz (hane toplamının 5'e bölünmesi
 * kuralıyla doğrulanır). Meşru bir numarayı biçim denetiminde elemek, elemenin en kötü türüdür —
 * müşteri kendi doğru numarasını yanlış sanır.
 */
export function isValidSiret(raw: string): boolean {
  const s = normalizeSiret(raw);
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith('356000000')) {
    return [...s].reduce((sum, ch) => sum + Number(ch), 0) % 5 === 0;
  }
  // Luhn: sağdan başlayarak çift sıradaki haneler ikiye katlanır, 9'u geçen 9 çıkarılır.
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    let d = Number(s[13 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

/**
 * Okunur biçim `907 496 640 00026` — SIREN (9) + NIC (5).
 *
 * Ekranda gruplanmış göstermek bir süs değil doğrulama yardımı: müşteri numarayı belgesinden
 * okurken de bu gruplarla okur, tek blok 14 hanede karşılaştırma yapamaz.
 */
export function formatSiret(raw: string): string {
  const s = normalizeSiret(raw);
  if (s.length !== 14) return s;
  return `${s.slice(0, 3)} ${s.slice(3, 6)} ${s.slice(6, 9)} ${s.slice(9)}`;
}

/** Boşluk/noktalama atar, büyük harfe çevirir — `de 812 345 678` → `DE812345678`. */
export function normalizeVatNumber(raw: string): string {
  return raw.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

/**
 * `DE812345678` → `{ country: 'DE', number: '812345678' }`; biçim tutmuyorsa `null`.
 *
 * Ülke kodu ayrıştırılıyor çünkü doğrulama servisi ikisini AYRI ister. Gövde 2-12 karakter:
 * AB'nin en kısası (ör. Belçika ardından 10 hane) ile en uzunu arasındaki aralık. Karakter
 * kümesi harf de kabul eder (İrlanda ve Hollanda numaralarında harf vardır) — yalnız rakam
 * dayatmak o ülkelerin numaralarını daha bakılmadan elerdi.
 */
export function splitVatNumber(raw: string): { country: string; number: string } | null {
  const v = normalizeVatNumber(raw);
  const match = /^([A-Z]{2})([0-9A-Z]{2,12})$/.exec(v);
  if (!match) return null;
  const [, country = '', number = ''] = match;
  return { country, number };
}

/** Alanlar tam olarak tasarımın sorduğu kadar — eksik ya da fazlası burada görünür. */
export interface B2bApplicationInput {
  kind: B2bApplicationKind;
  /** `siret` yolunda zorunlu. */
  siret: string;
  /** `eu_vat` yolunda elle girilir; `siret` yolunda resmî kayıttan gelir. */
  legalName: string;
  /** `eu_vat` yolunda zorunlu; `siret` yolunda hiç sorulmaz. */
  vatNumber: string;
  contactName: string;
  email: string;
  phone: string;
  /** Adres `eu_vat` yolunda elle; `siret` yolunda resmî kayıttan gelir (ikisinde de dolu olmalı). */
  line1: string;
  postalCode: string;
  city: string;
}

export type B2bApplicationField = keyof B2bApplicationInput;

/**
 * Başvurunun DENETLENMEYEN yarısı: resmî kayıttan gelen olgular.
 *
 * Ayrı bir tip, çünkü ayrı bir cins bilgi — bunları aday yazmıyor, doğrulamıyor ve eksikliği
 * başvuruyu geçersiz kılmıyor (AB yolunda hiçbiri gelmez). `b2bApplicationIssues` bu alanlara
 * hiç bakmaz; onların karşılığı onay kartındaki sinyaller (`b2b-approval`), form değil.
 *
 * Burada duruyor ki ekran ile sunucu aynı şekli konuşsun: sunucu tarafındaki yazma modülü
 * `server-only`, ekran onu import edemez.
 */
export interface B2bCompanyFacts {
  activityCode: string | null;
  foundedYear: number | null;
  /** Resmî kayıt açık mı; `null` = sorulamadı ya da hiç sorulmadı (AB yolu). */
  isActive: boolean | null;
}

/**
 * Eksik/bozuk alanların LİSTESİ — ilk hata değil hepsi.
 *
 * Tek tek döndürmek formu "düzelt-gönder-düzelt" döngüsüne sokardı; tasarımın hedefi başvurunun
 * bir dakikada bitmesi. Dönen şey ANAHTAR listesi, cümle değil: cümleyi ekran kurar (müşteri
 * yüzeyinin `errorKey` sözleşmesiyle aynı gerekçe).
 *
 * **Adres iki yolda da zorunlu** ve bu bilinçli: adres yoksa onay kartının rota sinyali
 * "ölçülemedi" kalır (`b2b-approval`), yani operatör başvuruyu değerlendiremez. `siret` yolunda
 * alan ekranda görünmez — resmî kayıttan gelir; gelmediyse başvuru zaten eksiktir.
 */
export function b2bApplicationIssues(input: B2bApplicationInput): B2bApplicationField[] {
  const issues: B2bApplicationField[] = [];

  if (input.kind === 'siret') {
    if (!isValidSiret(input.siret)) issues.push('siret');
  } else if (!splitVatNumber(input.vatNumber)) {
    issues.push('vatNumber');
  }

  if (input.legalName.trim().length < 2) issues.push('legalName');
  if (input.contactName.trim().length < 2) issues.push('contactName');
  if (!isValidEmail(input.email)) issues.push('email');
  // Telefon normalize EDİLEMİYORSA geçersizdir — ayrı bir desen yazmak, aynı kuralın ikinci
  // kopyası olurdu (kaydedilen değeri de bu fonksiyon üretiyor).
  if (!normalizePhone(input.phone, input.kind === 'eu_vat' ? 'DE' : 'FR')) issues.push('phone');
  if (input.line1.trim().length < 3) issues.push('line1');
  if (!isValidPostalCode(input.postalCode)) issues.push('postalCode');
  if (input.city.trim().length < 2) issues.push('city');

  return issues;
}

/**
 * Ziyaretçinin gördüğü başvuru DURUMU — tasarımın "sonuç halleri (girişte görünür)" kartı.
 *
 * Kanal saklanmadığı için (`company_info` varlığından türer, `DATA_MODEL`) durum da iki alandan
 * TÜRETİLİR; ayrı bir "başvuru durumu" kolonu yok. Motorda olmasının sebebi çift tüketim: aynı
 * ayrımı hem tanıtım sayfası hem hesap ekranı okuyacak.
 *
 * **`rejected` ARTIK üretiliyor** (08.7 · şema turu 03.08). Eskiden üretilemiyordu çünkü reddedilen
 * kayıt da `b2bApproved = false` taşıyordu (09.11 · "ret SİLMEZ, kayıt B2C olarak kalır") ve ekran
 * reddedilen adaya hiç gelmeyecek bir cevabı beklediğini söylüyordu. Ayrım artık damgalarda:
 * `b2bRejectedAt` (+ zorunlu gerekçe) ret kararını, `b2bAppliedAt` başvuru anını taşıyor.
 *
 * **Ret silinmez, ESKİR.** Aday künyesini düzeltip yeniden başvurduğunda `b2bAppliedAt` tazelenir
 * (DB tetikleyicisi) ve ret damgasının önüne geçer — hâl `pending`'e döner, ret kaydı geçmiş olarak
 * durur. Temizleseydik 09.11'in istediği geçmiş ilk yeniden başvuruda kaybolurdu.
 *
 * **`b2bApproved === false`'u doğrudan okuyup "bekliyor" demeyin** — bu fonksiyon tam da onun için
 * var; alan tek başına iki hâli birden taşıyor.
 */
export type B2bApplicationStatus = 'none' | 'pending' | 'approved' | 'rejected';

export function b2bStatusOf(
  profile: { companyInfo: CompanyInfo | null; b2bApproved: boolean | null; b2bPending: boolean } | null,
): B2bApplicationStatus {
  if (!profile?.companyInfo) return 'none';
  if (profile.b2bApproved === true) return 'approved';
  // "Bekliyor mu" kararını motor YENİDEN HESAPLAMAZ, DB'den okur (`user_profiles.b2b_pending`,
  // üretilmiş kolon). Aynı karşılaştırmayı burada bir kez daha yazmak, kısmi indeksle sessizce
  // ayrışabilecek ikinci bir kural olurdu; ayrıştığı gün de kimse fark etmez — reddedilen aday
  // kuyrukta görünür ama hiçbir yerde hata yoktur.
  //
  // Alan OPSİYONEL DEĞİL, bilerek: eksik geçilse "bekliyor" varsayılırdı ve reddedilen adaya yine
  // "inceleniyor" denirdi — 08.7'nin kapattığı hatanın aynısı, bu kez tip yüzünden. Ölçülemeyen
  // değer varsayılana düşürülmez (CLAUDE §1); burada eksiklik derlemede durur.
  return profile.b2bPending ? 'pending' : 'rejected';
}
