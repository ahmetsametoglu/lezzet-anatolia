# BACKLOG — İş Kalemleri

Bu dosya **ne yapılacağını** tutar (WORKFLOW.md §8 rol ayrımı). Mimari/domain kararları buraya girmez — onlar `STACK.md`, `DOMAIN.md`, `ARCHITECTURE_DECISIONS.md`'de; kapsam sınırları için `SCOPE.md`.

> **İlerleme burada tutulmaz.** Bir işin ne kadar yapıldığı YALNIZ `docs/build/NN-*.md` görev satırındadır (bkz. `docs/build/README.md` kural 5). Buradaki maddeler kapsam kalemidir — işaret taşımazlar. Tek istisna §0: orada işaret "karar verildi mi"yi gösterir, "kodlandı mı"yı değil.

Sıralama kabaca bağımlılık sırasındadır: üstteki alttakine zemin olur.

---

## 0. Bekleyen kararlar (kod öncesi netleşmeli)

Bunlar arkadaşa sorulan sorulara bağlı (bkz. WhatsApp soru listesi). Cevaplar gelmeden ilgili kalem başlamaz.

- [ ] Marka adı yazımı: "Anatolia" mı "Anatolie" mi → `packages/brand`
- [ ] Ana logo seçimi + renk paleti → `packages/brand`, Tailwind token
- [x] Gramaj varyantı: **varyant katmanı var** (satılabilir birim = varyant; varyantsız ürün tek varsayılan varyant)
- [x] Satış birimi: **hepsi sabit paket** (adet). Alış toptan olabilir ama girişte pakete çevrilir (ör. 1kg → 10×100gr)
- [ ] Fiyat listesi (B2B/B2C) → seed verisi
- [~] Kategori yapısı: **düz (tek seviye) + koleksiyon** kararı verildi; nihai kategori/koleksiyon **içeriği** (isimler) bekliyor
- [x] Alerjen/içindekiler: `Product.allergens` (AB 14) + `ingredients` (çok dilli) — **model kararı** verildi (kodda `allergens` var, `ingredients` §3'te açık)
- [ ] Ürün bazında KDV oranları
- [ ] Raf ömrü bilgisi (DLC uyarı eşiği için)

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
- **Yasal beyan alanları (tek migration turu):** `ingredients` · `nutrition` (sabit kalemli, 100 g) · `traces` (çapraz bulaşma) · `storage_instructions` — dördü de müşteri ürün detayının zorunlu bölümleri; operasyon formunda giriş yeri yok, bu yüzden bugün girilemiyor
- `ProductVariant.label` → LocalizedText (müşteriye görünen boy etiketi; bugün tek dil)
- Görsel yükleme (`packages/storage`, image_key deseni)
- **Görsel okuma URL'i public'e iner:** bugün her render'da 30 dk'lık imzalı (signed) URL üretiliyor; katalog görselleri gizli olmadığı için imzanın koruma değeri yok, bedeli var — tarayıcı/CDN cache'i ölü, paylaşım (OG) kartı imza dolunca görselsiz kalıyor, vitrin statik cache'lenemiyor. R2 public okuma + `R2_PUBLIC_BASE_URL` + `?v=<updated_at>` sürüm damgası. Başlangıç: r2.dev geliştirme adresi (alan adı yok); özel alan (`cdn.<domain>`) sonra, yalnız env değeri değişir. → `build/05-katalog.md (05.11)`
- `ProductImage` (galeri): ek görseller + sıralama; kapak üründe kalır
- **Operasyon ürün formu tasarımının güncellenmesi (claude_design):** bugünkü "Yasal beyan" bölümü yalnız alerjen çipleri — içindekiler/besin/saklama/çapraz bulaşma alanları ve galeri yönetimi tasarımda yok; kodlamadan önce tasarım müşteri ürün detayıyla hizalanmalı
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
- Double opt-in GDPR-uyumlu newsletter, segmentli proaktif template
- Tam chatbot/SSS otomasyonu, B2B tek-tuş tekrar sipariş kancası

---

## 15. İndirim / kupon

- `Discount` entity (tek varlık: kupon + otomatik kampanya)
- Kupon = sepet düzeyi (kod); otomatik indirim = sepet/kategori/koleksiyon
- Üst üste binmez → en büyük indirim uygulanır (domain-core)
- Paketler ve near-expiry teklif genel indirimden muaf
- `Order.discount_id` + `discount_amount`; koşullar (min sepet, ilk sipariş, tarih, kullanım sınırı)
- **`discount_use` satırının YAZILMASI — sipariş kapanışında.** Tablo, okuması (`usageCounts`) ve
  motorun sınır denetimi (`used_up`) hazır; **yazan yok**, yani sayaç kalıcı olarak sıfır ve
  "toplam N kullanım" ile "müşteri başına N" koşulları **hiç bağlamıyor** — kupon fiilen sınırsız.
  Fiyat ekranı bunu doğru gösteriyor (rozet "bugün yürürlükte mi"yi söyler), eksik olan kayıt.
  → **MÜŞTERİ/UI ŞERİDİNDEKİ AJANIN İŞİ** (sepet + checkout): `apps/web/lib/cart/discount.ts`
  kuralı çözüyor, `lib/order/checkout-draft.ts` `order.discount_id` ve `discount_amount`'ı
  yazıyor; `discount_use` satırı da aynı noktada, aynı turda atılmalı. Sipariş iptal/iade
  edilirse kullanımın geri düşüp düşmeyeceği o işin ilk kararıdır (öneri: düşmesin — kupon
  harcanmıştır; aksi hâli suistimale açık).

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
- Sosyal paylaşım: ürün/koleksiyon slug + OG etiketleri + paylaş butonu

---

## Faz 2 (ekstrem/ileri — bkz. SCOPE.md)

Mobil uygulama + push, teslimat penceresi/rota kapasitesi, Meta/Google pixel + CAPI + retargeting, akıllı bölge önerisi, kampanya otomasyonu, WhatsApp broadcast/tam chatbot (§14 ölçek), ileri analitik.
