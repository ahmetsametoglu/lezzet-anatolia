'use client';

import { useDebouncedLookup, type LookupResult } from '@lezzet/react-hooks';

import { suggestPostalCodesAction } from '@/lib/delivery/actions';
import type { PlaceSuggestion } from '@/lib/delivery/place-types';

/*
  POSTA KODU ÖNERİSİ (web) — adres formunun kod alanını kendi `postal_code_place` referansımıza
  bağlar. Gecikme/önbellek/yarış kararları ortak çekirdekte, sokak alanının BAN aramasıyla AYNI
  yerde; burada yalnız bu kaynağın kuralları var.

  ── NEDEN KOD SEÇİLİYOR, YAZILMIYOR ─────────────────────────────────────────
  Elle yazılan bir kod ÜLKESİNİ söylemiyor ve ülke bir alan değil, koddan türeyen bir sonuç
  (`0033_postal_code_place.sql` künyesi — serbest beyan KDV sonucu doğuramaz). Ölçüldü (10.08):
  **610 kod iki ülkede birden geçerli** ve KEHL deposu etkin olduğu için motor o kodlarda
  `ambiguous` dönüyor. Kodu listeden seçmek belirsizliği doğmadan kapatır: seçilen satır
  `(country, postalCode)` ikilisini BİRLİKTE taşır.

  Web bu tura kadar kodu yalnız ALAN TERK EDİLİNCE doğruluyordu ve ülkeyi sabit `FR` yazıyordu —
  yani o 610 kodun her birine sessizce yanlış ülke yazma ihtimali vardı. Kullanıcı 10.08'de web
  formunda kodun SEÇİLEREK gelmesini istemişti; native yapmış, web'de kalmıştı.

  ── SUNUCUDAN, BAN'IN AKSİNE ────────────────────────────────────────────────
  Kaynak bizim kendi tablomuz; tarayıcıdan çağrılacak bir dış servis yok. BAN'ın "IP başına kota"
  gerekçesi burada geçmiyor, o yüzden çağrı normal sunucu eylemi yolundan gider.

  ── HATA GÖSTERİLMEZ, LİSTE ÇİZİLMEZ ────────────────────────────────────────
  Eylem düşerse boş liste döner (kendi künyesinde: *"öneri bir kolaylık"*) ve form ELLE YAZMAYA
  açık kalır. Arıza önbelleğe de girmez — girseydi müşteri aynı harfleri yazdığı sürece oturum
  boyunca aynı boş listeyi görürdü, kapı çoktan düzelmiş olsa bile.
*/

/**
 * İki haneden kısa önek hiçbir yeri işaret etmez ve eylem de aynı eşiği uyguluyor. Boşa gidiş-dönüş
 * yapmanın anlamı yok — eşik iki yerde de var, ama ikisi de aynı ÖLÇÜMÜN sonucu, kopya bir kural değil.
 */
const MIN_PREFIX_LENGTH = 2;

const EMPTY: PlaceSuggestion[] = [];

/** Önek → adaylar. Modül düzeyinde: form kapanıp açılınca da yaşar (aynı oturum). */
const cache = new Map<string, PlaceSuggestion[]>();

async function lookup(term: string): Promise<LookupResult<PlaceSuggestion[]>> {
  const rows = await suggestPostalCodesAction(term);
  /* **DOLU cevap hatırlanır, BOŞ cevap hatırlanmaz** — ve bu ayrım eylemin sözleşmesinden geliyor.
     Eylem fırlatmıyor, arızayı da BOŞ LİSTEYE indiriyor (kendi künyesi: *"kırmızı bir satır
     göstermek çalışan bir yolu arızalı gibi okuturdu"*). Yani boş liste iki ayrı şey demek
     olabiliyor: "gerçekten aday yok" ya da "kapı düştü". İkisi ayırt edilemediği için boş cevap
     önbelleğe alınmıyor — alınsaydı düşmüş bir kapı, müşteri aynı harfleri yazdığı sürece oturum
     boyunca kendini tekrar ederdi. Dolu cevapta böyle bir belirsizlik yok.

     Native'de bu ödünleşme yok: orada uç `{data, error}` dönüyor ve boş-ama-başarılı cevap da
     hatırlanabiliyor (`use-postal-suggest.hook`). Fark kaynağın değil TAŞIMANIN farkı; iki yüzey
     de kendi taşımasının söyleyebildiği kadarını hatırlıyor. */
  return { value: rows, cache: rows.length > 0 };
}

export function usePostalSuggest(prefix: string, { enabled }: { enabled: boolean }): PlaceSuggestion[] {
  return useDebouncedLookup(prefix, { enabled, minLength: MIN_PREFIX_LENGTH, empty: EMPTY, lookup, cache });
}
