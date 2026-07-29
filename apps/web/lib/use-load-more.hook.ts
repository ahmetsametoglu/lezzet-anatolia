'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';

/**
 * Sona-yaklaşınca yükleme (infinite scroll) tetikleyicisinin MEKANİZMASI — iki yüzey de bunu kullanır.
 *
 * Yalnız gözlemci burada; görünüm çağıranın işi. Operasyon yüzeyi Türkçe ve `ops-*` token'larıyla,
 * müşteri yüzeyi üç dilli ve müşteri token'larıyla çizer — ortak olan "eşiğe girince bir kez tetikle"
 * kuralıdır, düğmenin nasıl göründüğü değil. Bileşenin tamamı paylaşılsaydı ya operasyon metni
 * müşteriye sızardı ya da iki kopya doğardı.
 *
 * Kaydırma olayı dinlemek yerine IntersectionObserver: her karede hesap yapmaz, eşiğe girince bir kez
 * tetikler.
 *
 * ── GÖZLEMCİ SÖKÜLMEZ (09.17) ───────────────────────────────────────────────
 * Eskiden `loading` boyunca gözlemci sökülüp bitince yeniden kuruluyordu — "aynı sayfa iki kez
 * istenmesin" için. Sökmek zorunluydu çünkü IntersectionObserver yalnız eşik DEĞİŞİMİNDE ateşler:
 * görünür kalan bir nöbetçi, sökülüp yeniden kurulmazsa bir daha hiç tetiklenmez ve liste donar.
 * Bedeli görünürdü: `useEffect` boyamadan SONRA koştuğu için sıra "fetch bitti → dinlenme hâli
 * ekrana basıldı → efekt gözlemciyi kurdu → yeniden tetikledi" oluyordu, yani her sayfa yüklemesinde
 * dinlenme hâli en az bir kare boyanıyordu. Operasyon yüzeyinde bu, "bir yükleniyor bir düğme" diye
 * titreyen bir alt şerit olarak yaşandı.
 *
 * Artık görünürlük React DURUMUNDA: gözlemci bir kez kurulur ve yalnız "eşikte miyiz" sorusunu
 * yanıtlar; "şimdi çekilebilir mi" ayrı bir sorudur ve karar `loadMoreDecision`'da verilir. Aynı
 * sayfayı iki kez istememeyi sağlayan şey artık sökme değil, o kararın kendisi.
 */

/**
 * Nöbetçi eşikten ÇIKMADAN üst üste çekilebilecek azami sayfa. Sınır olmasa iki hâlde liste kendini
 * sonsuz besliyordu: (a) sunucu eylemi sessiz düşerse (tüm çağıranlar hatayı yutuyor) aynı sayfa
 * bitmeyen bir döngüyle isteniyordu, (b) client süzgeci gelen sayfanın satırlarını yiyorsa
 * (fiyat/stok `scope` çipi) nöbetçi hiç görüş alanından çıkmadığı için katalogun tamamı kaydırma
 * olmadan akıyordu. Sınıra varınca otomatik yol kapanır ve söz kullanıcıya geçer.
 */
const MAX_AUTO_PAGES = 3;

interface UseLoadMoreOptions {
  /** Devam eden sayfa var mı (imleç null değil). Yoksa gözlemci kurulmaz. */
  hasMore: boolean;
  loading: boolean;
  onLoadMore: () => void;
  /** Gözlemcinin kaç px önceden tetikleneceği — liste dibine varmadan yükleme başlasın. */
  rootMargin?: string;
  /** Üst üste otomatik çekilecek azami sayfa (parametrik; bkz. `MAX_AUTO_PAGES`). */
  maxAutoPages?: number;
}

interface UseLoadMoreResult {
  ref: RefObject<HTMLDivElement | null>;
  /**
   * Otomatik yükleme İŞLİYOR — çağıran açık bir denetim (düğme) göstermemeli.
   * `false` olduğu üç hâl var: eşikten uzağız (kimse nöbetçiye bakmıyor), gözlemci hiç haber
   * vermiyor (asıl emniyet ağı hâli) ya da otomatik tur sınırı doldu.
   */
  autoActive: boolean;
  /** Açık denetimin çağıracağı yükleme — otomatik tur hakkını da yeniler. */
  loadMore: () => void;
}

interface DecisionInput {
  /** Eşikte miyiz. `null` = gözlemci henüz haber vermedi (ilk boyama). */
  nearEnd: boolean | null;
  loading: boolean;
  hasMore: boolean;
  autoPages: number;
  maxAutoPages: number;
}

interface Decision {
  /** Şimdi otomatik bir sayfa çekilmeli mi. */
  fetch: boolean;
  /** Sayacın yeni değeri (değişmediyse aynısı). */
  autoPages: number;
  /** Bkz. `UseLoadMoreResult.autoActive`. */
  autoActive: boolean;
}

/**
 * Tetikleyicinin tüm KARARI — saf, bu yüzden test edilebilir (yüzeyde DOM harness'ı yok).
 *
 * `nearEnd`in üç değerli olması ŞART: "eşikte değiliz" ile "henüz bilmiyoruz" ayrı hâllerdir.
 * İkincisinde otomatik yol İŞLİYOR sayılır — yoksa gözlemcinin ilk raporu gelene kadar (bir-iki
 * kare) liste açık denetimi gösterir ve kısa listelerde bu, düğmenin göz kırpması olarak görünür.
 */
export function loadMoreDecision({ nearEnd, loading, hasMore, autoPages, maxAutoPages }: DecisionInput): Decision {
  // Sayfa kalmadı: sayaç da sıfırlanır, yoksa süzgeç değişip liste yeniden uzadığında devralınan
  // sayı otomatik yolu ilk turda kapatırdı.
  if (!hasMore) return { fetch: false, autoPages: 0, autoActive: false };

  // Eşikten ÇIKMAK ilerlemedir: gelen sayfa nöbetçiyi aşağı itti. Tur hakkı burada yenilenir —
  // sayaç "kaç sayfa çekildi" değil, "kullanıcı ilerlemeden kaç sayfa çekildi" sayar.
  if (nearEnd === false) return { fetch: false, autoPages: 0, autoActive: false };

  const blocked = autoPages >= maxAutoPages;
  // Gözlemci daha konuşmadı ya da yükleme sürüyor: karar yok, hâl korunur.
  if (nearEnd === null || loading) return { fetch: false, autoPages, autoActive: !blocked };
  if (blocked) return { fetch: false, autoPages, autoActive: false };
  return { fetch: true, autoPages: autoPages + 1, autoActive: true };
}

/**
 * Nöbetçiyi kırpan GERÇEK kaydırıcı (09.17).
 *
 * `root` verilmezse gözlemci viewport'u ölçüt alır ve `rootMargin` viewport'un dikdörtgenini
 * büyütür. Ama aradaki kaydırıcının kırpması buna AYRI uygulanır: iç gövdesi kaydıran bir tabloda
 * önden yükleme hiç çalışmaz, nöbetçi ancak liste dibine varınca görünür sayılır. Operasyon
 * tablosunun gövdesi (`overflow-y-auto`) tam olarak böyle bir kaydırıcıdır — 240px'lik pay sessizce
 * ölü kalıyordu.
 *
 * Kaydırıcı DOM'dan bulunur, işaretle değil: iki yüzeyin dördü aşkın listesine `data-*` niteliği
 * dağıtmak, unutulduğu ilk yerde aynı hatayı sessizce geri getirirdi. Belgeye kadar çıkılırsa `null`
 * döner — orada kaydırıcı zaten viewport'un kendisi (müşteri kataloğu böyle).
 */
function scrollParentOf(el: Element): Element | null {
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === 'auto' || overflowY === 'scroll') return node;
  }
  return null;
}

export function useLoadMore({
  hasMore,
  loading,
  onLoadMore,
  rootMargin = '240px',
  maxAutoPages = MAX_AUTO_PAGES,
}: UseLoadMoreOptions): UseLoadMoreResult {
  const ref = useRef<HTMLDivElement>(null);
  // Callback'i ref'te tutuyoruz: her render'da yeni fonksiyon gelse de gözlemci yeniden kurulmasın.
  const cb = useRef(onLoadMore);
  cb.current = onLoadMore;

  const [nearEnd, setNearEnd] = useState<boolean | null>(null);
  const [autoPages, setAutoPages] = useState(0);

  useEffect(() => {
    const el = ref.current;
    // `hasMore` bağımlılıkta: nöbetçi yalnız sayfa varken çizilir, yani öğe gelip gider. Sökülmeyen
    // gözlemcinin tek yeniden kurulma sebebi bu.
    if (!el || !hasMore) return;
    // Gözlemci yoksa otomatik yol da yok: "eşikte değiliz" diyerek açık denetime düşülür — emniyet
    // ağının var olma sebebi tam olarak bu hâl.
    if (typeof IntersectionObserver === 'undefined') {
      setNearEnd(false);
      return;
    }
    const observer = new IntersectionObserver((entries) => setNearEnd(entries.some((e) => e.isIntersecting)), {
      root: scrollParentOf(el),
      rootMargin,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, rootMargin]);

  useEffect(() => {
    const { fetch, autoPages: next } = loadMoreDecision({ nearEnd, loading, hasMore, autoPages, maxAutoPages });
    if (next !== autoPages) setAutoPages(next);
    if (fetch) cb.current();
  }, [nearEnd, loading, hasMore, autoPages, maxAutoPages]);

  const loadMore = useCallback(() => {
    setAutoPages(0);
    cb.current();
  }, []);

  return { ref, autoActive: loadMoreDecision({ nearEnd, loading, hasMore, autoPages, maxAutoPages }).autoActive, loadMore };
}
