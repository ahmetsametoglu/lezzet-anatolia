# 03 — `packages/domain-core`: İş Kuralları Motoru

## Kapsam

Sistemin bütün ticari kuralları — **saf fonksiyonlar** olarak (veritabanı bilmez, yüzey bilmez; girdi alır, karar döner). Her satış yüzeyi (web, WhatsApp, kapı önü) aynı motoru çağırır; kural iki yerde yaşamaz. Birim test bu modülde **zorunludur** — kuralların doğruluğu ekran açmadan kanıtlanır.

## Okunacaklar

- `DOMAIN.md` — tamamı (kuralların kaynağı)
- `ORDER_LIFECYCLE.md` (durum makinesi)
- `CHANNELS.md §3` (telefon kimlik çözümü)
- `STACK.md §8` (motor deseni: `{data, error}`, fırlatma yok)

## Bağımlılık

`01-types` bitmiş olmalı. (`02-database`'e ihtiyaç yok — motor DB bilmez; paralel yürüyebilir.)

## Başlarken verilecek izah (örnek)

> "Sistemin beynini yazıyoruz: 'bu sipariş bu duruma geçebilir mi', 'bu müşteriye bu ürünün fiyatı ne', 'bu ödeme durumu ne' gibi soruların tek cevap yeri. Bunlar veritabanına dokunmayan saf hesap fonksiyonları — aynı soruyu web sitesi de WhatsApp robotu da kapı önü ekranı da buraya sorar, hepsi aynı cevabı alır. Her kuralı birim testle kanıtlıyoruz; ekran daha yokken kuralların doğru çalıştığından emin olacağız."

## Görevler

- [x] (03.1) **Durum makinesi:** izinli geçiş tablosu (`ORDER_LIFECYCLE.md` birebir: tam yol + hızlı satış + ek geçişler) + geçiş doğrulama fonksiyonu
  - *Bitti:* her izinli geçiş ve en az 5 yasak geçiş birim testli; `returned → completed` ve iptalde "karşılanan = 0" kuralları dahil
  - **Durum (27.07):** `status-machine.ts` — izinli geçiş tablosu (tam yol + hızlı satış + ek geçişler), `canTransition` hata DEĞERİ döner (fırlatma yok), `allowedTransitions` (UI yalnız izinliyi sunar), `stockEffectOf` (confirmed'de `alreadyReserved` ayrımı — online ödemede stok checkout'ta ayrılmıştır), `producesReferenceNo`. 22 test.
  - **Durum (26.08 — kapı bekçisi eklendi):** `gateFor` + `needsDedicatedGate`. Bir geçişin İZİNLİ olması, düz durum yazımıyla (`transition_order_status`) yapılabileceği anlamına gelmiyordu ve bu ayrım hiçbir yerde yazılı değildi: `→ cancelled`, `→ delivered` ve `draft → completed`in stok yazımı geçişle **aynı transaction'da** olmak zorunda, o iş `cancel_order`/`deliver_order`/`quick_sale` içinde yapılıyor. Ölçüt etkinin varlığı DEĞİL zamanı — `→ confirmed`in ayırması önce (`reserveOrderStock`), `→ returned`in akıbeti sonra (`adjust_fulfillment`) yazılıyor, ikisi de düz kapıdan geçiyor. İlk yazılışı "stok etkisi varsa kapı ister" idi ve ölçünce yanlış çıktı: bugünkü checkout'u kırıyordu. Kural `ORDER_LIFECYCLE`'da; izinli geçişlerin tamamını dolaşan bir test sınıflandırmanın eksik kalmasını engelliyor.
- [x] (03.2) **Kanal ve kaynak:** `company_info` → channel türetimi; order_source ekseninin bağımsızlığı
  - *Bitti:* şirketli müşteri → b2b, bireysel → b2c testleri
  - **Durum (27.07):** `channel.ts` — `deriveChannel` (şirket→b2b), `usesFastSalePath` (yalnız `door`), `canChangeChannel()=false` (kanal siparişe yazılınca donar). Kaynak ekseni kanaldan bağımsız.
- [x] (03.3) **Fiyat çözümü:** özel fiyat → kanal fiyatı sırası; onaysız şirket → B2C; near-expiry teklif çakışması (düşük olan + miktar tavanı); bundle açılımı (atanmış kalem fiyatları, hediye=0, genel indirim muafiyeti) · `touches: packages/domain-core/src/pricing/**, packages/types/src/entities/price.schema.ts, packages/helper/src/money.ts`
  - *Bitti:* çözüm sırasının her basamağı + bundle/teklif istisnaları birim testli
  - **Durum (27.07):** `resolvePrice()` + `priceIn()` + `vatBaseOf()` yazıldı, 15 birim test yeşil — kanal/onay dalları, özel fiyat, teklif çakışmasının dört hali (teklif ucuz · özel ucuz · eşitlik · kanal fiyatı yok), taban çevrimi (TTC↔HT, reverse charge %0). Para katmanı `packages/helper/src/money.ts`: cent dönüşümü, `distributeDiscount` (artan kuruş en büyük kaleme, Σ=indirim garantili), KDV ekle/ayır — 14 test yeşil. `PriceSchema` (kanal tabanlı `amount`) eklendi.
  - **Kapsam değişikliği:** `Customer.discount_percent` bu görevden ÇIKTI — artık fiyat değil indirim sayılıyor (kupon/kampanyayla aynı havuz, istiflenmez), yeri **03.4**.
  - ~~**Kalan:** bundle açılımı — `Bundle`/`BundleItem` şemaları henüz yok (05.5); onlar gelince buraya eklenir.~~ **KAPANDI (08.08) ve engel bir süredir yoktu:** şemalar 05.5 ile geldi, açılım da yazıldı — `checkout-draft.ts:450-465` paket satırını kalemlerine açıyor, `allocated_unit_price`ı `unitPriceCents`e taşıyor, paket adedini kalem adediyle çarpıyor ve sepet indirimini paket kalemine BİNDİRMİYOR (DOMAIN §13 — paketin kendi indirimi zaten birim fiyatın içinde). Mutabakat tarafı ayrı bir motorda (`pricing/bundle-allocation.ts`: `bundleBalance` · `rebalanceAllocations`).
    **Satır neden bugüne kadar açık kaldı:** "kalan" cümlesi bir BAŞKA görevin (05.5) bitmesini bekliyordu; o bitti, açılım yazıldı, ama buraya kimse dönmedi. Aynı bayatlama bu hafta 13.x'te dört satırda birden görüldü — kural artık yazılı: **engeli kaldıran haber verir, satırın sahibi kapatır.**
  - **Durum (28.07 — marj motoru eklendi):** `pricing/margin.ts` (`markupPercent` · `priceForMargin` · `isBelowTargetMargin`) + `pricing/bundle-economics.ts`. Marj tanımı DOMAIN'deki gibi **maliyet üzerine markup** (10 € maliyet, %40 → 14 €), brüt marj değil — aynı sayıya iki ekranın farklı yüzde yazmaması için tanım tek yerde. Paket ekonomisinde KDV kalem kalem indirilir: paketin tek oranı yoktur. Maliyeti bilinmeyen kalem varsa marj null döner (0 saymak marjı şişirirdi). 12 test.
- [x] (03.4) **İndirim motoru:** kupon/otomatik, kapsamlar, **tek-en-büyük** kuralı, koşullar (min sepet, ilk sipariş, tarih, kullanım sınırı), sepet indirimini kalemlere **oransal dağıtma**
  - *Bitti:* iki uygun indirimde büyüğün seçildiği + dağıtım toplamının indirime eşit olduğu testler
  - **Durum (27.07):** `apply-discount.ts` — tek-en-büyük havuzu (kupon · otomatik · **müşteri oranı**), koşullar (kod, tarih, asgari sepet, ilk sipariş, kullanım sınırları, kişisel kupon), kapsam (cart/kategori/koleksiyon), muafiyetler (paket + teklif satırı ne matrahta ne payda), oransal dağıtım. 17 test. **Yakalanan hata:** matrah kapsamla süzülüyordu ama pay TÜM kalemlere dağılıyordu — kategori indirimi başka kategoriye sızıyordu; matrah ve dağıtım artık aynı yüklemi kullanıyor.
- [x] (03.5) **Rezervasyon kararları:** kullanılabilir = fiili − aktif rezervasyon hesabı; TTL/geç-ödeme dallanması (yeniden ayır → olmazsa iade kararı); batch-pinned kural (FEFO önerisinden pinned düşülür)
  - *Bitti:* geç webhook senaryosu (stok var / yok) iki dalıyla test edilmiş
  - **Durum (27.07):** `reservation.ts` — `availableQty` (süresi dolmuş rezervasyon sayılmaz), `availableInBatch` (teklife söz verilen stok normal hazırlığa görünmez), `decideReservation` (kısmi ayırma YOK, TTL hesabı), `decideLatePayment` (proceed → reserve_again → refund dallanması), `suggestFefoPicks` (önce süresi dolan, satılamaz parti hiç önerilmez, eksik miktar bildirilir). 15 test.
- [x] (03.6) **Ödeme türetimi:** karşılanan tutar (`fulfilled_qty × (unit_price − birim indirim payı)` + kargo ücreti kuralı) → `payment_status` (pending/paid/partial/refunded); kısmi karşılamada fark hesabı (peşin → iade; kapıda → düşür)
  - *Bitti:* kısmi + kuponlu + kargolu kombinasyon senaryosu doğru tutarı döndürüyor
  - **Durum (27.07):** `payment-status.ts` — `derivePaymentStatus` iki sayıdan türetir: net tahsilat (tahsil − iade) ile karşılanan tutar. Dört karar (kullanıcı onaylı):
    1. **`partial` para eksenidir** — net, karşılanandan az. "Sipariş eksik karşılandı" ayrı eksendir (`fulfilled_qty`), bu alana karışmaz: 2 sipariş edilip 1 gitmiş ve o 1'in parası ödenmişse durum `paid`'dir.
    2. **Fazla tahsilat yeni durum açmaz** — `paid` kalır, fark `refundDueCents` olarak türetilir (panelde "iade bekliyor"). Enum dört değerde kalır.
    3. **İade `returned`** kalem bazından türer (`fulfilled_qty` düşer → karşılanan iner). **İstisna `goodwill`** (mal müşteride kalır): miktar düşmez ama net 0'a indiği için durum yine `refunded`; muhasebe farkı `amountToCollectCents`'te görünür kalır.
    4. **Kargo ücreti:** Σ `fulfilled_qty` = 0 ise karşılanan tutara girmez → iade edilir. En az bir kalem gittiyse hizmet verilmiştir, iade edilmez.
    - İndirim payı karşılanan orana bölünür (yarısı gittiyse indirimin yarısı düşer) — aksi halde kısmi iade tutarı yanlış çıkar. İptal edilen siparişte karşılanan 0 (ORDER_LIFECYCLE). 14 test.
- [x] (03.7) **Vade freni:** açık bakiye + limit + gecikme → "hesaba" seçeneği açık/kapalı kararı; limit aşımının admin onayına düşmesi
  - *Bitti:* limit içinde otomatik, aşımda `requires_approval` testleri
  - **Durum (27.07):** `checkout-options.ts` içinde — vade varsayılan kapalı, limit içinde otomatik onay, limit aşımı reddetmez **admin onayına düşer**, gecikmede vade kapanır peşin yollar açık kalır.
- [x] (03.8) **Kapıda ödeme kararları:** değer tavanı (engel) + nakit yasal sınırı (uyarı, engel değil) + `cod_allowed`
  - *Bitti:* üç kural ayrı ayrı ve birlikte test edilmiş
  - **Durum (27.07):** aynı dosyada — değer tavanı (engel), `cod_allowed` (müşteri bazlı kapı), nakit yasal sınırı (**uyarı, engel değil**), kargoda kapıda ödeme yok. 11 test (03.7 ile birlikte). **Modelleme düzeltmesi:** `on_account` ödeme yöntemi listesine konmuştu — DATA_MODEL'de o `Order.on_account` bayrağıdır, `payment_method` değil; ayrı alana (`creditAvailable`) çıkarıldı.
- [x] (03.9) **Kimlik çözümü:** telefon (E.164 normalize) + e-posta ile bul-veya-oluştur kararı (saf: eşleşme sonucu döner, DB işini çağıran yapar)
  - *Bitti:* telefon/e-posta eşleşme kombinasyon testleri
  - **Durum (27.07):** `resolve-identity.ts` — telefon (E.164) veya e-posta eşleşmesi → attach/create; iki anahtar farklı müşteriye çıkarsa **sessizce seçim yapılmaz**, `conflict` döner ve admin birleştirir. 7 test.
- [x] (03.10) **KDV işleme:** vat_treatment kararı (FR domestic / DE B2B geçerli vergi no → reverse charge / DE B2C domestic) 
  - *Bitti:* üç dal testli
  - **Durum (27.07):** `vat-treatment.ts` — FR yurt içi · DE B2B + **doğrulanmış** vergi no → reverse charge (%0 + Autoliquidation) · DE B2C → Fransız KDV ama OSS eşiği izlemine sayılır. Doğrulanmamış numara reverse charge açmaz. 5 test.
  - **Durum (26.08 — `isZeroRated` eklendi):** motor kararı sipariş açılırken `order.vat_treatment` kolonuna yazılıyor ve sonradan okuyan her yüzey aynı soruyu KOLONDAN soruyor. O karşılaştırma (`=== 'intra_eu_b2b_reverse_charge'`) depoda **üç yerde elle** yazılıydı (`accounting/export` iki kez, `lib/accounting/profit`) ve **dördüncü okuyan onu hiç sormamıştı**: operasyon sipariş detayı "İçindeki KDV" satırını kendi hesaplıyor, motorun `zeroRated` dalını atlıyordu — reverse charge siparişinde ekranda **1,10 €'luk hayalet vergi** duruyordu (ölçüldü; toplamı bozmuyordu, satır `note`). Kural artık motorda tek yerde; dördü de oradan soruyor. Bir test motorun ANLIK kararıyla kolondan okunan cevabın tüm girdi bileşimlerinde aynı olduğunu sabitliyor. Ekran tarafının iddiası `order-detail-totals.test.ts`te (7 test) — o dosya aynı zamanda sipariş detayı okumasının **ilk** testi.
- [x] (03.11) **Referans numarası:** marka+yıl+rastgele üretici + "ilk kalıcı durumda üret" kuralı
  - *Bitti:* biçim ve benzersizlik (çakışma yeniden deneme) testli
  - **Durum (27.07):** `reference-no.ts` — `LA-26-7K4M2P`; rastgele (sıralı numara hacim sızdırır), karışabilen karakterler (I O S Z 0 1 2 5 8) yok, rastgelelik enjekte edilebilir. Benzersizlik DB'nin işi: çakışmada çağıran yeniden üretir. 5 test.

## Netleşecekler

- ~~**Motor ↔ servis sınırı**~~ — 27.07'de karara bağlandı: `domain-core` ile `database` birbirini bilmez; satırları servis getirir, kararı motor verir, ikisini uygulama katmanı birleştirir. Uygulama iş kuralını kendi hesaplayamaz — motora sorar (STACK §4, §13).
- ~~**TS ↔ SQL sınırı**~~ — 27.07'de karara bağlandı (06.1): RPC yalnız **yarım kalırsa veri bozulan** yazımlara ödenir — eşzamanlılık yarışı ya da bölünemez çok-tablolu yazım. Karar hep TS'te (motorda) kalır; SQL yalnız koşullu yazar. Eşik ve modül 06 RPC listesi `STACK.md §13`'te.

---

**Modül durumu (26.08.2026):** 11/11 tamam. `packages/domain-core` 16 alanda **55 motor + 54 test dosyası** taşıyor (756 birim testi); 03'ün on bir görevi bunun ilk çekirdeğiydi, gerisi 05–23 modülleriyle geldi. Paket depoda **99 yerden** okunuyor (en çok `apps/web`, sonra `packages/application`).

~~Modül durumu (26.07.2026): başlamadı.~~ — 27.07'de yazıldı; altbilgi bir ay boyunca "başlamadı" demeye devam etti ve denetimde (26.08) düzeltildi. Kapanmış görev satırlarının üstünde duran bayat bir özet, satırların kendisinden daha çok okunuyor.

**Ölü ihracat bekçisi (26.08):** `knip` bu paketi **hiç görmüyordu** — `src/index.ts` bir `export *` barrel'ı ve knip barrel'dan yeniden ihraç edilen her şeyi "kullanılıyor" sayıyor. Yani nobody-calls-it sınıfı makineyle hiç yakalanmıyordu. `includeEntryExports` ile açıldı; gürültüyü de ölçtük: çıplak hâli **69 tip bulgusu** üretiyordu ve hepsi kendi dosyasında kullanılan imza tipiydi — yalan söyleyen uyarı okunmaz. `ignoreExportsUsedInFile` ile gürültü sıfıra indi, geriye **dört gerçek bulgu** kaldı ve dördü de ayrı cinsten çıktı:

- `OPERATION_ROLES` · `FAST_SALE_PATH` — hiçbir yerde, kendi dosyasında bile anılmıyordu. Silindi. İlki ayrıca bir tehlikeydi: `isOperationRole` (`role !== 'customer'`) ile aynı kümenin ikinci tanımıydı ve ikisi bir gün ayrışabilirdi.
- `SOURCELESS_POINTS_REASONS` — **kural motorda yazılıydı, uygulama kendi sorusunu soruyordu.** `awardPoints` tekillik indeksini `input.refId`nin varlığına göre seçiyordu ve bugün doğru cevabı TESADÜFEN veriyordu: her çağıran kaynaklı sebepte `refId` geçmeyi hatırlıyordu. Hatırlamayan bir çağıran (ya da yeni bir sebep) kaynaklı bir ödülü gün indeksine sordurur, aynı satırdan ikinci kez yazdırırdı — hata vermeden. Motora bağlandı; sözleşme ihlali artık fırlatıyor.
- `marketingAllowed` — **özelliğinden önce yazılmış bir kapı.** Rıza toplanıyor ama kampanya gönderim aracı (`14.8`) yok. Silinmedi: `BEKLEYEN(14.8)` işaretiyle kayda geçti ve testi yazıldı — bağlandığı gün doğru beklediği bilinsin.

Ölü kod aramaya çıkıp **iki bulgu** ile dönmek bu turun dersi: `knip`in "kullanılmıyor" dediği her şey çöp değildir; bir kısmı yazılmış ama hiç bağlanmamış kuraldır ve silmek, açığı kapatmak değil gizlemektir.

**Denetim notu (26.08):** on bir satırın davranışı kodda tek tek doğrulandı — anılan 21 fonksiyonun 21'i yerinde ve anlatıldığı gibi çalışıyor. Aynı denetimde çıkan iki açık ayrıca kaydedildi:
- `03.3`'ün fiyat sırası satırı **üç basamak** yazıyor; kodda **dört** var — fiyat grubu (B2B alt kademesi) 20.08'de eklenmiş, satıra işlenmemiş. Kodu ve testi tam (`resolve-price.test.ts`, 21 test).
- `03.1`'in `stockEffectOf`'u yazıldığı günden 26.08'e kadar **tek bir dalıyla** tüketiliyordu. `gateFor` ile artık durum geçişi kapısının ölçütü o (`ORDER_LIFECYCLE` "Geçiş İZİNLİ olabilir ama HER KAPIDAN yazılamaz").
