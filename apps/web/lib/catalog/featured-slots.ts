/**
 * Ana sayfa vitrin ızgarasının SLOT SAYISI — türe göre (05.18 · tasarımın ana sayfa ızgarası).
 *
 * ── NEDEN TEK YERDE ─────────────────────────────────────────────────────────
 * Aynı sayı üç yerde okunuyor: katalog sekmesinin "Vitrinde 3/6" başlığı, paket sekmesinin ikizi ve
 * asistan kuyruğunun vitrin önizlemesi ("vitrinde şu an 6 kategori — ızgara dolu"). Üç kopya
 * yazılsaydı ızgara bir gün büyüdüğünde ikisi düzeltilir, üçüncüsü eski sayıyla kalırdı — ve o
 * ekran operatöre "yer var" derken ötekiler "dolu" derdi.
 *
 * ── SINIR ENGELLEMEZ ────────────────────────────────────────────────────────
 * Fazlası işaretlenebilir; ana sayfa sırayla ilk N'i gösterir ve ekranlar bunu SÖYLER. Engelleseydik
 * operatör yedinci kategoriyi işaretlemek için önce birini kaldırmak zorunda kalırdı — kürasyon
 * sırasında en istenmeyen sürtünme bu. Kesme kuralı müşteri tarafında ve deterministik (sıraya göre).
 */
export const FEATURED_SLOTS = { category: 6, collection: 2, bundle: 2 } as const;
