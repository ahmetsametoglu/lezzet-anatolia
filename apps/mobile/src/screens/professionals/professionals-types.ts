import type { B2bApplicationField, B2bApplicationInput } from '@lezzet/domain-core';
import type { LocalizedCopy } from '@lezzet/i18n';
// YALNIZ tip için: `Messages` sözlüğün şeklinden türer, bu modül metnin kendisini okumaz —
// `import type` sözlüğü paketten de uzak tutar (JSON yalnız ekran dosyasında bağlanır).
import type messages from './messages.json';

/*
  PROFESYONEL BAŞVURUSU — ekrana özel tipler. KURAL BURADA YOK.

  ── DUPLİKASYON KAPANDI (21.31) ─────────────────────────────────────────────
  Bu dosya 09.08'de motorun yarısını ELLE YENİDEN YAZIYORDU (`normalizeSiret` · `formatSiret` ·
  `normalizeVatNumber` · `isGermanVatNumber` · `applicationIssues` + üç tip) ve künyesi sebebini
  de yazıyordu: *"`@lezzet/domain-core` `apps/mobile`ın bağımlılığı DEĞİL ve bağımlılık eklemek bu
  şeridin yazma alanı dışında (ihtiyaç raporlandı)"*. Ölçüldü ve gerekçe bugün geçersiz: o paketin
  npm bağımlılığı SIFIR, yalnız `@lezzet/types` + `@lezzet/helper` — ikisi de mobilde zaten var.
  Bağımlılık eklendi, kopyalar silindi; ekran artık web ile AYNI motoru çağırıyor.

  Kopyanın bilerek ZAYIF bıraktığı iki kural da böyle kapandı: SIRET'in Luhn denetimi (tek hane
  hatası artık kayda gitmeden yakalanıyor) ve AB numarasının biçimi (`DE`+9 varsayımı yerine
  motorun tüm AB biçimleri). Numaranın GERÇEKTEN geçerli olup olmadığını ise artık servis söylüyor
  (`GET /api/v1/b2b/vat/:number`) — biçim işareti bir tahmindi, cevap bir ölçüm.

  Geriye kalan iki şey gerçekten EKRANA ait: sözlüğün tipi ve boş formun şekli.
*/

export type Messages = LocalizedCopy<typeof messages>;

/**
 * Sözlükte karşılığı olan alan adları — motorun birliği `kind`i de içerir (`keyof` ile türüyor)
 * ama o bir alan değil bir YOL, ve `messages.form`da karşılığı yok. Ayrımı tip düzeyinde tutmak,
 * cümleyi kuran tarafın var olmayan bir anahtarı okumasını derlemede keser.
 *
 * **`email` de dışarıda (MB-04):** o alan formdan kalktı — adres artık OTP ile doğrulanmış hesap
 * adresidir ve sunucu onu oturumdan yazar. Sözlükten etiketi silindiği için ayrım burada da
 * duruyor: motorun `email` reddini alan adıyla göstermeye kalkan kod DERLENMEZ, kendi cümlesini
 * kurmak zorunda kalır (`errors.accountEmail`).
 */
export type FieldLabelKey = Exclude<B2bApplicationField, 'kind' | 'email'>;

/** Boş form — iki yol da aynı şekli taşır, `kind` hangi alanların görüneceğini söyler. */
export function emptyApplication(): B2bApplicationInput {
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
