/**
 * Ana sayfa vitrin ızgarasının SLOT SAYISI — türe göre (05.18 · tasarımın ana sayfa ızgarası).
 *
 * ── NEDEN ORTAK PAKETTE ─────────────────────────────────────────────────────
 * Aynı sayı önce üç web ekranında okunuyordu (katalog sekmesi · paket sekmesi · asistan kuyruğu) ve
 * `apps/web/lib` altında duruyordu. Dördüncü tüketici BAŞKA BİR UYGULAMADAN geldi: MCP'nin
 * `propose_featured_flag` aracı, yanıtında ızgaranın doluluğunu söylemek için aynı sayıya ihtiyaç
 * duyuyor (`apps/backend`). Web'in `lib`inden import edemez — sabit bu yüzden `@lezzet/types`e taşındı
 * (15.08).
 *
 * Kopya yazılsaydı ızgara bir gün büyüdüğünde biri düzeltilir, öteki eski sayıyla kalırdı: operasyon
 * ekranı "yer var" derken asistan "dolu" derdi.
 *
 * ── VİTRİN KARMA BİR IZGARADIR ──────────────────────────────────────────────
 * Üç türün AYRI kontenjanı var ve müşteri yüzeyinde bunların karışımından bölümler doğuyor
 * (kullanıcı hatırlatması 15.08). Yani "vitrinde kaç şey var" sorusunun tek bir cevabı yok — soru
 * daima tür başınadır ve ekranlar da öyle sorar.
 *
 * ── SINIR ENGELLEMEZ ────────────────────────────────────────────────────────
 * Fazlası işaretlenebilir; ana sayfa sırayla ilk N'i gösterir ve ekranlar bunu SÖYLER. Engelleseydik
 * operatör yedinci kategoriyi işaretlemek için önce birini kaldırmak zorunda kalırdı — kürasyon
 * sırasında en istenmeyen sürtünme bu. Kesme kuralı müşteri tarafında ve deterministik (sıraya göre).
 */
export const FEATURED_SLOTS = { category: 6, collection: 2, bundle: 2 } as const;

/** Vitrin hedefi — üçü de "vitrin" işaretini paylaşır ama AYNI YERDE DURMAZ (aşağıdaki künye). */
export type FeaturedTarget = keyof typeof FEATURED_SLOTS;

/**
 * **"VİTRİN" TEK BİR YER DEĞİL** (kullanıcı düzeltmesi 15.08).
 *
 * Üç tür de `is_featured` bayrağını paylaşıyor ve ekranlarda hepsine "vitrin" diyoruz — ama müşteri
 * yüzeyinde üçü ayrı bölümde, ayrı kuralla çiziliyor (`storefront/home.ts`). Bunu bilmeyen bir
 * arayüz (ya da asistan) doğru cümleyi kuramaz: kontenjanı aşan bir KOLEKSİYON düşmez, **döner** —
 * "fazlası görünmez" demek orada yanlış bilgidir ve operatör işaretini boşuna geri alır.
 *
 * Bu tablo o farkın tek kaynağı: hem operasyon formu hem MCP aracı buradan okur.
 */
export const FEATURED_PLACEMENT = {
  category: {
    where: 'Ana sayfa kategori ızgarası',
    /** Sıralı ilk N — fazlası çizilmez (sıra `sort_order`dan). */
    rotates: false,
    note: 'Sıralamada ilk 6 çizilir; fazlası ana sayfada görünmez.',
  },
  collection: {
    where: 'Koleksiyon bandı',
    /** **GÜNE GÖRE DÖNER** (`rotateDaily`): işaretlilerin hepsi sırayla görünür. */
    rotates: true,
    note: 'İşaretlilerin tamamı sırayla görünür — bandda her gün 2 tanesi. Fazlası kaybolmaz, sırasını bekler.',
  },
  bundle: {
    where: 'Paket bandı',
    rotates: false,
    note: 'İlk 2 çizilir. Stoğu tükenen paket, işaretli olsa da banda hiç girmez.',
  },
} as const satisfies Record<FeaturedTarget, { where: string; rotates: boolean; note: string }>;
