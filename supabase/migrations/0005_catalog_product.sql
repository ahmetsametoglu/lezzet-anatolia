-- Modül 05 — Katalog: ürün + varyant + ürün-koleksiyon bağı.
-- Paylaşılan alanlar Product'ta; satılabilir birim ProductVariant (DATA_MODEL, DOMAIN §13).
-- product_collections = task 1'de ertelenen çoklu bağ (artık Product FK'si var). RLS deny-by-default.
-- Incremental: ingredients/nutrition alanları ilgili özellikleriyle sonra.

create type product_date_type as enum ('DLC', 'DDM');

-- ── SAKLAMA REJİMİ (kullanıcı kararı 16.08) ─────────────────────────────────
-- Soğuk zincir bugüne kadar SAKLANMIYORDU: `shippable = false` onun yerine geçiyordu ve DOMAIN §250
-- bunu açıkça yazıyordu ("bazı ürünler soğuk zincir nedeniyle kargoyla gönderilemez"). Yani sistem
-- SEBEBİ değil SONUCU tutuyordu — teslimat kararı için yeterliydi, ama bir kural sebebi istiyor:
--
--   `DOMAIN §8` + `ReturnDispositionEnum`: *"teslim edilmiş ve sonra iade edilen DONUK ürün, soğuk
--   zinciri belgelenemediği için varsayılan olarak imha edilir."*
--
-- O kural yazılamıyordu, çünkü hangi ürünün donuk olduğunu söyleyen bir alan yoktu; iade ekranı da
-- her kalemde `restock`tan başlıyordu — kuralın tam tersi. `shippable` yerine geçemez: o bir
-- TESLİMAT olgusudur ("kargoya verilemez"), bu bir SAKLAMA olgusu. Soğutulmuş bir ürün de kargoya
-- verilemeyebilir; kural ise özellikle donuktan bahsediyor.
--
-- ÜÇ DEĞER, çünkü ikisi yetmiyor: "soğuk zincir" hem soğutulmuşu hem donuğu kapsıyor (vitrin işareti
-- ikisinde de çıkar), ama imha varsayılanı YALNIZ donukta doğar. Boolean bir alan, doğduğu kuralı
-- yine yazamaz hâlde bırakırdı.
--   ambient → oda sıcaklığı; soğuk zincir gerekmez
--   chilled → soğutulmuş (0–4 °C); soğuk zincir gerekir
--   frozen  → donuk (−18 °C); soğuk zincir gerekir VE iade varsayılanı imhadır
--
-- **VARSAYILAN `frozen`** ve gerekçesi `shippable`ınkiyle aynı ailedendir (08.08 kararı): unutulan
-- alanın bedeli güvenli tarafta kalmalı. Yanlış `ambient` işaretlenmiş bir donuk ürünün iadesi rafa
-- döner ve yeniden satılır — bedeli gıda güvenliğidir. Yanlış `frozen` işaretlenmiş bir kuru ürünün
-- bedeli ise fazladan imha ve vitrinde temkinli bir işaret. İkisi arasında seçim tartışmasızdır.
create type product_storage_type as enum ('ambient', 'chilled', 'frozen');

-- Ürün satış durumu TEK alanda. Önce iki bayrak (is_candidate + is_active) vardı; üç durum için dört
-- kombinasyon doğuruyordu ve ikisi ("aday + aktif", "aday + pasif") davranışta AYNI şeydi — imkânsız
-- durum temsil edilebilir kalıyordu. Enum bunu kapatır: her satır tam olarak bir durumdadır.
--   active    → satışta
--   passive   → satışta değil (arşiv değil; katalogda gizli)
--   candidate → aday: satılamaz, yalnız keşif akışında görünür (DOMAIN §13)
create type product_status as enum ('active', 'passive', 'candidate');

-- AB 14 alerjeni (FR/DE'de yasal beyan zorunlu). Enum anahtarı ASCII; görünen ad (TR/FR/DE) UI'da.
create type product_allergen as enum (
  'gluten', 'kabuklu', 'yumurta', 'balik', 'yer_fistigi', 'soya', 'sut',
  'sert_kabuklu', 'kereviz', 'hardal', 'susam', 'sulfit', 'aci_bakla', 'yumusaka'
);

create table public.product (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,                               -- LocalizedText
  description jsonb,                                 -- LocalizedText, opsiyonel
  slug text not null,                                -- dil-bağımsız (SEO_I18N)
  category_id uuid references public.category (id) on delete set null,
  -- Görsel künyesi (Komponent Envanteri §0B): tek kaynak 3:2 dosya + odak noktası; her müşteri
  -- çerçevesi (3:2 kart, 1:1 sepet, daire) buradan object-position ile türer, kırpılmış kopya yok.
  image_key text,                                    -- depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,        -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,        -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,          -- zoom %, 100-400 (dikey/kare kaynağı yatay banda kırpar)
  -- LocalizedText; erişilebilirlik + SEO. **Boşsa ürün ADINA düşer** (kategori satırındaki desenin
  -- aynısı) ve o yüzden ürün formunda alanı YOK (`product-form/schema.ts` `.omit()`). Künye bir
  -- zamanlar "kart görselinde zorunlu" diyordu; yedek zinciri kurulunca o cümle geçerliliğini
  -- yitirdi ve yayın kısıtına da bu yüzden alınmadı (27.08 künyesi aşağıda).
  image_alt jsonb,
  image_updated_at timestamptz,                      -- görsel dosyasının sürüm damgası (gerekçe: 0004 kategori satırı)
  -- Yasal beyan (INCO) — müşteri ürün sayfasının zorunlu bölümleri.
  -- ingredients/storage_instructions DÜZ METİN'dir; içinde yalnız `**vurgu**` işareti taşır. HTML
  -- SAKLANMAZ: temizleme (sanitize) yükü, XSS yüzeyi ve AI çevirinin etiketleri bozması buradan gelirdi.
  -- Vurgu otomatik türetilemez — INCO alerjenin listede YAZILDIĞI hâlinin ("buğday unu") vurgulanmasını
  -- ister, kategori adının ("Gluten") değil; üstelik saklama metnindeki vurgu hiçbir alerjene bağlı değil.
  ingredients jsonb,                                 -- LocalizedText, çok dilli içindekiler
  nutrition jsonb,                                   -- SABİT kalemli (100 g başına) — NutritionSchema
  storage_instructions jsonb,                        -- LocalizedText; saklama/hazırlama metni
  allergens product_allergen[] not null default '{}', -- AB 14 yasal beyan (manuel seçim)
  -- "BEYAN EKSİK" TEK KAYNAKTA. Aynı ölçüt daha önce sorgu kurucusunda bir `or` dizesi olarak
  -- yaşıyordu ve sayaç için ayrı, süzgeç için ayrı kuruluyordu — ikisi ayrışırsa ekran "24 beyan
  -- eksik" yazıp süzgeçte 12 satır gösterir. Üretilmiş kolon: yazarken hesaplanır, indekslenebilir,
  -- hem süzgeç hem sayaç aynı gerçeği okur. HANGİ beyanın eksik olduğu (rozet ayrıntısı) uygulamada
  -- kalır; burada yalnız "eksik var mı" sorusu var.
  --
  -- **ÖLÇÜT `has_all_locales` (05.36, 27.08).** Eskiden `name ->> 'fr' is null` yazıyordu ve BOŞ
  -- DİZEYİ dolu sayıyordu: operatör alanı açıp boş bırakınca `{"fr": ""}` yazılıyor, rozet
  -- "tamam" diyor, müşteri Fransızca yerine Türkçe görüyordu (`resolveLocalizedText` yedek
  -- zinciri sessiz). Aynı ölçüt aşağıdaki yayın kısıtında da geçiyor — ikisi ayrışırsa ekran
  -- "eksik yok" derken veritabanı yayını reddeder ve operatör sebebi hiçbir yerde göremez.
  -- Çok dilli beyan alanları da (`ingredients`, `storage_instructions`) artık varlığa değil
  -- DOLULUĞA bakıyor: Fransızcası boş bir içindekiler listesi, INCO açısından yok hükmündedir.
  is_incomplete boolean generated always as (
    not public.has_all_locales(name)
    or not public.has_all_locales(ingredients)
    or not public.has_all_locales(storage_instructions)
    or nutrition is null
    or allergens = '{}'
  ) stored,
  traces product_allergen[] not null default '{}',   -- çapraz bulaşma; cümle i18n şablonuyla kurulur
  -- Fransa gıda oranları: **5,5** (dondurulmuş/paketli) · **10** (hazır tüketim — "consommation
  -- immédiate", dondurma/porsiyon kalemler) · **20** (gıda dışı). Künye uzun süre "5.5 / 20"
  -- diyordu ve eksikti — seed 08.08'den beri %10 yazıyor (kapsam denetimi 09.08 ile ölçüldü).
  -- Kısıt KONMUYOR: oran mali bir karardır ve mevzuat değişince kolon kısıtı migration ister.
  vat_rate numeric(4, 2) not null default 5.5,
  date_type product_date_type not null default 'DDM',
  shelf_life_days int,                               -- toplam raf ömrü (gün); kalan % = (parti.dlc − bugün) ÷ bu
  -- **VARSAYILAN `false` — kullanıcı kararı 08.08.** Önce `true`ydu: işaretlenmemiş her ürün
  -- "evet, kargola" sayılıyordu. Donuk gıdada o varsayımın bedeli ekranda bir sayı değil, müşteriye
  -- çözülmüş ulaşan bir pakettir. Unutulan alanın bedeli **"satılamadı"** olmalı, "bozuk gitti" değil.
  -- Not: bu bir güvenlik kısıtı değil bir varsayılan — `false` = yalnız rota/kapı (soğuk zincir).
  shippable boolean not null default false,
  -- Saklama rejimi — soğuk zincirin KENDİSİ (enum künyesi yukarıda). `shippable` ile KARIŞTIRILMAZ:
  -- o "kargoya verilir mi", bu "nasıl saklanır". İkisi çoğu üründe birlikte hareket eder ama aynı
  -- şey değildir ve ayrı kararlardır — biri satış kanalını, öteki iade/imha ve vitrin işaretini
  -- belirler.
  storage_type product_storage_type not null default 'frozen',
  -- satışta / pasif / aday (tek alan, yukarıdaki enum)
  --
  -- **VARSAYILAN `candidate` — kolon `active` diyordu ve bu yaşanmış bir arızaydı** (05.36, 27.08).
  -- Form zaten `candidate` gönderiyor ve künyesi sebebini yazmış: *"doğan iki ürün SATIŞTA doğdu,
  -- üstelik beyanları eksikti — oysa ekran 'ADAY olarak doğar, vitrinde görünmez' diye söz
  -- veriyordu."* Düzeltme yüzeyde yapılmış, veride yapılmamıştı: formu atlayan her yazan (asistan
  -- dilekçesi, servis çağrısı, ileride bir uç) kolonun varsayılanını alıyor ve ürün fiyatsız,
  -- stoksuz, beyansız hâlde SATIŞA doğuyordu. `MB-22a`/`09.6`in dersi birebir: *"yüzeyde
  -- durdurulan bir kuralın ikinci bir yazma yolu varsa, kural yok demektir"*.
  --
  -- Aşağıdaki yayın kısıtının da ön şartı: `active` varsayılanıyla, üç dili henüz dolmamış her yeni
  -- ürün doğar doğmaz kısıta çarpardı — oysa doğru davranış aday doğup üç dil dolunca yayına
  -- alınmaktır (tarif emsali `0038`: `is_active` varsayılanı `false`).
  status product_status not null default 'candidate',
  target_margin_percent numeric(5, 2),              -- hedef kâr marjı (markup %); marj uyarısı / oto-fiyat
  target_margin_b2b_percent numeric(5, 2),          -- B2B'ye ÖZEL hedef (15.08); boş = ortak hedef geçerli
  auto_price boolean not null default false,         -- açıksa fiyat hedef marja göre otomatik (motor sonraki modül)
  sort_order int not null default 0,

  -- ── ÜRÜN AİLESİ — ÇEŞİT EKSENİ (05.15) ────────────────────────────────────
  -- `on delete set null`: aile silinirse üyeler ürün olarak yaşamaya devam eder. Aşağıdaki kısıt
  -- etiketin de aileyle birlikte düşmesini zorluyor — ailesiz bir üründe duran "Limonlu" etiketi,
  -- hiçbir yerde okunmayan ve bir gün yanlış aileye taşınacak ölü veridir.
  family_id uuid references public.product_family (id) on delete set null,

  -- **AİLE İÇİ ETİKET — ürün adından AYRI ve ÜÇ DİLLİ** (kullanıcı kararı 04.08).
  -- Ürün adı "Limonlu kek", kart etiketi "Limonlu". Kartta okunan ikincisidir: kartlar yan yana
  -- dururken her birinde "kek" kelimesini tekrar etmek seçimi zorlaştırır.
  -- **Türetilemez:** ortak eki kırpmak "Çilekli Kek" ile "Kek Dilimi" yan yana gelince bozulur.
  family_label jsonb,                                -- LocalizedText {tr?,fr?,de?}

  -- **SIRA AİLE İÇİNDEDİR** ve operatörün sürüklediği sıradır. `sort_order` KULLANILMAZ: o katalog
  -- sırasıdır ve iki kararı tek kolona bağlamak, ailedeki sırayı değiştiren operatöre katalog
  -- sırasını da farkında olmadan değiştirtirdi. Yazma tüm aileyi birden değiştirir, o yüzden
  -- (family_id, family_position) tekilliği ARANMAZ: toplu güncellemenin ara hâli geçici olarak
  -- çakışır ve ertelenmiş bir kısıt bu kadar küçük bir küme için fazla makine olurdu.
  family_position int not null default 0,

  -- **Ailedeki üyenin etiketi ZORUNLU.** Kural veride duruyor çünkü ekranda unutulduğunda hata
  -- vermez: kart ürün adına düşer, "Limonlu kek" yazar ve DOĞRU GÖRÜNÜR — kısa etiketin bütün
  -- amacı sessizce kaybolur. Gürültülü bir kayıt hatası, sessiz bir tasarım kaybından iyidir.
  constraint product_family_label_required check (family_id is null or family_label is not null),

  -- ── YAYIN ÜÇ DİL İSTER (05.36 · mobil şeridin talebi 25.08, tarif emsali 07.08) ─────────────
  --
  -- **Ölçülmüş arıza:** Fransızcası olmayan ürün Fransız müşteriye SESSİZCE Türkçe gösteriliyordu.
  -- Hiçbir yerde hata yok, hiçbir işaret yok — `resolveLocalizedText` yedek zinciri
  -- (seçili → TR → FR → DE) eksikliği kendiliğinden kapatıyor. Talep mesajlarında bunun bir
  -- karşılığı var (*"Traduit automatiquement"*), katalogda yok: ürün adı satın alma kararının
  -- metnidir ve burada "otomatik çevrildi" demek de yetmez, üstelik gıda.
  --
  -- **Neden VERİDE, formda değil** (`MB-22a`/`09.6`in dersi): üründe en az üç yazan var — operasyon
  -- formu, asistan dilekçesi (`product_draft`/`product_create`) ve seed. Kural yalnız yüzeyde
  -- dururken ikinci bir yazma yolu kalıyor, ve *"yüzeyde durdurulan bir kuralın ikinci bir yazma
  -- yolu varsa, kural yok demektir"*. Veride durunca kaç yazan olduğu önemsizleşir.
  --
  -- **YAZMA anına değil YAYIN anına bağlı** (tarif deseni): ürün `candidate`/`passive` olarak doğar,
  -- üç dil dolunca `active` olur. Aksi hâlde operatör ürünü hiç oluşturamazdı — form da zaten tek
  -- turda üç dil yazmıyor, "✦ AI çeviri" düğmesiyle dolduruluyor.
  --
  -- **Zorlama ÇEVİRİYE değil DOLULUĞA:** kısıt "AI çevirdi mi" diye sorsaydı kota bittiği gün ürün
  -- yayınlanamaz olurdu (`20.1`: AI anahtarsızken özellik düşmez). Operatör üç dili elle de yazar.
  --
  -- **Kapsam kararı (talep bunu katalog şeridine bıraktı):** ölçüt "müşteriye görünen metin" değil,
  -- **YEDEĞİ OLMAYAN metin**. `description` içeride: yedeği yok, boşsa ürün açıklamasız kalır ve
  -- satın alma kararının metni odur. `ingredients`/`storage_instructions` yasal beyandır (INCO),
  -- yedeği olamaz ve zaten `is_incomplete`in ölçütü. `family_label` aile üyesindeyken içeride:
  -- kartta okunan odur ve boşsa sessizce ürün adına düşer — kısa etiketin bütün amacı kaybolur
  -- (`product_family_label_required` künyesi).
  --
  -- **`image_alt` DIŞARIDA ve bu ölçülerek karara bağlandı (27.08):** alan ürün formunda YOK ve
  -- bilerek yok — `product-form/schema.ts` onu `.omit()` ediyor, gerekçesi *"boşsa müşteride ürün
  -- adına düşer"*. Kısıta konsaydı çıkmaz sokak olurdu: operatörün dolduramadığı bir alan yüzünden
  -- hiçbir ürün yayınlanamazdı. Üstelik gerek de yok — yedek ürün ADIdır ve ad bu kısıtla üç dilde
  -- zorunlu hâle geliyor, yani alt metin de kendiliğinden doğru dile düşüyor. Kolonun kendi künyesi
  -- bir zamanlar "kart görselinde zorunlu" diyordu; form kararı ondan yenidir ve yedek zincirini
  -- kurmuştur. `nutrition` da dışarıda — çok dilli değil, sabit kalemli sayı tablosu.
  constraint product_publish_requires_all_locales check (
    status <> 'active'
    or (
      public.has_all_locales(name)
      and public.has_all_locales(description)
      and public.has_all_locales(ingredients)
      and public.has_all_locales(storage_instructions)
      and (family_id is null or public.has_all_locales(family_label))
    )
  ),

  created_at timestamptz not null default now()
);

-- Bir üyenin sayfasında "öteki çeşitler" okuması: aile + sıra.
create index product_family_idx on public.product (family_id, family_position) where family_id is not null;
create unique index product_slug_key on public.product (slug);
create index product_incomplete_idx on public.product (is_incomplete) where is_incomplete;
create index product_category_idx on public.product (category_id);

create type portion_kind as enum ('item', 'slice');

create table public.product_variant (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  -- Müşteriye GÖRÜNEN boy etiketi ("700 g tepsi" / "plateau 700 g") → çok dilli. Üç dilli vitrinde
  -- tek dil kalamazdı: ürünün adı/açıklaması/beyanı çevriliyken boy seçicisi Türkçe kalıyordu.
  -- Boş olabilir ({}): tek boylu üründe etiket yoktur, müşteri seçici görmez. Birden çok varyantta
  -- en az bir dilin dolu olması FORM kuralıdır (boy'ları ayırt edilemez bırakmamak için).
  label jsonb not null default '{}'::jsonb,          -- LocalizedText
  net_weight_g int,
  -- ── PAKET İÇİ ADET (05.14 · besleme notu 08.08) ─────────────────────────────
  -- "12'li baklava" ile "36'lı baklava" aynı ÜRÜNÜN iki boyudur; adet ürünü ayırmaz, varyantı
  -- ayırır. Kolonu olmadığı için üreteç adedi adın içinde bırakıyordu (`… (12 Pieces)`) ve slug
  -- ayrıştığı için tek baklava dört ayrı ürüne bölünüyordu — ölçüldü: 33 kayıt, 14 taban.
  --
  -- Gramajın YERİNE değil YANINA: bir varyant hem 36 adet hem 2500 g olabilir ve ikisi ayrı
  -- soruya cevap verir ("kaç kişilik" ↔ "ne kadar yer kaplar"). null = adet bilgisi yok (dökme
  -- ürün) — sıfır DEĞİL: sıfır "içinde hiç parça yok" demek olurdu (CLAUDE §1).
  pieces_count int,
  -- ── PORSİYON TÜRÜ: "4 adet" ile "12 dilim" AYNI ŞEY DEĞİLDİR (kullanıcı kararı 19.08) ────────
  -- `pieces_count` tek başına "kaç kişilik"i söylüyor ama vitrinin yazacağı KELİMEYİ söylemiyordu:
  -- 4'lü simit paketi 4 AYRI simittir, 12 dilimlik cheesecake ise TEK pastadır. Ekran ikisine de
  -- "12 adet" yazınca müşteri 12 cheesecake aldığını sanıyor (ölçüldü: 10 üründe böyle okunuyordu).
  --
  -- Ayrım kaynakta duruyor ve TAHMİN EDİLMİYOR: basılı katalog adında `(12 slice)` diyor, üreteç
  -- onu `catalog-pdf.json` → `unit.portionKind` alanına küratelenmiş olarak taşıyor.
  --
  -- `null` = tek parça ürün; porsiyon sorusu hiç doğmuyor (`pieces_count` de null olur).
  portion_kind portion_kind,
  -- ── AMBALAJLI ÜRÜN ÖLÇÜSÜ — kargo kanalının girdisi (07.12) ─────────────────
  -- `net_weight_g` ile KARIŞTIRILMAZ ve o yüzden adı sıfatlı: net ağırlık INCO beyanıdır ve
  -- €/kg gösterimini besler (içindeki GIDANIN ağırlığı); bu ise taşınan şeyin ağırlığıdır —
  -- ürün + kendi ambalajı. 810 g'lık bir kek kutusu ambalajıyla 1,1 kg olabilir ve taşıyıcıya
  -- söylenecek sayı ikincisidir. Çıplak `weight_g` adı ilk tasarımda yazılmıştı; `net_weight_g`
  -- ile yan yana durunca hangisi olduğu okunmuyordu (28.08 sapma kaydı).
  --
  -- **MİLİMETRE, santimetre değil:** ondalık kalınlık (1,5 cm) tam sayı alanında sessizce
  -- yuvarlanır. Sağlayıcı `mm` birimini doğrudan kabul ediyor (canlı ölçüm 28.08) — saklanan
  -- sayı dönüşümsüz tele giriyor.
  --
  -- **GRAM, kilogram değil:** aynı gerekçe + sağlayıcı `g` kabul ediyor. Kilogramı ondalıkla
  -- taşımak kayan nokta artefaktı üretiyordu (referans projede `toFixed(3)` yaması bu yüzden var).
  --
  -- **null = ÖLÇÜLMEDİ, sıfır DEĞİL** (CLAUDE §1). Ölçüsüz varyant için canlı teklif alınmaz;
  -- ekran "ölçüsü eksik" der. Sıfır yazsaydık koli planı onu "hiç yer kaplamıyor" diye okurdu.
  -- Kısıt pozitiflik zorluyor: ölçülmüş bir ambalaj sıfır olamaz.
  packed_weight_g int check (packed_weight_g is null or packed_weight_g > 0),
  packed_length_mm int check (packed_length_mm is null or packed_length_mm > 0),
  packed_width_mm int check (packed_width_mm is null or packed_width_mm > 0),
  packed_height_mm int check (packed_height_mm is null or packed_height_mm > 0),
  min_stock_qty int,                                 -- asgari eşik (DOMAIN §16); null = öneri yok
  sku text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  -- ÜÇ ÖLÇÜ BİRLİKTE YAŞAR ya da hiç yaşamaz. İkisi dolu biri boş bir kutu hiçbir soruya cevap
  -- vermez: hacim hesaplanamaz, taşıyıcıya gönderilemez, ama ekran "ölçüsü var" diye okur.
  -- Ağırlık BU KURALIN DIŞINDA ve bilerek: kimi tarife yalnız ağırlığa bakar, üstelik operatör
  -- önce tartıp sonra ölçebilir — yarım ilerlemeyi engellemek kimseye hizmet etmez.
  constraint product_variant_packed_dims_all_or_none check (
    (packed_length_mm is null and packed_width_mm is null and packed_height_mm is null)
    or (packed_length_mm is not null and packed_width_mm is not null and packed_height_mm is not null)
  )
);
create index product_variant_product_idx on public.product_variant (product_id);

-- Ürün galerisi — detay sayfasındaki EK fotoğraflar. Kapak burada TEKRARLANMAZ: o
-- `product.image_key`'de durur, çünkü liste/kart/paylaşım kartı kapağı ürünle aynı satırda okur
-- (ayrı sorgu doğurmasın). Bu tablo yalnız 2., 3., … fotoğrafı tutar.
--
-- Kırpma künyesi kapaktakiyle AYNI alanlar: her fotoğrafın kendi odağı vardır (tasarım her slota ayrı
-- odak veriyor). Ama galeri fotoğrafı tek çerçevede görünür (detay galerisi, 3:2) — kapak gibi dört
-- ayrı çerçeveye türemez; fark veride değil, editörün gösterdiği önizlemede.
create table public.product_image (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  image_key text not null,                           -- depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,        -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,        -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,          -- zoom %, 100-400
  image_alt jsonb,                                   -- LocalizedText; boşsa ürün adına düşer
  image_updated_at timestamptz,                      -- sürüm damgası (gerekçe: 0004 kategori satırı)
  sort_order int not null default 0,                 -- müşteri galerisinin sırası (sürükle-bırak)
  created_at timestamptz not null default now()
);
-- Galeri her zaman ürün başına ve SIRALI okunur.
create index product_image_product_idx on public.product_image (product_id, sort_order);

-- ── Paket (bundle) ───────────────────────────────────────────────────────────────────────────────
-- Birden çok ürünü TEK fiyata sunan katalog kısayolu (DOMAIN §13). Yeni ürün YARATMAZ: sepete
-- eklenince içindeki her kalem ayrı `order_item` olur, sistem müşteri hepsini tek tek almış gibi akar
-- (stok, hazırlık, kâr, fatura kalem kalem). Bu yüzden paketin varyantı, stoğu ve KDV'si yoktur.
--
-- Burada, ürün migration'ında duruyor çünkü kalemleri `product_variant`'a bağlı ve `0012`'teki
-- `order_item.bundle_id` bu tabloya FK verecek — paket ondan ÖNCE var olmak zorunda.
--
-- Paket YALNIZ B2C'dedir: `total_price` tek sayıdır ve **KDV dahil (TTC)** — b2c kanal tabanı. Kanal
-- listesi, müşteriye özel fiyatı ve `price` satırı YOKTUR. Toptan müşteri paketi görmez; pazarlık
-- kalem üzerinden yürür, paket ise sosyal medyaya yönelik bir pazarlama kısayoludur.
create table public.bundle (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,                               -- LocalizedText
  description jsonb,                                 -- LocalizedText; listede kısa, detayda tam
  slug text not null,                                -- sosyal paylaşımın tek bağlantısı (dil-bağımsız)
  -- Görsel künyesi ürünle AYNI alanlar (Komponent Envanteri §0B): tek 3:2 kaynak + odak; müşteri
  -- çerçeveleri (liste kartı 3:2, detay 3:2, anasayfa koyu kart 1:1) buradan türer.
  image_key text,
  image_focal_x smallint not null default 50,
  image_focal_y smallint not null default 50,
  image_zoom smallint not null default 100,
  image_alt jsonb,
  image_updated_at timestamptz,
  total_price numeric(10, 2) not null,               -- müşterinin gördüğü TEK fiyat, TTC
  -- "6 kişilik" — tasarımda ad üstü künyede duruyor (Paket Detay + Paketler listesi). Serbest metne
  -- gömülemez: künye olarak tutarlı basılması ve boş olduğunda satırın HİÇ çizilmemesi gerekiyor.
  serves int,
  is_active boolean not null default true,
  sort_order int not null default 0,                 -- kürelenmiş vitrin sırası (müşteri sıralamaz)
  -- Vitrinde göster (05.18) — ana sayfa tasarımı pakete 2 slot çiziyor; kod bugün seçimsiz ilk
  -- üçünü kesiyor (`HOME_PACKAGE_LIMIT`). İşaret SEÇİMDİR, sıra `sort_order`'dan gelir.
  -- `is_active` ile karıştırılmaz: aktiflik "satışta mı", bu "ana sayfada mı".
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index bundle_slug_key on public.bundle (slug);
create index bundle_featured_idx on public.bundle (sort_order) where is_featured;

-- Paket kalemi. `allocated_unit_price` MÜŞTERİYE GÖRÜNMEZ: iç muhasebe aracıdır — faturada her
-- kalemin KDV'si kendi ürününün oranından işlensin diye gerekli (baklava %5,5, malzeme %20).
-- Σ(allocated × qty) = bundle.total_price kuralını uygulama katmanı doğrular (motor: domain-core);
-- SQL check'e konamaz, çünkü kural satır değil KÜME üzerindedir.
create table public.bundle_item (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundle (id) on delete cascade,
  -- `restrict`: pakette duran varyant silinemez. Varyant silme zaten okunabilir hataya çevriliyor
  -- (ProductVariantService.deleteVariant) — paket de o cümlenin kaynaklarından biri olur.
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  qty int not null check (qty > 0),
  allocated_unit_price numeric(10, 2) not null check (allocated_unit_price >= 0), -- 0 = hediye kalem
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
-- Kalemler paket başına ve SIRALI okunur.
create index bundle_item_bundle_idx on public.bundle_item (bundle_id, sort_order);
-- Aynı varyant bir pakete iki kez giremez — "iki tane" demek için adet artırılır. İki satır olsaydı
-- müşteri aynı ürünü listede iki kez görürdü ve toplam doğrulaması sessizce iki yerden beslenirdi.
create unique index bundle_item_variant_key on public.bundle_item (bundle_id, variant_id);

-- Ürün ↔ koleksiyon çoklu bağı (bir ürün birçok koleksiyona girer).
-- position: koleksiyon İÇİNDEKİ vitrin sırası — admin sürükle-bırakla kürasyon yapar.
create table public.product_collections (
  product_id uuid not null references public.product (id) on delete cascade,
  collection_id uuid not null references public.collection (id) on delete cascade,
  position int not null default 0,
  primary key (product_id, collection_id)
);
-- Üyeler koleksiyon başına sıralı okunur; PK'nın baş kolonu product_id olduğu için collection_id ile
-- filtreleyen sorgular o indeksten yararlanamaz.
create index product_collections_order_idx on public.product_collections (collection_id, position);

alter table public.bundle enable row level security;
alter table public.bundle_item enable row level security;
alter table public.product enable row level security;
alter table public.product_variant enable row level security;
alter table public.product_collections enable row level security;
alter table public.product_image enable row level security;


-- ═══ FİYAT (03.4) ═══
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- Modül 05 — Katalog: fiyat (05.4). Fiyat VARYANT seviyesindedir; aynı tablo üç işi görür:
-- kanal listesi (customer_id boş), müşteriye özel fiyat (customer_id dolu), tarihli geçerlilik.
-- Çözüm sırası ve KDV tabanı: DOMAIN §5, motor: packages/domain-core/src/pricing.
-- RLS deny-by-default (0001 deseni); erişim sunucudan service_role ile.

-- Kanal — *kim* alıyor. Order ve Customer türetimi de bu tipi kullanacak (DATA_MODEL enum listesi).
create type channel as enum ('b2b', 'b2c');

-- Tek pazar → tek para birimi; çoklu döviz Faz 1'de yok (tip yine de açık, ileride genişler).
create type currency as enum ('EUR');

-- MÜŞTERİ FİYAT GRUBU (kullanıcı kararı 20.08) — B2B'nin alt kademeleri: market aylık yüksek
-- hacim alır, restoran/pastane düşük; aradaki fark bir İNDİRİM değil FİYATTIR (kampanya havuzuyla
-- yarışmaz, müşteri "kendi fiyatını" görür). Grup, B2B liste fiyatı üstünden yüzde taşır; çözüm
-- sırası motorda: müşteriye özel → grup → liste (`domain-core/resolve-price`). Satır bazlı grup
-- listesi BİLEREK yok — katalog bakımı grup sayısıyla çarpılırdı; varyant istisnası zaten
-- müşteriye özel fiyatla veriliyor.
create table public.price_group (
  id uuid primary key default gen_random_uuid(),
  -- Operatörün tanıyacağı ad ("Market", "Restoran / Pastane") — iç etiket, müşteriye görünmez.
  name text not null,
  -- B2B listeden düşülen yüzde. 0 meşru DEĞİL (grubu listeyle eş yapar — o zaman grup gereksiz);
  -- 100 bedava demek, o da meşru değil.
  percent_off numeric(5, 2) not null check (percent_off > 0 and percent_off < 100),
  created_at timestamptz not null default now()
);

alter table public.price_group enable row level security;

create table public.price (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  channel channel not null,
  -- Dolu → o müşteriye özel fiyat. FK YOK: `customer` tablosu henüz açılmadı (modül 04);
  -- tablo gelince bu kolona FK eklenir (greenfield — bu dosya o gün yerinde düzenlenir).
  customer_id uuid,
  -- KANAL TABANINDA tutulur: b2c satırları KDV dahil (TTC), b2b satırları hariç (HT) — DOMAIN §5.
  amount numeric(10, 2) not null check (amount >= 0),
  currency currency not null default 'EUR',
  -- Tarihli geçerlilik: aynı (varyant, kanal, müşteri) için birden çok satır olabilir; çözümde
  -- "geçmiş ve en yeni" kazanır. Gelecek tarihli satır fiyat değişimini önceden hazırlar.
  valid_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Fiyat çözümünün tek sorgu yolu: varyant + kanal + (müşteri | liste) → en yeni geçerli satır.
create index price_lookup_idx on public.price (variant_id, channel, customer_id, valid_from desc);

alter table public.price enable row level security;
