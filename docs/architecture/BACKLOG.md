# BACKLOG — İş Kalemleri

Bu dosya **ne yapılacağını** tutar (WORKFLOW.md §8 rol ayrımı). Mimari/domain kararları buraya girmez — onlar `STACK.md`, `DOMAIN.md`, `ARCHITECTURE_DECISIONS.md`'de; kapsam sınırları için `SCOPE.md`.

> **İlerleme burada tutulmaz.** Bir işin ne kadar yapıldığı YALNIZ `docs/build/NN-*.md` görev satırındadır (bkz. `docs/build/README.md` kural 5). Buradaki maddeler kapsam kalemidir — işaret taşımazlar. Tek istisna §0: orada işaret "karar verildi mi"yi gösterir, "kodlandı mı"yı değil.

Sıralama kabaca bağımlılık sırasındadır: üstteki alttakine zemin olur.

---

## 0. Bekleyen kararlar (kod öncesi netleşmeli)

Bunlar arkadaşa sorulan sorulara bağlı (bkz. WhatsApp soru listesi). Cevaplar gelmeden ilgili kalem başlamaz.

> **Ölçüm notu (denetim, 10.08):** aşağıdaki işaretler "karar verildi mi"yi gösterir, "kodlandı
> mı"yı değil (dosya başındaki kural). Ama üç maddede kod, kararın fiilen verildiğini söylüyor —
> işaretler bu yüzden bayat olabilir. **İşaretlere DOKUNULMADI**, karar kullanıcınındır; ölçüm
> maddelerin altına yazıldı ki bir sonraki okuyan sıfırdan aramasın.

- [ ] Marka adı yazımı: "Anatolia" mı "Anatolie" mi → `packages/brand`
  - *Kodda `packages/brand/src/index.ts` → `name: 'Lezzet Anatolia'` ve her yüzey oradan okuyor.
    Yani "Anatolia" fiilen yürürlükte; soru, bunun karar mı yoksa yer tutucu mu olduğu.*
- [ ] Ana logo seçimi + renk paleti → `packages/brand`, Tailwind token
- [x] Gramaj varyantı: **varyant katmanı var** (satılabilir birim = varyant; varyantsız ürün tek varsayılan varyant)
- [x] Satış birimi: **hepsi sabit paket** (adet). Alış toptan olabilir ama girişte pakete çevrilir (ör. 1kg → 10×100gr)
- [ ] Fiyat listesi (B2B/B2C) → seed verisi
- [~] Kategori yapısı: **düz (tek seviye) + koleksiyon** kararı verildi; nihai kategori/koleksiyon **içeriği** (isimler) bekliyor
- [x] Alerjen/içindekiler: `Product.allergens` (AB 14) + `ingredients` (çok dilli) — **model kararı** verildi (kodda `allergens` var, `ingredients` §3'te açık)
- [ ] Ürün bazında KDV oranları
  - *Model kararı verilmiş görünüyor: `product.vat_rate` (`0005`, varsayılan 5,5) ve sipariş kalemi
    kendi oranını dondururyor (`0012`). Bekleyen, hangi ürünün hangi orana gireceği — yani VERİ.*
- [ ] Raf ömrü bilgisi (DLC uyarı eşiği için)
  - *Aynı ayrım: `product.shelf_life_days` (`0005`) ve DLC türetimleri (`0006`) yerinde. Bekleyen,
    ürün başına gün değerleri.*

---

## 1. İskelet ve altyapı

- Monorepo kur: pnpm workspace + Turborepo + tsconfig (strict)
- Tailwind kurulumu + `packages/brand` (token kaynağı: renk, tipografi, spacing)
- Supabase projesi, `lib/supabase` (client/server)
- `packages/types` iskeleti + `LocalizedText`
- `packages/database`: `BaseDbService` + case-transformers (jsonb korumalı)
- `lib/guard.ts`: requireAuth + requireAdmin + requireWarehouse + requireCourier
- `lib/error.ts`
- i18n routing: `/tr` `/fr` `/de` + `packages/i18n` iskeleti + yedek zinciri çözücü (TR→FR→DE)
- `scripts/deploy.sh` + PM2 + Caddy
- **`scripts/` tip kontrolü dışında** (bulundu 29.07, seed işi sırasında) — kök `tsconfig.json` yalnız
  `eslint.config.js`'i kapsıyor, `turbo run typecheck` de paket paket koşuyor. Seed ve bakım
  betikleri hiç derlenmiyor: `Page<T>`'nin alanı `rows` iken `items` yazan bir satır sessizce
  geçti, hatası ancak `db:seed` çalıştırılınca görülecekti. Kök tsconfig'e `scripts/**` eklenip
  `typecheck`'e bağlanmalı.
- **Gözlemleme (log · hata izleme · sistem sağlığı)** — kapsam: `pino` + `error_log`/`capture_error`
  + `system_health_snapshot` + tek operasyon ekranı. Referans [`OBSERVABILITY.md`](OBSERVABILITY.md),
  tablolar `data-model/operasyon.md`, ekran `design/pages/admin-sistem.md`, görev
  `build/18-operasyon-guvenlik.md` (18.5). **E-posta alarmı bilinçli olarak yok** — izleme çekme
  modeliyle, ekran alarmın yerini tutar. *(Madde "tasarımı yazıldı, kodu yazılmadı" diyordu; ölçüldü
  10.08 — üçü de kodda, gözlemleme karşı-denetimi 03.08'de kapandı. Durum görev satırındadır.)*

## 2. Kimlik ve roller

- Kullanıcı/oturum (Supabase Auth)
- `user_profiles` + `roles` dizisi: personel içinde çoklu rol, müşteri ↔ personel keskin ayrım
- Rol bazlı yetki kapıları ve yönlendirme
- **Kenarda (middleware) oturum ön elemesi** — ERTELENDİ (28.07 kullanıcı kararı): operasyon
  yüzeyi tamamlansın, sonra bakılır. Bugünkü kapı layout'ta (`(operations)/operations/layout.tsx`)
  ve tüm alt sayfaları kapsıyor; eksik olan, sayfa kodu çalışmadan **önce** dönen ucuz bir eleme.
  Karar noktası: rol `user_profiles`'tan service-role ile okunuyor (RLS deny-by-default) ve o
  anahtar kenar paketine sokulmak istenmiyor → ya yalnız oturum çerezi bakılır (ucuz, girişli
  müşteriyi durdurmaz), ya rol JWT talebine gömülür (sorgusuz ama rol iptali bir sonraki girişe
  kadar bayat kalır), ya da kenar Node çalışma zamanına alınır. Ölçülecek: gezinme başına ek
  gecikme.

## 3. Katalog (ürün/kategori)

- Category entity (çok dilli ad, düz/tek seviye)
- Collection entity + `product_collections` (çoklu; Bayram/Yeni/İndirimde) + slug
- Bundle + BundleItem: sepette `OrderItem`'lara açılma, atanmış fiyat toplamı = paket fiyatı, hediye = 0, slug
- Product entity (çok dilli ad/açıklama, görsel, KDV, aktif, sıra)
- `ProductVariant` entity (satılabilir birim = varyant; sabit paket/adet); fiyat/stok varyanta bağlı
- Alerjen alanı: `Product.allergens` (AB 14 enum, manuel seçim) + görünen ad TR/FR/DE
- **Yasal beyan alanları:** `ingredients` · `nutrition` (sabit kalemli, 100 g) · `traces` (çapraz bulaşma) · `storage_instructions` — dördü de müşteri ürün detayının zorunlu bölümleri. *(Madde "operasyon formunda giriş yeri yok, bugün girilemiyor" diyordu; ölçüldü 10.08 — dördünün de girişi var, `products/tabs/product/product-form-declaration.tsx`.)*
- `ProductVariant.label` → LocalizedText (müşteriye görünen boy etiketi; bugün tek dil)
- Görsel yükleme (`packages/storage`, image_key deseni)
- **Görsel okuma URL'i public'e iner:** bugün her render'da 30 dk'lık imzalı (signed) URL üretiliyor; katalog görselleri gizli olmadığı için imzanın koruma değeri yok, bedeli var — tarayıcı/CDN cache'i ölü, paylaşım (OG) kartı imza dolunca görselsiz kalıyor, vitrin statik cache'lenemiyor. R2 public okuma + `R2_PUBLIC_BASE_URL` + `?v=<updated_at>` sürüm damgası. Başlangıç: r2.dev geliştirme adresi (alan adı yok); özel alan (`cdn.<domain>`) sonra, yalnız env değeri değişir. → `build/05-katalog.md (05.11)`
- `ProductImage` (galeri): ek görseller + sıralama; kapak üründe kalır
- **Beyanı EKSİK ürün müşteri yüzeyinde süzülmüyor** *(ölçüldü 11.08, 22.16 sırasında)*. Vitrin ve
  katalog okumaları yalnız `status = 'active'` bakıyor; `product.is_incomplete` (üretilmiş kolon:
  ad dillerinden biri yok **veya** içindekiler/besin/saklama yok **veya** alerjen listesi boş) hiçbir
  müşteri sorgusunda süzgeç değil. Yani fiyatı ve stoğu girilen eksik beyanlı bir ürün satışa çıkar —
  INCO 1169/2011 kapsamında satılamayacak bir kayıt. **Ölçüm:** iki yeni ürün `active` +
  `is_incomplete: true` olarak doğdu (o kısmı 22.16'da düzeltildi: yeni ürün artık `candidate`
  doğuyor, ama operatör elle "Satışta" yaparsa kapı yine yok). Karar: süzgeç müşteri okumasına mı
  eklenecek (sessiz gizleme), yoksa "Satışta"ya geçiş beyan tamamlanmadan ENGELLENECEK mi (görünür
  ret)? İkincisi daha dürüst — operatör neden satamadığını öğrenir. Sipariş/vitrin şeridinin alanı.
- ~~Operasyon ürün formu tasarımının güncellenmesi (claude_design)~~ — **karşılandı** (ölçüldü 10.08): "Yasal beyan" bölümü dört alanı da alıyor (`product-form-declaration.tsx`), galeri yönetimi de var (`product-photos.tsx`). Madde, bu ikisi tasarımda yokken açılmıştı.
- Ürün skoru okuma önbelleği (`rating_avg`/`rating_count` ya da materialized view) — kaynak `Review`, katalog/detay/benzer listelerinde agregasyon tekrarlanmasın
- AI çeviri önerisi: girilen dilden diğer ikisini üret, admin onayı
- Admin katalog ekranları (telefon öncelikli)
- Müşteri katalog + arama/filtre (server-rendered, çok dilli, cihaz çatallı)

## 4. Fiyat

- Price entity: kanal + müşteriye özel + B2C
- `Customer.discount_percent` (genel özel indirim)
- Fiyat çözümü (domain-core): özel ürün fiyatı → müşteri indirim oranı → kanal fiyatı
- Maliyet-bazlı: `Product.target_margin_percent` + `auto_price` (otomatik güncelle / marj altı uyarısı)
- **Fiyat ekranı başlık sayaçlarının katalog geneline çıkması.** Bugün sayaçlar YÜKLENEN sayfaya
  ait; masaüstü bunu söylüyor ("50 boy yüklendi · 3 marj-altı"), mobil söylemiyor. İki iş: (a) mobil
  metnin dürüstleşmesi — bir satır, (b) sayacın gerçekten katalog geneli olması — ölçüm istiyor
  (okuma fonksiyonu mu, ayrı geniş okuma mı; `product_counts()` deseni emsal). → operasyon şeridi.
- KDV ürün bazında
- Sınır ötesi KDV: `Customer.vat_number` + VIES doğrulama (açık API); `Order.vat_treatment`; DE B2B reverse charge %0 + "Autoliquidation"; DE B2C Fransız KDV (OSS eşiği aşılınca ele alınır)

## 5. Stok

- Stock entity: fiili + ayrılmış + DLC + konum
- Kullanılabilir stok türetme
- Atomik rezervasyon/düşme (DB fonksiyonu + domain-core)
- FEFO hazırlık sırası
- DLC/DDM tipi + toplam raf ömrü + kalan % türetimi
- `Stock.purchase_price` (maliyet) + `offer_price` (partiye bağlı teklif)
- Near-expiry partiye bağlı indirimli teklif: tek fiyat gösterim + miktar tavanı + batch-pinned rezervasyon
- MLOR (girişte kabul eşiği) uyarısı
- DLC yaklaşma uyarısı (parametrik eşik)
- Depo ekranları (giriş, hazırlık listesi)

## 6. Sipariş

- Order + OrderItem entity (kanal otomatik, **order_source** ekseni, fiyat sabitleme)
- Sipariş durum makinesi (domain-core) + izinli geçişler + birim test
- Sepet ve sipariş oluşturma (müşteri)
- Hızlı satış yolu (kapı önü, tek adım)
- Tek tuşla tekrar sipariş
- Kanal otomatik belirleme
- Durum geçişlerinin loglanması

## 7. Ödeme

- Ödeme durumu ekseni (pending/paid/partial/refunded)
- Online ödeme: Stripe hosted checkout (SCA/3DS, Apple/Google Pay) — `apps/backend` webhook
- Checkout ödeme seçenekleri kuralı (bağlama göre tablo)
- Kapıda ödeme kaydı (nakit/kart/çek)
- Kapıda ödeme sınırı: değer tavanı (Setting) + `Customer.cod_allowed`

## 8. Teslimat ve rota

- `DeliveryZone` entity (admin-editable: posta kodları + haftalık günler)
- Adres + rota içi/dışı belirleme (posta kodu → aktif bölge, türetilir)
- Checkout teslimat günü: tek gün otomatik / çok gün seçmeli → `delivery_date`
- delivery_type: route/shipping
- Dağıtım günü + rota listesi (Faz 1: liste, optimizasyon yok)
- Kurye teslimat ekranı
- Kurye gün kapanışı + kasa mutabakatı
- `wa.me` deep-link "yola çıktık" mesajı
- **Kuryenin telefonunda harita + akıllı rota** *(kullanıcı notu 17.08 — barkod/kutu konuşmasının yan
  kararı)*: üç ayrı iş, birbirine bağlanmasın. **(a) Durak SIRASI — bugünün önceliği:** kurye
  duraklarını doğru sırayla görmeli; sıralama ölçütü (coğrafi yakınlık · teslim penceresi · soğuk
  zincir süresi) o gün konuşulacak, farklı optimizasyonlar gerekebilir. Bugün liste var, sıra
  ölçütü yok. **(b) Harita gösterimi:** rotanın çizilmesi ve yol boyu takibi — mobilde harita
  bağımlılığı HİÇ yok (ölçüldü 17.08: `apps/mobile/package.json`'da harita paketi yok), web'in
  Leaflet kararı (19.20) mobile geçmez, ayrı seçim + STACK beyanı ister. **(c) Akıllı rota:**
  sıra önerisini motorun üretmesi — (a) ve (b) olmadan anlamsız, en son. Kutu/barkod akışı bu üçünün
  hiçbirini beklemez: harita gecikirse teslim garantisi gecikmez.
- **Posta kodu talebi ÜLKESİZ** (ölçüldü 11.08): `postal_code_demand` anahtarı yalnız `postal_code`,
  oysa `delivery_zone_postal_code` anahtarı `(country, postal_code)` — posta kodu sınır ötesi
  benzersiz değil (67000 hem Fransa'da hem Almanya'da var). Yani "şu koda talep geldi" sinyali hangi
  ülkeden geldiğini söylemiyor ve `demand_signals` da söyleyemiyor; asistan bölge önerirken ülkeyi
  ancak patrondan öğreniyor (`propose_zone_extend.country`). Bugün zarar YOK — dört bölgenin hiçbiri
  karışık değil (üçü FR, biri DE) — ama ADR-002 sınır ötesi rotayı meşru sayıyor, yani karışık bölge
  doğduğu gün yanlış ülkeye yazılan kod sessizce kapsam dışı kalır.

## 9. İade/hasar

- İade/hasar bildirimi + durum (returned)
- Para iadesi (Faz 1): online Stripe / nakit kurye — `amount_refunded`'e yansır
- Stoğa geri / imha işareti
- (belki ileride — faza bağlı değil, muallak) Mağaza alacağı (store credit)

## 10. Ön muhasebe

- `Account` (Kasa/banka/Stripe — hepsi hesap) + tek `MoneyMovement` tablosu (hesap + tip)
- `StockIntake` (stok alımı → partiler + maliyet, `Stock.intake_id`)
- Gider tipleri: stok alımı + diğer (kira/akaryakıt/maaş…) — hareket + kategori
- Ürün (sipariş) kârlılığı: doğrudan gider snapshot (COGS/teslimat/komisyon/paketleme) → kanal/ürün bazında
- Şirket kârlılığı: ürün kârı toplamı − genel giderler (ayrı hesap)
- Muhasebe export (Faz 1; hedef biçim muhasebeciyle netleşince) — `is_gift_order` siparişleri export'tan hariç tutar
- `Order.is_gift_order`: patron ikramı — yalnız export'tan hariç; gelir/kâr/kasa/ortaklık normal
- Banka import: AI ile `BankImportProfile` (sütun şablonu) + satırlar `MoneyMovement`'a; sipariş/gider/transfer eşleştirme (öneri + elle onay)
- reference_no üretimi, invoice_no eşleştirme alanı

## 11. Analitik (tek faz, baştan tam)

- `AnalyticsEvent` — cookie'siz sunucu-tarafı olay ölçümü
- Kaynak/huni/sepette bırakma + popüler ürünler
- UTM reklam ROI (sunucu oturumu → sipariş eşleşmesi) — izinsiz
- Ürün-ilgi (view vs buy) → talep sinyali
- AI içgörü (`packages/ai`)
- (gerekince) Meta/Google pixel için dar izin katmanı

## 12. Bildirim

- `packages/notify` soyut katman
- E-posta sürücüsü (`packages/email`, default şablon)
- Temel set bildirimleri: sipariş onayı / yola çıktı / teslim edildi / iptal-iade (sipariş olayına bağlı)
- `wa.me` deep-link yardımcıları ("yoldayım")

## 13. Ayarlar

- Setting tablosu + önbellekli çözücü
- Parametreler: min sepet, kargo eşiği, DLC eşiği, KDV varsayılanı

## 14. WhatsApp / konuşmalı satış kanalı

Kararlar: `ADR_WHATSAPP.md`. Mimari: `CHANNELS.md`. Faz sınırları: `SCOPE.md`.

**Faz 1 / adım 1 — zemin (canlı değil):**
- `order_source` alanı ve enum (web/whatsapp/door/manual)
- Telefon kimliği: E.164 normalize + "telefonla bul-veya-oluştur" (domain-core)
- `Conversation`/`Message` veri modeli (tanımlı, boş)
- `wa.me` click-to-chat girişleri: IG bio, site, QR, broşür
- WhatsApp siparişinin admin tarafından elle işlenmesi (kaynak=whatsapp)

**Faz 1 / adım 2 — canlı (bkz. SCOPE):**
- 360dialog hesabı + WhatsApp Business API bağlama
- `apps/backend` inbound webhook hattı
- `packages/ai`: çok dilli cevap + kart/aksiyon kararı (Claude API)
- domain-core bağlama: stok/fiyat/sipariş ajan üzerinden
- interaktif mesajlar (buton/liste/carousel) + Stripe payment link
- utility template iskeletleri (sipariş onayı, kargo bildirimi)
- Instagram comment-to-DM → WhatsApp'a taşıma

**Faz 2 — ölçek:**
- Double opt-in GDPR-uyumlu newsletter, segmentli proaktif template — **kurgu önerisi yazıldı
  09.08: [`AI_CUSTOMER_AGENT.md`](AI_CUSTOMER_AGENT.md)** (şablon kapıyı çalar → ücretsiz pencerede
  reaktif ajan satışı kapatır; karar turu bekliyor)
- Tam chatbot/SSS otomasyonu, B2B tek-tuş tekrar sipariş kancası

---

## 15. İndirim / kupon

- `Discount` entity (tek varlık: kupon + otomatik kampanya)
- Kupon = sepet düzeyi (kod); otomatik indirim = sepet/kategori/koleksiyon
- Üst üste binmez → en büyük indirim uygulanır (domain-core)
- Paketler ve near-expiry teklif genel indirimden muaf
- `Order.discount_id` + `discount_amount`; koşullar (min sepet, ilk sipariş, tarih, kullanım sınırı)
- **`discount_use` satırı — YAZILIYOR, tek yerden.** *(Bu madde bir dönem "yazan yok, kupon fiilen
  sınırsız" diyordu ve bir şeride iş olarak havale edilmişti; ölçüldü 10.08, yanlıştı.)* Satırı
  sipariş yaratan RPC atıyor: `0030_create_order.sql` içindeki `insert into public.discount_use`.
  Yani kayıt siparişle **aynı işlemde** doğuyor ve kotayı gerçekten bağlıyor; tekillik veritabanı
  indeksinde, uygulamada bir kontrolde değil (`checkout-draft.test.ts` ikinci kaydın `false`
  döndüğünü ve sayacın 1 kaldığını sınıyor).
  **İkinci bir yazım EKLENMEZ** — uygulama katmanından da atılsaydı her sipariş kotayı iki
  sayardı ve hiçbir yerde hata vermezdi. Açık kalan tek karar: sipariş iptal/iade edilince kullanım
  geri düşer mi (öneri: düşmesin — kupon harcanmıştır, aksi suistimale açık).

## 16. Müşteri bağlılığı / etkileşim (Faz 1)

> Design dokümanı hepsini kapsar (Claude Design'da faz yok).

- Ürün yorumu/puanı — yalnız satın alan (`Review`), moderasyon + ürün sayfasında
- Alım-sonrası swipe (+10 gün, WhatsApp/e-posta link) → `FeedbackRequest` + `product_swipe(post_purchase)`
- Oyunlaştırma: `PointsEntry` (aksiyonlar → puan), bakiye türetilir, puan→kişisel kupon (`Discount.customer_id`) — tamamlamaya bağlı; **süresiz, B2C-only**, istismar tavanları
- Sinyal kalite ağırlıklandırma: düşük kaliteli (hep-aynı/hızlı/ayırt-etmeyen) swipe analizde zayıflar; `dwell_ms`+desen; ödül ≠ güven
- Ürün skoru (türetilir): yorum ortalaması + beğen/beğenme oranı
- Admin geri bildirim/puan analizi (yorum + swipe oranı + ürün skoru)
- Aday ürün (`Product.is_candidate`) + keşif/beğeni bölümü (tinder-kart) + `product_swipe` sinyali → admin Talep/İlgi panosu
- Google Business Profile kaydı (kategoriler, foto, wa.me linki) + NAP tutarlılığı — operasyon kalemi, sistem dışı
  - **Platform kodda sabit DEĞİL (29.07):** köprü `review_platform_url` + `review_platform_name` ayarlarına bakar; Trustpilot'a geçiş iki satır güncelleme. Google varsayılan çünkü iş yereldir (rota/bölge) ve mağazasız işletme Google'ın "hizmet bölgesi" kaydına girer — Trustpilot bulunmayı değil, bulunduktan sonra güveni artırır. Gerekçe `DOMAIN §14`.
- **Kimliksiz kaydırmanın istismar freni** — açık, kayıt altında (29.07 denetimi): ziyaretçi kaydırması bilinçli olarak tekilleştirilmiyor (kimlik tutmamak için), ama bunun bedeli var — oran sınırı yok, `dwell_ms` istemciden geliyor, ve ağırlıklandırmada ziyaretçi deseni "nötr" kabul ediliyor. Yani bir betiğin aday panosunu şişirmesinin en verimli yolu tam da kimliksiz yol. Puan tarafı korunuyor (kimliksiz kayıt puan doğurmaz); korunmayan şey **iş kararını besleyen sinyal**. Çare seçenekleri: kimliksiz kaydırmaya IP/oturum başına oran sınırı, `dwell_ms`'e sunucu tarafı üst sınır, ya da ziyaretçi sinyalini panoda ayrı bir sütun olarak bırakıp sıralamadan çıkarmak. Karar veri gelince verilir — bugün ölçecek trafiğimiz yok.
- Sosyal paylaşım: ürün/koleksiyon slug + OG etiketleri + paylaş butonu
- **Komşu daveti — davetin İKİNCİ türü, "getiren müşteri"den AYRI bir kavram** (kullanıcı kararı 11.08, 17.9'un ikinci etabı): sisteminde hesabı OLAN müşterinin, komşusunu **aynı sefere** sipariş vermeye çağırması. Getiren daveti (17.9) hesabı OLMAYAN birini kazanmakla ilgilidir ve ödülü bir kez yazılır; komşu daveti ise bir TESLİMAT verimi kaldıracıdır — aynı adrese/sefere ikinci bir sipariş, kilometre başına düşen maliyeti düşürür. Kendi tablosunu ister: token · doğduğu sipariş · sefer günü · kalan kullanım. Ödül kuralı da ayrı düşünülmeli (davet başına mı, sefer başına mı) ve **bugün ölçecek veri yok** — karar gerçek sefer verisi doğduğunda verilir.
- **Web hesap sayfasında davet bloğu YOK** (açık, 11.08): 17.9 ile bağlantı ve karşılama sayfası çalışıyor, `inviteUrl` sunucudan geliyor — ama web müşterisinin o bağlantıyı GÖRDÜĞÜ bir yer yok; mobil hesap ekranı yalnız kodu paylaşıyor. Tasarım dosyasında (`design/pages/musteri-hesap.md`) davet bölümü tanımlı değil, o yüzden ekran improvise EDİLMEDİ (CLAUDE §3). Tasarım kararı verilince blok mekanik bir ekleme: veri hazır.

---

## Faz 2 (ekstrem/ileri — bkz. SCOPE.md)

Mobil uygulama + push, teslimat penceresi/rota kapasitesi, Meta/Google pixel + CAPI + retargeting, akıllı bölge önerisi, kampanya otomasyonu, WhatsApp broadcast/tam chatbot (§14 ölçek), ileri analitik.

- **AI yönetici asistanı (MCP)** — niyet 30.07; **kurgu ve teknik sınırlar belirlendi 09.08**
  (üç kullanıcı kararıyla: finans = toplanmış marj · istemci = claude.ai/Desktop connector, OAuth
  ilk günden · oturum = 1 saat + kapsam, parametrik): [`AI_ADMIN_ASSISTANT.md`](AI_ADMIN_ASSISTANT.md).
  Kurgu: `apps/backend`'e `/mcp` (Hono, istek-başına stateless sunucu — 2026-07-28 spec'iyle uyumlu),
  ikili anahtar, **onay kuyruğu `assistant_proposal`** (hiçbir yazma doğrudan değil; onay YALNIZ
  operasyon panelinden, MCP yüzeyinden verilemez; uygulama normal servis/motor yolundan), araç
  kataloğu üç fazda (salt-okuma → kuyruklu yazma → medya/dışa dönük), son kullanıcı kimliği ve
  ürün-tekil maliyet/marj asistana kapalı. **Faz 1'in tamamı bitmeden kod yazılmaz** (kullanıcı
  kararı). Referans projede sunucu + iki anahtar + oran sınırı + çağrı izi ÇALIŞIYOR; onay kuyruğu
  ve veri maskeleme bize özgü, sıfırdan yazılacak.
