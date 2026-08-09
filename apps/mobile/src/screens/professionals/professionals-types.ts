import { isValidEmail, isValidPostalCode, normalizePhone } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
// YALNIZ tip için: `Messages` sözlüğün şeklinden türer, bu modül metnin kendisini okumaz —
// `import type` sözlüğü paketten de uzak tutar (JSON yalnız ekran dosyasında bağlanır).
import type messages from './messages.json';

/*
  PROFESYONEL BAŞVURUSU — tip modülü + BİÇİM denetimi (view DEĞİL).

  ── KURALLAR NEREDEN GELİYOR ────────────────────────────────────────────────
  Kanonik motor `@lezzet/domain-core/identity/b2b-application` (`b2bApplicationIssues`) ve web
  formu onu çağırıyor. MOBİL ONU ÇAĞIRAMIYOR: `@lezzet/domain-core` `apps/mobile`ın bağımlılığı
  DEĞİL ve bağımlılık eklemek bu şeridin yazma alanı dışında (ihtiyaç raporlandı).

  O yüzden burada İKİNCİ BİR KURAL YAZILMADI, kuralın PAYLAŞILAN parçaları olduğu gibi tüketildi:
  e-posta (`isValidEmail`), telefon (`normalizePhone` — ülke `kind`ten, motorun kendi kararı) ve
  posta kodu (`isValidPostalCode`) `@lezzet/helper`tan gelir; motor da tam olarak bu üç fonksiyonu
  çağırıyor. Uzunluk eşikleri (unvan ≥2, adres ≥3, şehir ≥2) motorun eşikleriyle birebir aynı.

  ── İKİ KURAL BİLEREK DAHA ZAYIF, ve nedeni ölçülü ──────────────────────────
  · **SIRET** — motor `isValidSiret` ile 14 hane + Luhn (+ La Poste istisnası) bakıyor. Burada
    yalnız 14 HANE bakılıyor: Luhn'u ikinci kez yazmak, motorun tek kaynak olma gerekçesini
    (`b2b-application.ts` künyesi) mobilde bozan bir KOPYA olurdu ve bir gün ayrışırdı. 14 hane
    v3'ün de kendi kuralı (`proLookup`, v3:564); eksik kalan hane-hatası yakalaması, uç bağlandığı
    gün SUNUCUDA zaten yapılıyor.
  · **AB vergi numarası** — motor `splitVatNumber` ile tüm AB biçimlerini kabul ediyor; burada
    v3'ün açık kuralı geçerli: `DE` + 9 hane (v3:850). Ekrandaki sekmenin adı da "Alman şirketi";
    üçüncü bir ülke açıldığı gün doğru hamle motoru içeri almaktır, deseni genişletmek değil.

  İkisi de KAPI DEĞİL SİNYAL: başvuruyu son onaylayan taraf sunucudur (web `application-form`
  künyesi — "denetim iki yerde ve bu tekrar değil": ekranınki kullanıcı için, sunucununki güvenlik
  için).
*/

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Başvurunun İKİ YOLU — motorun `B2bApplicationKind`iyle aynı adlar ve aynı anlam.
 *
 * Ad ülkeyle DEĞİL yöntemle anıldı (motorun gerekçesi): yarın Belçikalı bir alıcı da AB vergi
 * numarasıyla başvurabilir ve o gün `de` adında bir yol saçma olurdu.
 */
export type ApplicationKind = 'siret' | 'eu_vat';

/** Formun taşıdığı alanlar — motorun `B2bApplicationInput`u ile aynı küme, aynı sıra. */
export interface ApplicationInput {
  kind: ApplicationKind;
  siret: string;
  legalName: string;
  vatNumber: string;
  contactName: string;
  email: string;
  phone: string;
  line1: string;
  postalCode: string;
  city: string;
}

/** Denetimin işaret ettiği alan — `kind` hariç, o bir seçim değil bir yol. */
export type ApplicationField = Exclude<keyof ApplicationInput, 'kind'>;

/** Boş form — iki yol da aynı şekli taşır, `kind` hangi alanların görüneceğini söyler. */
export function emptyApplication(): ApplicationInput {
  return {
    kind: 'siret',
    siret: '',
    legalName: '',
    vatNumber: '',
    contactName: '',
    email: '',
    phone: '',
    line1: '',
    postalCode: '',
    city: '',
  };
}

/** Rakam dışını atar — "907 496 640 00026" ve "90749664000026" aynı numaradır (motorla aynı). */
export function normalizeSiret(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * Okunur biçim `907 496 640 00026` — SIREN (9) + NIC (5).
 *
 * Süs değil doğrulama yardımı: müşteri numarayı belgesinden de bu gruplarla okur, tek blok
 * 14 hanede karşılaştırma yapamaz. Saklanan değer daima rakam; biçim ekranın, kimlik verinin.
 */
export function formatSiret(raw: string): string {
  const digits = normalizeSiret(raw);
  if (digits.length !== 14) return digits;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9)}`;
}

/** Boşluk/noktalama atar, büyük harfe çevirir — `de 812 345 678` → `DE812345678`. */
export function normalizeVatNumber(raw: string): string {
  return raw.replace(/[^0-9a-zA-Z]/g, '').toUpperCase();
}

/** v3'ün canlı ✓ işareti: `DE` + 9 hane. */
export function isGermanVatNumber(raw: string): boolean {
  return /^DE\d{9}$/.test(normalizeVatNumber(raw));
}

/**
 * Eksik/bozuk alanların LİSTESİ — ilk hata değil HEPSİ.
 *
 * Tek tek döndürmek formu "düzelt-gönder-düzelt" döngüsüne sokardı; hedef başvurunun bir dakikada
 * bitmesi. Dönen şey ALAN ADI listesi, cümle değil: cümleyi ekran kurar.
 *
 * **Adres iki yolda da zorunlu** (motorun açık hükmü): adres yoksa onay kartının rota sinyali
 * ölçülemez kalır ve operatör başvuruyu değerlendiremez.
 */
export function applicationIssues(input: ApplicationInput): ApplicationField[] {
  const issues: ApplicationField[] = [];

  if (input.kind === 'siret') {
    if (normalizeSiret(input.siret).length !== 14) issues.push('siret');
  } else if (!isGermanVatNumber(input.vatNumber)) {
    issues.push('vatNumber');
  }

  if (input.legalName.trim().length < 2) issues.push('legalName');
  if (input.contactName.trim().length < 2) issues.push('contactName');
  if (!isValidEmail(input.email)) issues.push('email');
  // Telefon normalize EDİLEMİYORSA geçersizdir — ayrı bir desen yazmak aynı kuralın ikinci
  // kopyası olurdu (kaydedilecek değeri de bu fonksiyon üretiyor).
  if (!normalizePhone(input.phone, input.kind === 'eu_vat' ? 'DE' : 'FR')) issues.push('phone');
  if (input.line1.trim().length < 3) issues.push('line1');
  if (!isValidPostalCode(input.postalCode)) issues.push('postalCode');
  if (input.city.trim().length < 2) issues.push('city');

  return issues;
}
