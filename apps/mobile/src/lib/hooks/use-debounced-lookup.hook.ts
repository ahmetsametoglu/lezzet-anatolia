import { useEffect, useRef, useState } from 'react';

/*
  GECİKMELİ ARAMA ÇEKİRDEĞİ — "yazarken öneri getir" davranışının ÜÇ kararı, tek yerde.

  ── NEDEN VAR ───────────────────────────────────────────────────────────────
  Adres çekmecesinde bugün İKİ alan yazarken öneri istiyor: sokak (Fransız devletinin adres
  servisi, BAN) ve posta kodu (kendi `postal_code_place` referansımız — 21.28). İkisi de aynı üç
  kararı vermek zorunda ve ikisi de yanlış verirse aynı arızayı doğuruyor. İkinci bir nüsha
  yazmak, birinin bir gün ötekinden farklı davranması demekti (CLAUDE §1).

  Çekirdek KAYNAK BİLMEZ: nereye sorulacağı `lookup`ın işi. Bu yüzden BAN'ın kota (429) hâli de,
  kod ucunun boş listesi de çağıranın kendi tipiyle taşınır — çekirdek yalnız NE ZAMAN sorulacağına
  ve hangi cevabın geçerli olduğuna karar verir.

  ── ÜÇ KARAR ────────────────────────────────────────────────────────────────
  1. GECİKME (debounce) — her tuşa basışta istek atmak hem kotayı yer hem gereksiz: "12 rue du
     marché" 17 istek demekti. Yazma durunca tek istek atılır.
  2. ÖNBELLEK — müşteri harf silip geri yazınca (çok olur) aynı sorgu tekrar ağa çıkmasın. Sorgu
     metnine göre, oturum boyu, TAVANLI. Deposu ÇAĞIRANIN: iki tüketici tek Map'i paylaşsaydı
     "672" anahtarı bir kez adres, bir kez posta kodu cevabı taşırdı.
  3. YARIŞ — geç dönen cevap yeni sorgunun önerilerini EZMEZ (`generation` sayacı; deponun
     `use-me.hook`taki deseninin aynısı, yenisi uydurulmadı).

  ── NEDEN HER CEVAP ÖNBELLEĞE GİRMEZ ────────────────────────────────────────
  `lookup` cevabıyla birlikte `cache` bayrağı döner. Geçici başarısızlıklar (kota doldu, servis
  düştü) önbelleğe girmemeli: girselerdi müşteri aynı harfleri yazdığı sürece oturum boyunca aynı
  arızayı görürdü — servis çoktan düzelmiş olsa bile.
*/

/** Önbellek tavanı. Bir çekmece oturumunda benzersiz sorgu sayısı onlarla ölçülür; tavan sınırsız
    büyümeyi keser, en eski giriş düşer (ekleme sırası = `Map` sırası). */
const CACHE_LIMIT = 40;

/**
 * `lookup`ın cevabı: ekrana verilecek DEĞER + bu cevabın hatırlanmaya değer olup olmadığı.
 * İkisini ayırmak şart — "boş liste" hatırlanmaya değer bir cevaptır, "servis düştü" değildir.
 */
export interface LookupResult<T> {
  value: T;
  cache: boolean;
}

interface DebouncedLookupOptions<T> {
  /** Kapalıyken hiç ağa çıkılmaz — çekmece kapalı ya da müşteri öneriyi seçmişken. */
  enabled: boolean;
  /** Bu uzunluğun altındaki sorgu hiçbir yeri işaret etmez; ağa çıkılmaz (kapılar da aynı eşikte). */
  minLength: number;
  /** Sorgu yokken / kapalıyken / kısa sorguda gösterilen değer. Kimlik SABİT olmalı (modül düzeyi). */
  empty: T;
  /** Sorgu metni → cevap. Fırlatmamalı: başarısızlığı da bir DEĞER olarak adlandırmak çağıranın işi. */
  lookup: (term: string) => Promise<LookupResult<T>>;
  /** Sorgu → cevap deposu. Modül düzeyinde tutulur ki çekmece kapanıp açılınca da yaşasın. */
  cache: Map<string, T>;
  debounceMs?: number;
}

/**
 * 300 ms insanın tuşlar arası ortalamasının (~150-200 ms) üstünde, algılanabilir gecikmenin
 * (~400 ms) altında: hızlı yazan müşteri tek istek üretir, duraklayan müşteri beklediğini
 * hissetmez. Değer VARSAYILAN, sabit değil — çağıran `debounceMs` ile değiştirir (testte sıfırlamak
 * için). Dışarı AÇILMADI: ikinci bir ayar kapısı olurdu.
 */
const DEFAULT_DEBOUNCE_MS = 300;

export function useDebouncedLookup<T>(
  query: string,
  { enabled, minLength, empty, lookup, cache, debounceMs = DEFAULT_DEBOUNCE_MS }: DebouncedLookupOptions<T>,
): T {
  const [state, setState] = useState<T>(empty);
  /* Kaçıncı sorgudayız — cevap döndüğünde hâlâ SON sorgu muyuz diye bakılır. Ref, çünkü değeri
     render'ı ilgilendirmiyor; state olsaydı her tuş iki render yapardı. */
  const generation = useRef(0);
  /* `lookup` çoğu çağıranda satır içi kurulur, yani her render'da yeni bir kimlik alır. Bağımlılık
     dizisine konsaydı efekt her render'da yeniden koşar ve gecikme hiç dolmazdı — sonuç, tam da
     engellemeye çalıştığımız şey: her tuşta bir istek. Ref, son hâlini efekte taşır. */
  const call = useRef(lookup);
  call.current = lookup;

  useEffect(() => {
    const term = query.trim();
    // Yeni bir soru soruldu: bu andan önce yola çıkmış her cevap artık ESKİ.
    const run = ++generation.current;

    if (!enabled || term.length < minLength) {
      setState((current) => (current === empty ? current : empty));
      return;
    }

    const cached = cache.get(term);
    if (cached !== undefined) {
      setState(cached);
      return;
    }

    const timer = setTimeout(() => {
      void call.current(term).then((result) => {
        if (run !== generation.current) return;
        if (result.cache) {
          if (cache.size >= CACHE_LIMIT) {
            const oldest = cache.keys().next();
            if (!oldest.done) cache.delete(oldest.value);
          }
          cache.set(term, result.value);
        }
        setState(result.value);
      });
    }, debounceMs);

    /* Sorgu değişti ya da ekran kapandı: bekleyen istek HİÇ atılmaz. Yolda olan bir istek varsa
       onu `generation` eler — iptal etmek yerine cevabını yok saymak yeter ve `AbortController`ı
       her tuşta kurup yıkmaktan ucuz. */
    return () => clearTimeout(timer);
  }, [query, enabled, minLength, empty, cache, debounceMs]);

  return state;
}
