import type { SupabaseClient } from '@supabase/supabase-js';
import { UserProfileService } from '@lezzet/database';
import { captureError, SOURCES } from '@lezzet/observability';
import { splitVatNumber } from '@lezzet/domain-core';
import type { UserProfile } from '@lezzet/types';

/**
 * **AB vergi numarası doğrulaması** (VIES) — Alman/AB başvurusunun kimlik kanıtı.
 *
 * **TERFİ (21.31):** `apps/web/lib/b2b/`den taşındı, gövdesi değişmedi — `company-registry.ts`
 * ile aynı gerekçe (ikinci yüzey mobil formun canlı ✓ işareti; ayrıca başvurunun YAZIMI da bu
 * fonksiyonu çağırıyor ve o kapı artık pakette). Web dosyası köprü.
 *
 * Kaynak: Komisyonun açık REST uç noktası (`ec.europa.eu/taxation_customs/vies/rest-api`).
 * Anahtar istemez; arkasında her üye ülkenin kendi sunucusu vardır ve bu yüzden **tek tek ülkeler
 * geçici olarak cevap vermez** — servisin normal hâli budur, arıza değil.
 *
 * ── ÜÇ DEĞER, İKİ DEĞİL ──────────────────────────────────────────────────────
 * `true` geçerli · `false` GEÇERSİZ · `null` **SORULAMADI**. Üçüncüsü olmadan bu kod yazılamazdı:
 * doğrulanamayan bir numarayı `false` saymak, ülkesinin sunucusu o an bakımda olan meşru bir
 * şirketi "sahte numara" diye reddetmek olurdu. Tersi (`true` saymak) daha da kötü — reverse
 * charge'ı, yani %0 KDV'yi doğrulanmamış bir numaraya açmak demek (DOMAIN §5).
 *
 * `null` kolonun kendi sözleşmesiyle de aynı: `user_profiles.vat_number_valid` künyesi
 * *"null = hiç sorulmadı"* diyor ve onay kartı bunu "Sorulmadı" diye YAZIYOR (`b2b-approval`).
 * Yani üç değer üç katmanda aynı anlamı taşıyor.
 *
 * `CLAUDE.md §1`'in kuralının vergi karşılığı: ölçülemeyen değer sıfır (burada "geçersiz") değildir.
 */

/** Aday "Doğrula"ya basıp bekliyor; uzun bekleyiş formu donmuş gösterir. */
const TIMEOUT_MS = 6000;

export async function checkEuVatNumber(rawVatNumber: string): Promise<boolean | null> {
  const parsed = splitVatNumber(rawVatNumber);
  // Biçimi tutmayan numara için servise gitmeye gerek yok: cevabı zaten biliyoruz ve bu bir
  // "sorulamadı" değil, açık bir geçersizlik.
  if (!parsed) return false;

  try {
    const res = await fetch(
      `https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${parsed.country}/vat/${parsed.number}`,
      // `cache: 'no-store'` terfide düştü — gerekçe `company-registry.ts` künyesinde (Next'in
      // genişletmesiydi ve Next 15'te zaten varsayılan; davranış değişmedi).
      { signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (!res.ok) {
      await captureError(new Error(`VIES doğrulaması okunamadı: HTTP ${res.status}`), {
        source: SOURCES.applicationB2b,
        // Vergi numarası herkese açık bir işletme kimliğidir, kişisel veri değil.
        context: { flow: 'b2b/checkEuVatNumber', vatNumber: `${parsed.country}${parsed.number}` },
      });
      return null;
    }
    const body = (await res.json()) as { isValid?: unknown; valid?: unknown; userError?: unknown };
    const flag = typeof body.isValid === 'boolean' ? body.isValid : typeof body.valid === 'boolean' ? body.valid : null;
    /**
     * **`isValid` TEK BAŞINA OKUNAMAZ — servisin en sinsi yeri burası.**
     *
     * Üye ülkenin sunucusu cevap vermediğinde uç nokta HTTP 200 ve `isValid: false` döndürüyor;
     * ayrımı yalnız `userError` söylüyor (`MS_UNAVAILABLE`, `TIMEOUT`, `SERVER_BUSY`…). Yani
     * bayrağa tek başına bakan bir istemci, Almanya'nın sunucusu bakımdayken **her Alman
     * numarasını "geçersiz" ilan eder** ve meşru başvuruları geri çevirir. Ölçüldü (03.08):
     * geçerli numara `VALID`, geçersiz numara `INVALID`, biçimsiz girdi `INVALID_INPUT`.
     *
     * Bu yüzden yalnız üç değer KARAR sayılıyor; gerisi "sorulamadı" (`null`).
     */
    const verdict = typeof body.userError === 'string' ? body.userError : null;
    if (verdict === 'VALID') return true;
    if (verdict === 'INVALID' || verdict === 'INVALID_INPUT') return false;
    // `userError` hiç yoksa (uç nokta sürümü değişmiş olabilir) bayrağa düşülür; tanımadığımız bir
    // hata adı ise `null` — bilmediğimiz bir arızayı "geçersiz" diye okumak yalan söylemektir.
    return verdict === null ? flag : null;
  } catch (err) {
    await captureError(err, {
      source: SOURCES.applicationB2b,
      context: { flow: 'b2b/checkEuVatNumber', vatNumber: `${parsed.country}${parsed.number}` },
    });
    return null;
  }
}

/** Numaranın bugünkü hâli + o cevabın yaşı. `checkedAt` `null` ise hiç kesin cevap alınmamış. */
export interface VatCheckState {
  valid: boolean | null;
  checkedAt: string | null;
  /** Bu turda VIES'ten KESİN cevap alındı mı — ekran "bugün soruldu" diyebilsin diye. */
  refreshed: boolean;
}

/**
 * **Kayıtlı VIES sonucunu TAZELER** (09.11 · `BEKLEYEN` kapanışı 27.08).
 *
 * ── NEDEN GEREKLİ ────────────────────────────────────────────────────────────
 * Numara bugüne kadar yalnız **başvuru anında bir kez** soruluyordu ve sonuç profilde donuyordu.
 * Onay kartı SIRET künyesini her açılışta tazeliyor (`b2b-check.ts` → `refreshedCompanyInfo`) ama
 * KDV numarasını tazelemiyordu, yani kart bir alanda bugünü, öteki alanda başvuru gününü
 * gösteriyordu.
 *
 * **Asıl bedeli kartta değil VERGİDE:** bu bayrak ters yükümlülüğü açan bayrak
 * (`domain-core/tax/vat-treatment` → DE + b2b + `true` = %0 KDV). Başvuruda geçerli olup sonradan
 * iptal edilmiş bir numara, hiç yeniden sorulmadığı için sonsuza kadar %0 KDV üretirdi.
 *
 * ── "SORULAMADI" HİÇBİR ŞEYİ SİLMEZ ──────────────────────────────────────────
 * Yalnız KESİN cevap (true/false) yazılır. VIES üye ülke sunucusuna bağlı ve tek tek ülkeler
 * saatlerce cevap vermiyor — ölçüldü (27.08): Fransa'nın düğümü art arda beş sorguya da
 * `MS_MAX_CONCURRENT_REQ` döndü, Almanya normal cevapladı. `null`ı yazsaydık, servisin meşgul
 * olduğu bir gün elimizdeki doğrulanmış bilgiyi silerdik — `CLAUDE §1`: ölçülemeyen değer, değerin
 * yokluğu değildir.
 *
 * Numarası olmayan kayıtta hiç çağrı yapılmaz: cevabı zaten biliyoruz.
 *
 * **`ask` bir PORT'tur, test kancası değil** (`packages/ai`nin sağlayıcı deseni): buradaki kural
 * *"yalnız kesin cevap yazılır"* ve o kuralın sınanabilmesi için VIES'in `null` dönmesi gerekiyor —
 * gerçek serviste o hâl ısmarlanamaz, ancak Fransa'nın düğümü meşgulken rastlanır. Kuralı
 * sınanamaz bırakmak, en pahalı hatayı (elimizdeki doğrulamayı silmek) sessiz bırakmak olurdu.
 */
export async function refreshVatNumberCheck(
  db: SupabaseClient,
  profile: UserProfile,
  ask: (vatNumber: string) => Promise<boolean | null> = checkEuVatNumber,
): Promise<VatCheckState> {
  const stored: VatCheckState = { valid: profile.vatNumberValid, checkedAt: profile.vatNumberCheckedAt, refreshed: false };
  if (!profile.vatNumber) return stored;

  const valid = await ask(profile.vatNumber);
  if (valid === null) return stored;

  const checkedAt = new Date().toISOString();
  await new UserProfileService(db).update({ id: profile.id, vatNumberValid: valid, vatNumberCheckedAt: checkedAt });
  return { valid, checkedAt, refreshed: true };
}
