import { suggestPostalCodes, type PlaceOption } from '@/lib/api/places';
import { useDebouncedLookup, type LookupResult } from '@/lib/hooks/use-debounced-lookup.hook';

/*
  POSTA KODU ÖNERİSİ (21.28) — adres formunun kod alanını kendi `postal_code_place` referansımıza
  bağlar. Gecikme/önbellek/yarış kararları ortak çekirdekte (`use-debounced-lookup.hook`), sokak
  alanının BAN aramasıyla AYNI yerde; burada yalnız bu kaynağın kuralları var.

  ── NEDEN KOD SEÇİLİYOR, YAZILMIYOR ─────────────────────────────────────────
  Elle yazılan bir kod ÜLKESİNİ söylemiyor ve ülke bir alan değil, koddan türeyen bir sonuç
  (`0033_postal_code_place.sql` künyesi — serbest beyan KDV sonucu doğuramaz). Ölçüldü (10.08):
  **610 kod iki ülkede birden geçerli** ve `KEHL` deposu aktif olduğu için motor bugün o kodlarda
  `ambiguous` dönüyor — sepetin yeri hiç çözülemiyor. Kodu listeden seçmek belirsizliği doğmadan
  kapatır: seçilen satır `(country, postalCode)` ikilisini BİRLİKTE taşır.

  ── SUNUCUDAN, BAN'IN AKSİNE ────────────────────────────────────────────────
  Kaynak bizim kendi tablomuz; cihazdan çağrılacak bir dış servis yok. BAN'ın "IP başına kota"
  gerekçesi burada geçmiyor, o yüzden çağrı normal uç yolundan gider.

  ── HATA GÖSTERİLMEZ, LİSTE ÇİZİLMEZ ────────────────────────────────────────
  Uç düşerse boş liste döner ve form ELLE YAZMAYA açık kalır (kullanıcı kararı 10.08: yedek
  korunur). Öneri bir kolaylıktır; yokluğu müşteriyi adres ekleyemez hâle getirmemeli. Arıza
  önbelleğe de girmez — girseydi müşteri aynı harfleri yazdığı sürece oturum boyunca aynı boş
  listeyi görürdü, uç çoktan düzelmiş olsa bile.
*/

/**
 * İki haneden kısa önek hiçbir yeri işaret etmez ve sunucu da aynı eşiği uyguluyor
 * (`searchPrefix`: tek harflik önek 16.9k satırın onda birini gezdirir). Boşa gidiş-dönüş yapmanın
 * anlamı yok — eşik iki yerde de var, ama ikisi de aynı ÖLÇÜMÜN sonucu, kopya bir kural değil.
 */
const MIN_PREFIX_LENGTH = 2;

const EMPTY: PlaceOption[] = [];

/** Önek → adaylar. Modül düzeyinde: çekmece kapanıp açılınca da yaşar (aynı oturum). */
const cache = new Map<string, PlaceOption[]>();

async function lookup(term: string): Promise<LookupResult<PlaceOption[]>> {
  const result = await suggestPostalCodes(term);
  // Taşıma hatası HATIRLANMAZ; boş ama başarılı cevap hatırlanır (o gerçek bir cevaptır).
  return result.error !== null ? { value: EMPTY, cache: false } : { value: result.data, cache: true };
}

export function usePostalSuggest(prefix: string, { enabled }: { enabled: boolean }): PlaceOption[] {
  return useDebouncedLookup(prefix, { enabled, minLength: MIN_PREFIX_LENGTH, empty: EMPTY, lookup, cache });
}
