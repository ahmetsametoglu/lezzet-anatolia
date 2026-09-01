/**
 * **BESLEME KATMANLARI** — tek seed, üç hedef (kullanıcı kararı 16.08).
 *
 * ── NEDEN ÜÇ KATMAN ──────────────────────────────────────────────────────────
 * Bugüne dek tek bir besleme vardı ve iki işi birden görüyordu: bir yandan **gerçek kataloğu**
 * kuruyordu (kategoriler, 134 ürün, üç dilli metinler, elle seçilmiş kapaklar — bunlar üretime
 * çıkacak veri), bir yandan da **ekranları sınamak için uydurma geçmiş** yazıyordu (43 sipariş,
 * sahte müşteriler, para hareketleri, bilinçli bozuk kayıtlar). İkisi aynı koşuda karışıyordu,
 * yani gerçek veriyi uydurmadan ayırmanın hiçbir yolu yoktu.
 *
 *   `base`    **YALNIZ GERÇEK VERİ — hiçbir şey üretilmez** (kullanıcı kararı 16.08: *"hiçbir içerik
 *             üretilmeyecek; liste fiyatı da üretilmeyecek, girilmeyecek gerekirse"*). Yazdığı her
 *             satırın arkasında ya üreticinin kataloğu ya kullanıcının bir kararı var: kategori ·
 *             ürün · varyant · görsel · aile · koleksiyon · tarif.
 *   `extend`  Base + **kusurlar** (pasif/aday/beyansız/kapaksız ürün, çevirisi tamamlanmamış
 *             kayıt) + **bir miktar geçmiş** (müşteri, para, sepet). Demo hâli.
 *             **Sipariş YOK** (kullanıcı kararı 01.09) — ne burada ne `full`de; künye `seed.ts`
 *             başlığında §SİPARİŞ. Aşağıdaki paragraflarda "sipariş" geçen yerler o karardan
 *             ÖNCEKİ hâli anlatıyor ve tarihsel olarak duruyor: katmanların birbirinden neden
 *             ayrıldığını anlatan gerekçe hâlâ geçerli, örneği artık geçerli değil.
 *   `full`    Bugünkü kapsam: her senaryodan en az bir örnek. `pnpm seed:coverage`ın zorunlu
 *             kovalarının tamamı ancak burada dolar.
 *
 * ── `base` NEYİ YAZMAZ, NEDEN ────────────────────────────────────────────────
 * **Hesaplanmış alanlar** — dokuzunun da arkasında belge yok: alerjen ADDAN çıkarılıyor, besin
 * künyesi kategori ortalamasından, içindekiler alerjen listesinden, saklama metni kategori
 * rejiminden, raf ömrü kategori sabitinden, **KDV oranı ürün adının regex'inden**, hedef marj ve
 * otomatik fiyat indisten, liste fiyatı ağırlıktan (`14,50 €/kg + 1,20 €`), stok yine indisten.
 * Şema bu boşluğu zaten temsil edebiliyor (ölçüldü): `allergens`/`traces` varsayılanı `{}`,
 * beyan alanları nullable, `shippable` varsayılanı `false`. Tek istisna `vat_rate` — `NOT NULL`
 * ve varsayılanı **5,5**, ki o bir tahmin değil Fransa gıda KDV oranının kendisi.
 *
 * **Uydurma kayıtlar** — depo · rota · personel (ve onlara açılan GİRİŞ HESAPLARI) · banka
 * hesapları · tedarikçiler · kapsamlı ayar değerleri, artı yalnız kapsam denetimi için uydurulmuş
 * iki kayıt ("Ramazan Sofrası" pasif kategorisi, "Yılbaşı Sofrası" taslak koleksiyonu).
 *
 * **Paket** — bu bir tercih değil, şema: `bundle.total_price` `NOT NULL`, varsayılanı yok ve tutar
 * kalem fiyatlarından türüyor. Fiyatsız bir katmanda paket kurulamaz. Tarif kalabiliyor çünkü
 * kendi fiyatını saklamıyor (05.16).
 *
 * **Bedeli açık olsun:** 128 ürün `is_incomplete = true` doğar (belgesi olan 6'sı hariç) ve
 * fiyatsız olduğu için vitrinde "satışa kapalı" görünür — `application/catalog/map.ts` bu hâli
 * zaten karşılıyor. `base` gezilebilir bir katalogdur, satış yapan bir dükkân değil; eksikleri
 * operatör doldurunca dükkân olur.
 *
 * ── KATMAN BİRİKİMLİDİR AMA ÜSTÜNE KOŞULMAZ ──────────────────────────────────
 * Kapsam olarak `full ⊃ extend ⊃ base`. Ama seçim koşu ANINDA yapılır (`--tier=`) ve **katman
 * değiştirmek `db:refresh` ister** — üstüne ikinci bir koşu atmak yetmez, iki ayrı sebeple:
 *   · Bölümlerin guard'ı dolu tabloyu atlar; `extend`in 12 siparişi yazılmışken `full` koşarsa
 *     sipariş bölümü hiç çalışmaz ve kalan 31 senaryo doğmaz.
 *   · Katalog KUSURLARI ürün YAZILIRKEN veriliyor (pasif · aday · beyansız · kapaksız). `base`
 *     kusursuz bir katalog kurduktan sonra `extend` koşulsa katalog bölümü atlanır ve kusurlar
 *     geriye dönük UYGULANMAZ — ortaya "extend" adında ama kusursuz bir veri seti çıkardı.
 * Kısacası: katman bir koşunun tamamının kimliğidir, üzerine eklenen bir yama değil.
 *
 * ── UZAK HEDEF (üretim kurulumu) ─────────────────────────────────────────────
 * `base` üretimde de koşacak (kullanıcı kararı 16.08) ve **uzak hedefe yalnız o geçer** — kapı
 * `seed.ts`'te, tek yerde. `extend`/`full` uydurma personel ve onlara açılmış giriş hesapları,
 * uydurma depo/tedarikçi/banka hesabı ve bilinçli bozuk kayıtlar yazıyor; bunların üretime gitmesi
 * yanlış veri değil GÜVENLİK AÇIĞI olurdu. Kapı sayesinde bölümlerin hiçbiri ayrıca "uzak mıyım"
 * diye sormuyor: `base` zaten hiçbir yerde uydurma yazmıyor. Ölçüt `SEED_ALLOW_REMOTE`.
 *
 * **Ad `temel`den `base`e döndü (kullanıcı kararı 16.08):** üç katmanın ikisi zaten İngilizceydi
 * (`extend` · `full`) ve karışık dilli bir enum, hangi kelimenin kimlik hangisinin açıklama
 * olduğunu okunmaz kılıyordu. Değerler kimliktir; künyeler Türkçe kalır.
 */

export const KATMANLAR = ['base', 'extend', 'full'] as const;
export type Katman = (typeof KATMANLAR)[number];

/** Birikim sırası — `enAz` bunun üzerinde çalışır. */
const SIRA: Record<Katman, number> = { base: 0, extend: 1, full: 2 };

/** Bu koşu en az verilen katman kadar dolu mu? (`enAz(k, 'extend')` → extend ve full'de doğru.) */
export function enAz(katman: Katman, esik: Katman): boolean {
  return SIRA[katman] >= SIRA[esik];
}

/**
 * Katmanı komut satırından ya da ortamdan okur; varsayılan `full`.
 *
 * Varsayılan bilinçli olarak `full`: `pnpm db:refresh` bugüne dek tam fikstürü kuruyordu ve üç
 * şerit de onunla çalışıyor. Varsayılanı `base` yapmak, katmanı hiç duymamış bir ajanın koşusunu
 * sessizce yarım veriye düşürürdü — ve o veri "eksik" değil "başka" görünürdü.
 */
export function katmanOku(argv: readonly string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Katman {
  const bayrak = argv.find((a) => a.startsWith('--tier='))?.slice('--tier='.length);
  const ham = (bayrak ?? env.SEED_TIER ?? 'full').trim().toLowerCase();
  const bulunan = KATMANLAR.find((k) => k === ham);
  if (!bulunan) throw new Error(`Bilinmeyen besleme katmanı: "${ham}". Geçerli: ${KATMANLAR.join(' · ')}`);
  return bulunan;
}

/**
 * Bu koşu UZAK bir veritabanına mı yazıyor? Türetilmiş veri (beyan · fiyat · stok) burada yazılmaz.
 *
 * Ölçüt `assertLocalDatabase` ile AYNI olmalı ve öyle: ikisi de `SEED_ALLOW_REMOTE`'a bakıyor.
 * İki ayrı ölçüt yazılsaydı biri bir gün ötekinden ayrılır ve kapı açık kalırdı.
 */
export function uzakHedefMi(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SEED_ALLOW_REMOTE === 'true';
}
