# Mobil — Müşteri v3 · Tasarım Envanteri (07.08.2026)

> **Statü: ENVANTER/ANALİZ** — implementasyon zemini; karar listesi §8 (kullanıcıyla
> konuşulacak). Kaynak: `design/project/Mobil - Musteri v3.dc.html` (1993 satır, 21 ekran +
> 6 katman-üstü kabuk). Çıkarım Opus-5 analiz ajanı; sayısal iddialar yönetici örneklemiyle
> doğrulandı (ink ikizi 82/202 · panel tonları 28/15 · radius-16 ×46 · 17px ×19 · sekme
> listesi · 4-hane OTP). Karşılaştırma zemini: `packages/design-tokens/src/customer.ts` +
> `apps/mobile/src/theme/unistyles.ts`. Yan belge: `design/project/Mobil - Backend Notlari.md`.
> Cihaz kabuğu (390×844 çerçeve, durum çubuğu, home-indicator) canvas chrome'dur; UI değildir.

## 1. Ekran envanteri

| # | Ekran | Yol | Amaç | Ana bölümler |
|---|---|---|---|---|
| 1 | Vitrin | tab `home` | Kişiselleşmiş giriş vitrini | selamlama (puan çipi, bölge pill'i, TOPTAN çipi, zil+sayaç), canlı sipariş şeridi, tekrar-sipariş, günün fırsatı (geri sayım), fırsat rayı, koleksiyon bantları, vitrin rayı, tarif rayı, paket kartları, Keşif + B2B davetleri |
| 2 | Katalog | tab `catalog` | Arama+kategori+sıralama | yapışkan arama başlığı + kategori çip rayı, 2 sütun yuvarlak ürün ızgarası, sonuç-yok |
| 3 | Ürün Detay | `product` | Tek ürün | 400px kahraman foto (rozetler, taşan fiyat çipi), künye (★), birim fiyat, limit/kargo notu, **aile rayı**, çeşit çipleri, 3 akordeon, değerlendirmeler, benzerler, yapışkan alt bar |
| 4 | Paket Detay | `package` | Hazır paket | foto, fiyat, "Pakette neler var", yapışkan alt bar |
| 5 | Keşif | `kesif` | Aday ürün oylama | kart destesi ✕/♥, ilerleme, tur-bitti kutlaması (+puan) |
| 6 | Sepet | `cart` | Kalem yönetimi | boş durum, paket satırları (koyu kart), ürün satırları, kupon, toplam paneli, asgari uyarısı, yapışkan checkout barı |
| 7 | Checkout | `checkout` | Adres·teslimat·ödeme·özet | oturum/misafir kutusu, adres seçimi, kargo-dışı uyarı, mod+gün çipleri, ödeme yolu, özet, pazarlama onayı, engel mesajı |
| 8 | Ödeme | `payment` | Ödeme sayfası (demo) | Apple Pay, kart alanları, busy/ok durumları — §8.9: PaymentSheet devralacak |
| 9 | Sipariş Onayı | `confirm` | Teyit | ✓ pop, sipariş no, özet, puan çipi, 2 CTA |
| 10 | Siparişler | tab `orders` | Liste | misafir bloğu, sipariş kartları (rozet, küçük resim yığını, tekrar-sipariş) |
| 11 | Sipariş Detay | `order` | İzleme | canlı harita (yalnız "Yolda"), 4 adım zaman çizelgesi, içerik, paneller, değerlendir |
| 12 | Hızlı Doğrulama | `login` | OTP girişi | Google / WhatsApp / E-posta+kod (tasarımda 4 hane — §8.17), busy |
| 13 | Hesap | tab `hesap` | Profil+puan+tercih | profil, B2B şirket kartı, puan (+kupona çevir), referans, menü, adresler, dil, kampanya anahtarları, çıkış |
| 14-16 | Talepler / Detay / Yeni | stack | Destek | liste + yazışma balonları + 3 adımlı oluşturma (fotoğraflı) |
| 17 | Geri Bildirim | `fb` | Ürün ürün beğeni | foto + Beğendim/Beğenmedim → yorum → kutlama (+puan) |
| 18 | Professionnels | `pro` | B2B başvuru | FR (SIRET arama) / DE (VAT), iletişim, gönderildi durumu |
| 19 | Bilgi Sayfası | `static` | Yasal metinler | tek şablon |
| 20 | Bildirimler | `notif` | Bildirim merkezi | misafir bloğu, satırlar (okunmadı noktası) |
| 21 | Tarif | `recipe` | Tarif → sepet | malzemeler BİZDEN (+ekle) / EVİNİZDEN, hazırlanış, "hepsini ekle" barı |

**Katman-üstü:** Splash (1,4→1,95 sn) · Onboarding (4 adım: dil → posta kodu → soğuk zincir →
ödeme; Atla) · BottomSheet (7 içerik: `var·filter·addr·coupon·zip·share·pf`) · Toast · Alt sekme
(4: home/catalog/orders/hesap) · Sepet FAB · yapışkan aksiyon barları.

## 2. Tekrar kullanılabilir komponent adayları (implementasyonun kalbi)

| Aday | Geçtiği ekranlar | Varyant eksenleri |
|---|---|---|
| **AppBar** | 11 ekran | sağ yuva (yok/paylaş/rozet/ilerleme/+Yeni); başlık tek ⟷ çift satır; blur'lu yapışkan |
| **BackButton** | 11×bar + foto-üstü + sepet | zeminsiz 40px ⟷ foto üstü 42px krem |
| **PrimaryButton** | ≈22 kullanım | blok (h52-54, r16, ofset gölge) ⟷ hap; etkin/engelli; basılı davranışı §8.5 |
| **SecondaryButton** | 5+ | kum ⟷ zeytin çerçeve |
| **TextAction** | ≈10 | zeytin (olumlu) / terracotta (çıkış-uyarı) |
| **StatusBadge** | 10,11,14,15 | 9 durum; renk haritası TEK yerde; `rotate(2deg)` |
| **Tag** (eğik rozet) | ≈18 | ton 4'lü; dönüş −7°…+6°; fiyat çipi/Tükendi/İndirim/TOPTAN/sayaç hep bu |
| **ProductCircleCard** | 1,2,3 | boyut 146/138/96; rozet katmanları; tükendi `opacity .45` |
| **PhotoOverlayCard** | 1 | paket 172px ⟷ tarif 220×280; gradient+çip |
| **HeroPhotoHeader** | 3,17,21 | yükseklik 400/380/300; taşan çip; üst aksiyonlar |
| **QuantityStepper** | 3,4,6,sheet | 3 zemin × 3 boyut |
| **OptionCard** | **8 ayrı liste** (3,7,16,sheet'ler) | seçili çifti sabit: `#efdfc2`+ink çerçeve ⟷ şeffaf+kum; içerik 3 düzen — **en sistematik yineleme** |
| **Chip** | 2,3,7,13,16,onboarding | r18 ⟷ r14; seçili zeytin ⟷ krem |
| **Row** (liste satırı) | 4,11,13,14,20,21 | ayraç kesikli ⟷ kart; öndeki avatar/ikon; arkadaki `›`/fiyat/eylem |
| **AvatarThumb** | 7 ekran | boyut 34–56; foto ⟷ baş harf; **yığın varyantı** (üst üste −10px) |
| **SummaryPanel** | 6,7,9,11 | satır sayısı; toplam çipi ink ⟷ terracotta |
| **Note** (bilgi kutusu) | ≈10 | ton: olive/terracotta/hata/sıcak |
| **DashedInvite** | 1,7,13,16 | çerçeve terracotta ⟷ kum |
| **EmptyState** | 6 ekran | ikon; CTA; **misafir varyantı** (= +"Hızlı doğrulama") |
| **SuccessState** | 5 ekran | daire 64-92px; puan kartı eki; `pop` animasyonu ortak |
| **LoadingState** | 8,12 | halka 40/44 |
| **Toggle** | 13,sheet | tek boyut |
| **SectionHeader** | ≈16 | üstbaşlık ⟷ +Lora başlık ⟷ +sağ bağlantı; `700 10px/.18em/terracotta` |
| **TextField** | ≈18 | hap ⟷ yumuşak; metin/sayı/çok satır/**kod girişi**; sonda düğme |
| **BottomSheet** | 5 tetikleyen ekran | 7 içerik; scrim+tutamak+82% ortak |
| **StickyActionBar** | 3,4,6,21 (+15 opak) | içerik yuvası |
| **BottomTabBar · CartFab · Toast · Accordion** | kabuk/3/küresel/3 | — |
| Tek kullanım (komponentleştirme YOK) | Timeline (11) · MessageBubble (15) · SwipeDeck (5) | — |

## 3. Token denetimi — AÇIKLAR (ekran işi öncesi kapanmalı)

**Fontlar:** yalnız Lora (88) + Karla (425) ✓ (paket bilinçli dışında; RN font yükleyicisiyle).

### 3a. design-tokens'ta OLMAYAN renkler (öne çıkanlar)

| Hex | Adet | Tanı |
|---|---|---|
| `#3a4147` | 82 | **TEK MÜREKKEP ihlali** — envanter bu tonu `ink #343b41`'e katmıştı (202 kullanımla yan yana). En büyük kalem. |
| `#efdfc2` | 28 | Baskın "sıcak panel" zemini (özet paneli, seçili OptionCard, puan kartı) — envanterde YOK. |
| `#ece3c8` | 15 | Kart zemini — `sand-200 #ece5d2`'ye yakın ama eşit değil. |
| `#e2d8bd` | 10 | Avatar/stepper zemini — `sand-300 #e0d8c2`'ye 2 birim; muhtemel sapma. |
| `#cddbb0` / `#9a917c` / `#b9b29e` / `#a44a3f` / `#f4e3e0` | 8/8/3/3/2 | olive-line ikizi · muted koyusu · disabled-fill çelişkisi · hata metni/zemini çelişkisi |
| `#d9a441` | 1 | yıldız — token `star #d99a2b` ile çelişiyor |
| `#e3ecd2` vs `#eef2e2` | 1/1 | AYNI "varsayılan" rozeti iki ekranda iki zemin — tasarım hatası |
| Marka renkleri (WhatsApp/Apple/Google/Stripe/Visa/MC) | 1-3 | meşru istisna — ayrı `brand` ailesi olarak kayda girmeli |
| + 8 tekil ton (harita, fırsat, on-terracotta…) | 1-2 | envanter kararı gerekiyor |

**Alfalı katman hiç yok:** foto gradyanları `rgba(21,23,15,…)` (20+), yapışkan bar `rgba(243,239,226,…)`,
scrim, kart gölgesi — müşteri evreninde scrim/gölge/overlay token'ı tanımsız (operasyonda var).

### 3b. Yazı ölçeği açıkları
`17px/600` ×19 (tüm app-bar başlıkları — token'da yok) · `10px/700` ×24 (üstbaşlık; token 11) ·
`12px` ×35+ · `19px/600` ×11 · `14.5px/700` ×12 (birincil düğme etiketi — kontrol kademesi) ·
`10.5` ×14 · `21` ×4 · dekoratif tekiller (23–210px). Harf aralığı baskın değeri `.18em` —
token'da yalnız `.12/.1em`.

### 3c. Yarıçap açıkları
Tasarım 9 kademe kullanıyor, token 3 taşıyor. **`16px` ×46 en sık ve token'da YOK**; ayrıca
12 ×16 · 22 ×14 · 24 ×11 · 10/11 ×21 · 20 ×9.

### 3d. KALAN açıklar — Claude Design'ın envanter kararı bekliyor (canlı liste)

> §3a–3c yukarıda ham ölçümdür ve büyük kısmı `customer-app.ts`'in doğuşunu besledi (sand-150/250,
> error çifti, scrim ailesi… — kapananlar orada). AŞAĞISI kapanmayanların canlı listesidir; bir
> satır çözülünce buradan silinir, kalıcı gerekçesi karar dosyalarına gider. *(07.08'de
> `design/BACKLOG` yalnız web envanterine daraltılınca eski §6 buraya devredildi — içerik birebir.)*

Komponent kiti kodlanırken tasarımda kullanılan ama envanterde karşılığı olmayan değerler.
Kural gereği KODLANMADI (ham değer yasak) — en yakın token'la kuruldu ya da yapılmadı; Claude
Design'ın envanter kararı bekliyor. Kaynak: `Mobil - Musteri v3.dc.html` + kit raporu.

| Ne | Tasarımdaki değer | Bugünkü durum |
| --- | --- | --- |
| Yapışkan çubuk örtüsü + foto-üstü geri düğmesi | `rgba(243,239,226,.9–.97)` (+ `blur(8px)`) | opak `sand-50` kullanıldı; alfalı krem token'ı + blur kararı (expo-blur) bekliyor |
| Rozet/fiyat çipi gölgesi | `0 3px 8px rgba(21,23,15,.22)` (ve .18/.28 türevleri) | `shadow.soft` kullanıldı — tasarımdan gözle hafif; ayrı `badge` gölge token'ı önerilir |
| Rozet yazı kademesi | 12,5px/700 | `field-label`(12,5) + `button`(700) karışımı; ayrı `badge` kademesi önerilir |
| Çip / metin-eylem yazısı | 12,5/700 | `control` (13,5/700) — kontrol kademesinde yuvarlama yok kuralı gereği var olan durak |
| Vitrin bölüm başlığı | 21px Lora 600 | `h2-sm` (20) kullanıldı |
| Zeytin dolgu üstü metin | beyaz | `card` (#ffffff, aynı değer) — `on-olive` takma adı önerilir |
| "TAKİP" çipi ikilisi | `#a9c46b` zemin + `#15170f` metin | ön plan token'ı yok — bu Tag tonu YAPILMADI |
| Boşluk/ölçü ailesi | 4-24 dp aralığı | paket taşımıyor → `apps/mobile/src/theme/metrics.ts` (tek yer, kaynak yorumlu) — design-tokens'a terfi adayı |
| Font varlıkları | Lora + Karla | tema seam'i hazır (`font.display/body`); `expo-font` + dosya yükleme ayrı iş, o güne dek sistem fontu |
| Katalog İSKELETİ bayat | yer tutucu 138'lik daire (v3 satır 202-205) | kart kararı KARE ve kit düzeltildi (iz: `docs/build/21` 21.5 Durum); **tasarım işi: iskelet kare karta dönmeli** |

**Kare katalog kartından gelen ek açıklar (21.5 düzeltmesi, 07.08)** — kart en-yakın token'la
kuruldu, sapmalar kayıtlı (kaynak: `product-photo-card.tsx` yorumları):

| Ne | Şablon | Bağlanan | Fark |
| --- | --- | --- | --- |
| Alt gradyan durağı | `0 42% → .8` | `gradient.photo-bottom` (40% → .82) | durak −2, alfa +.02 |
| Çeşit alt-satırı kademesi | 10,5px | `micro` (11,5) | ~10,5'lik alt-satır durağı yok |
| Foto-üstü altyazı rengi | `#d5d0c2` | `sand-400` (#d8cfb6) | rol token'ı `on-image-soft` ama değeri sapıyor — SICAK bir on-image-soft gerekiyor |
| Tükendi örtüsü | `rgba(21,23,15,.72)` | `scrim-heavy` (.82) | alfa +.10 |
| Rozet harf aralığı | `.06em` | `eyebrow-sm` (.1em) | rozet kademesi ayrışmalı (üstteki satırla birlikte) |
| Rozet yarıçapı | 9 | `badge` (12) | resmî sette 9 yok |
| Basılı ölçek | `.96` | `press.scale` (.97) | tek kademe tutuldu |
| Foto-üstü ad: rol ↔ değer ayrışması | `#faf6ec` | değeri birebir `cream`; ROL token'ı `on-image` ise `#f5f1e6` | ya tasarım `on-image`e çekilir ya `on-image-bright` açılır |

**Katalog ekranından (21.7) gelen ek açıklar:**

| Ne | Şablon | Bağlanan | Fark |
| --- | --- | --- | --- |
| Sekme çubuğu etiketi | 10,5/700 | `micro` (11,5) + `eyebrow` ağırlığı (700) | ~10,5 durak yok (çeşit alt-satırıyla aynı boşluk) |
| Sekme çubuğu zemini | `rgba(243,239,226,.96)` + `blur(8px)` | opak `sand-50` | AppBar'la aynı alfalı-krem açığı |
| Izgara satır arası | 20 dp | 22 (yukarı yuvarlama) | ölçekte 20 yok |
| Hata kutusu çerçevesi | 2 px | `border.base` (1,5) | kalın vurgu durağı yok |

> **2. TUR CEVAPLARI GELDİ (07.08, `Mobil - Token Kararlari.md` 14–24):** foto-üstü ad →
> `on-image` (tasarım çekildi) · `on-image-soft` resmî değeri `#d5d0c2` · badge ailesi (yazı+gölge;
> yarıçap 12'de) · `cream-glass` .90/.96 + blur kalır · `scrim-72` · `accent-leaf`+`ink-deep` ·
> küçük duraklar token'a çekildi (kit zaten doğru) · iskelet karesi tasarımda düzeltildi ·
> `brand-whatsapp-pure` onaylı · font: Lora 400/600 + Karla 400/600/700. **Uygulama dilimi
> sırada** — uygulanan her satır bu tablodan silinecek.

## 4. Navigasyon modeli

4 sekme (home/catalog/orders/hesap; etkin `#b05c2e`) · **Sepet sekme DEĞİL** — FAB + yapışkan
bar (IC'de `cart` ikonu tanımlı ama sekmede yok → §8.6) · tek yığın, `goTab()` yığını sıfırlar,
yığındayken sekme çubuğu gizli · kenar kaydırmayla geri (32px kenar, Δx>70) · sipariş onayı ve
tekrar-sipariş yığını DEĞİŞTİRİR (geri dönülemez) · `login` tek ekran, **7 çağıran**, başarıda
yığından filtrelenir (çağırana dönülür) · üç sağlayıcı: Google · WhatsApp · E-posta OTP ·
onboarding 4 adım (dil → posta kodu [67 kontrolü] → soğuk zincir → ödeme), `onbZip` kalıcı.

## 5. Durumlar — çizili / eksik

- **Çizili:** boş (7 yerde, misafir varyantlarıyla) · yükleniyor (yalnız ödeme+giriş) · stok-yok
  (5 yüzeyde tutarlı) · checkout engel/kupon/pro hataları.
- **EKSİK:** ağ hatası/tekrar dene HİÇBİR ekranda yok · ödeme başarısız durumu yok · ilk yükleme
  skeleton'ları yok · sonsuz kaydırma göstergesi yok · sepetteyken stok tükenmesi yok ·
  oturumlu-boş siparişler markup'ta yok · çevrimdışı yok. → implementasyonda tasarım kararı
  gerekecek (Claude Design'a dönüş listesi).

## 6. Veri/API imaları (bugün yalnız `/me` + `auth/otp` var)

Vitrin bileşik ucu (`GET /home` — 7 ayrı istek yerine; seçkiler sabit sınırlı) · katalog
`GET /products` **keyset+cursor** (tasarımda çizili değil ama CLAUDE §1 şart) + `GET /categories`
· ürün/paket/tarif detayları · stok haberi uçları · keşif oy uçları · sepet CRUD + kupon ·
`GET /checkout/quote` (kural yoğun: 67 bölgesi, 25€ asgari, 60€ kargo eşiği, kapıda ≤150€ —
**domain-core işi**) · adres CRUD (posta kodu→depo) · sipariş oluştur/listele/detay/tekrar ·
Stripe intent+webhook · puan/kupon/referans · talep uçları + foto · feedback · pro başvuru
(SIRET/VAT doğrulama) · bildirimler + push token kaydı · statik sayfalar. Ayrıntı tablosu
analiz çıktısında; uçlar dilim dilim açılacak.

## 7. Web tasarımıyla ilişki

Ekran kümesi ve iş kuralları web müşteri yüzeyiyle birebir aynı motordan; görsel dil aynı
(Lora/Karla, krem-zeytin-terracotta, eğik çipler, ofset gölge). **Mobile özgü yeniler:** bildirim
merkezi + stok haberi, puan→kupon çevirme, referans programı, fırsat geri sayımı, splash +
onboarding, Apple Pay, WhatsApp girişi (Google web'de zaten var), FAB. Prototip metinleri
Türkçe = yer tutucu; tüm metin `messages.json`'a çıkacak (fr/de/tr).

## 8. Karar isteyen noktalar (kullanıcı + yönetici; çoğu Claude Design'a dönüş)

1. `#3a4147` ikizi: `ink-soft` mü açılır, tasarım `ink`e mi çekilir? (82 kullanım)
2. `#efdfc2` (28) + `#ece3c8` (15): envantere yeni kademeler mi, mevcuda mı çekilir?
3. `radius.button 16` + chip/pill kademeleri envantere girmeli (46× kullanım).
4. `17px` ekran başlığı: `screen-title` kademesi mi, 18'e mi yuvarlanır?
5. Basılı geri bildirim iki türlü (scale .97 ⟷ translate 2px): TEK kural seçilmeli.
6. Alt sekme rozeti ölü (cart sekmede yok): sekme mi eklenir, rozet mantığı mı gider?
7. Katalog/Siparişler/Bildirimler/Talepler'de sayfalama çizilmemiş — keyset+sonsuz kaydırma
   deseni tasarıma eklenmeli (CLAUDE §1).
8. Canlı harita: sağlayıcı (MapLibre?) + kurye konum ucu kararı — bugün ikisi de yok.
9. Ödeme ekranı birebir uygulanamaz: PCI gereği **Stripe PaymentSheet** devralır; tasarımın
   kart-alanlı sayfası yerine yerel sheet.
10. `image-slot` prototip aracı: RN'de AvatarThumb fallback'i (baş harf) üstlenir.
11. "Varsayılan" rozeti iki zemin (`#e3ecd2` vs `#eef2e2`) — tasarım hatası, teke inmeli.
12. Marka renkleri ayrı `brand` ailesi olarak envantere.
13. Ölü görünüm-modeli alanları (v2 kalıntısı: `cartBar·ptsBar·band1-3·notifBadge·searchGo…`)
    PORT EDİLMEZ (knip kırmızısı olur).
14. Vitrin'de arama kutusu v3'te kaldırılmış (tek giriş Katalog) — kasıtlı mı?
15. `onbZip` kimliksiz: misafir posta kodunun sunucu doğrulaması + depo eşlemesi kararı.
16. Onboarding görseli (`su-boregi.jpeg`) — pakete gömülecek varlık listesi çıkarılmalı.
17. **OTP hane uyumsuzluğu: tasarım 4 hane, backend 6 hane üretiyor** (yönetici teyitli) —
    ya tasarım 6'ya döner ya şema/RPC değişir (arka-uc işi olur; önerim: tasarım 6'ya dönsün,
    backend kanıtlanmış ve weble ortak).
18. ~~Google + WhatsApp giriş sağlayıcıları YENİ kapsam (web'de yalnız e-posta OTP)~~
    **DÜZELTME (07.08):** Google girişi web'de ZATEN VAR (`auth/callback` OAuth dönüşü) —
    yalnız WhatsApp yenidir.

**Cevaplar / itirazlar (kullanıcı kararları 07.08):**

- **Giriş sağlayıcıları:** Google **v1** (web'de zaten var; mobil karşılığı yapılır) ·
  WhatsApp **v2**.
- **Vitrinde arama yok:** KASITLI — aramaya tek giriş Katalog sekmesi; öyle uygulanır
  (§8.14 kapandı).
- **Canlı kurye haritası:** tasarımda VAR (ekran 11 Sipariş Detay, yalnız "Yolda" durumunda,
  `mapOn` — yönetici teyitli) → **v2'ye**. v1'de o bölüm yerine 4 adımlı zaman çizelgesi
  (zaten çizili) (§8.8 fazlandı).
- **Puan / kupona çevirme:** **v1** — ve web ile mobil AYNI çekirdek kodu kullanır (tüzük
  02-mimari §3: puan/kupon mantığı domain-core/application'da tek kaynak; modül 17 ile
  koordinasyon).
- **Keşif:** **v1**. **Bildirim merkezi:** **v2** (push altyapısıyla birlikte).
- **Tek kapı + rol yönlendirmesi** (kullanıcının gündem konusu buydu): 02-mimari §4'te
  kayıtlı — giriş tek yerden; `/me.roles`'ta operasyon hakkı varsa operasyon kabuğu, yoksa
  müşteri; oturumsuz = müşteri gezinmesi.
- Dilim (ekran kodlama) sırası: yönetici işidir, kullanıcıya sorulmaz — bilgilendirilir.
