'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * ARAMA KUTUSUNUN GECİKMESİ — operasyon yüzeyinin tek gecikme kaynağı.
 *
 * ── NE YAPAR ─────────────────────────────────────────────────────────────────
 * Kutu ANINDA yazar (yerel taslak), pahalı sonuç GECİKMELİ gider. "Pahalı sonuç" çoğu ekranda
 * `router.replace` — yani bir RSC okuması: liste + sayaçlar + süzgeç kümesi, paralel sorgular.
 * Gecikme olmadan "baklava" yazmak yedi tur demektir ve altısının cevabı daha yazarken bayatlar.
 *
 * ── NEDEN KUTUNUN İÇİNDE DEĞİL ───────────────────────────────────────────────
 * Taslak İKİ İŞ birden yapıyor ve bu ekranlarda ölçülebilir: aynı metin hem kutuyu besliyor hem de
 * YÜKLENMİŞ satırlarda anlık istemci süzgeci olarak çalışıyor (`stock/tabs/attention-tab`,
 * `losses-tab`, ürünler ekranının kategori/koleksiyon sekmeleri, müşterilerin boş-durum cümlesi).
 * Gecikmeyi `SearchInput`'un içine gömseydik o süzgeçler de 300 ms geriden gelirdi — elde duran
 * satırları süzmek için beklemenin hiçbir karşılığı yok. O yüzden taslak ekranın, gecikme buranın.
 *
 * ── TEK SAYI, TEK HİS ────────────────────────────────────────────────────────
 * Bu kanca yazılmadan önce aynı on satır ALTI client'ta kopyalanmıştı (`customers` · `orders` ·
 * `products` · `prices` · `stock` · `system`) ve seçicilerin kancası (`use-option-search`) yedinci
 * kopyayı 300 ms ile taşıyordu — yani sistemde iki farklı "yazma hissi" vardı ve sekizinci ekranı
 * yazan kişi hangisini kopyalayacağını bilemezdi. (Yaşandı: Ayarlar ekranı 09.16 ile hiç gecikmesiz
 * doğdu, her tuş bir RSC okuması yapıyordu.) `use-option-search`'ün kendi künyesindeki gerekçe —
 * *"iki seçicide ayrı yazılsaydı biri 300 öteki 500 olurdu"* — bir kat yukarıda da geçerliydi.
 *
 * 300 ms: iki değerin kısası. Uzun olan ölçülerek seçilmemişti; kısa olan her duraklamada hissedilen
 * bekleme, uzun olan ise ancak fazladan bir tur maliyeti demek — ikisinden ucuzu bu.
 *
 * ── NÖBETİ YOK, ve bu bilinçli bir eksik ────────────────────────────────────
 * Bu kanca durum + zamanlayıcı + efekt demek; sınanması bir DOM harness'ı ister ve bu yüzeyde öyle
 * bir şey yok (`use-load-more.hook.test.ts` de aynı sınıra takılıp KARARI saf fonksiyona çıkarmıştı).
 * Buradaki mantık bir karar değil bir yaşam döngüsü, ayrıştırılacak saf bir parçası yok. Kırılırsa
 * belirtisi ekranda görünür: ya kutu yazarken geri sıçrar ya geri tuşunda eski terim kalır.
 */
export const SEARCH_DEBOUNCE_MS = 300;

interface SearchDraft {
  /** Kutuya yazılan metin — anında günceller. İstemci süzgeçleri de bunu okur. */
  draft: string;
  onDraft: (next: string) => void;
  /**
   * Taslağı sıfırlar ve bekleyen turu İPTAL eder — terimi çağıranın kendi yazdığı hâller için.
   *
   * Üç ekran (ürünler · fiyatlar · stok) sekme değişiminde aramayı düşürüyor: terim sekmeye bağlı
   * ("börek" ürün aramasıdır, kategori listesinde anlamsız). İptal olmadan sekmeyi değiştiren
   * operatörün önceki tuşundan kalan tur, yeni sekmede eski terimi geri yazardı.
   */
  reset: (next?: string) => void;
}

/**
 * @param value    Yürürlükteki (sunucu/URL) değer. Dışarıdan değişince taslak eşitlenir.
 * @param commit   Gecikme dolunca çağrılır — terim KIRPILMIŞ gelir (adrese boşluk yazılmaz).
 * @param delayMs  Gecikme; varsayılanı sistemin tek sayısı.
 */
export function useSearchDraft(value: string, commit: (term: string) => void, delayMs: number = SEARCH_DEBOUNCE_MS): SearchDraft {
  const [draft, setDraft] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // `commit` her render'da yeni bir kapanış (çağıranlar ok fonksiyonu veriyor). Ref'te tutulmasa
  // zamanlayıcı KURULDUĞU andaki kapanışı çağırırdı — o kapanış eski `urlState`'i görür ve araya
  // giren bir süzgeç değişimi sessizce geri alınırdı.
  const commitRef = useRef(commit);
  commitRef.current = commit;

  const cancel = (): void => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  /**
   * Dışarıdan gelen değer taslağı ezer — AMA yalnız bekleyen bir tur yokken.
   *
   * Koşul şart ve sebebi ölçülebilir bir kayıp: "baklava" yazarken ilk turun cevabı ("bak") araya
   * döner. Koşulsuz eşitleme o an kutuyu "bak"a geri alır, yani kullanıcının yazdığı harfler
   * ekrandan SİLİNİR. Bekleyen tur varken doğru olan yerel taslaktır — kullanıcı hâlâ yazıyor,
   * sunucu bir önceki soruyu cevaplıyor. Tur bittiğinde zaten kendi terimini yazacak.
   *
   * Geri/ileri tuşu ya da dışarıdan gelen bağlantı: bekleyen tur yoktur, eşitleme çalışır.
   */
  useEffect(() => {
    if (timerRef.current) return;
    setDraft(value);
  }, [value]);

  // Bileşen kapanırken bekleyen tur iptal: kapanmış bir ekranın araması kimseye lazım değil.
  useEffect(() => cancel, []);

  const onDraft = (next: string): void => {
    setDraft(next);
    cancel();
    timerRef.current = setTimeout(() => {
      // Ref ÖNCE boşaltılır: "bekleyen tur var mı" sorusunun cevabı yukarıdaki eşitlemenin kapısı.
      // Boşaltılmasa ilk aramadan sonra ref sonsuza dek dolu kalır ve kutu bir daha hiç eşitlenmez —
      // geri tuşuyla dönen kullanıcı, adreste olmayan bir terimi kutuda okumaya devam ederdi.
      timerRef.current = null;
      commitRef.current(next.trim());
    }, delayMs);
  };

  const reset = (next = ''): void => {
    cancel();
    setDraft(next);
  };

  return { draft, onDraft, reset };
}
