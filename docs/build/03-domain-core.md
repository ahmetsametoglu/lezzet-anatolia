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
- [x] (03.2) **Kanal ve kaynak:** `company_info` → channel türetimi; order_source ekseninin bağımsızlığı
  - *Bitti:* şirketli müşteri → b2b, bireysel → b2c testleri
  - **Durum (27.07):** `channel.ts` — `deriveChannel` (şirket→b2b), `usesFastSalePath` (yalnız `door`), `canChangeChannel()=false` (kanal siparişe yazılınca donar). Kaynak ekseni kanaldan bağımsız.
- [~] (03.3) **Fiyat çözümü:** özel fiyat → kanal fiyatı sırası; onaysız şirket → B2C; near-expiry teklif çakışması (düşük olan + miktar tavanı); bundle açılımı (atanmış kalem fiyatları, hediye=0, genel indirim muafiyeti) · `touches: packages/domain-core/src/pricing/**, packages/types/src/schemas/price.schema.ts, packages/helper/src/money.ts`
  - *Bitti:* çözüm sırasının her basamağı + bundle/teklif istisnaları birim testli
  - **Durum (27.07):** `resolvePrice()` + `priceIn()` + `vatBaseOf()` yazıldı, 15 birim test yeşil — kanal/onay dalları, özel fiyat, teklif çakışmasının dört hali (teklif ucuz · özel ucuz · eşitlik · kanal fiyatı yok), taban çevrimi (TTC↔HT, reverse charge %0). Para katmanı `packages/helper/money.ts`: cent dönüşümü, `distributeDiscount` (artan kuruş en büyük kaleme, Σ=indirim garantili), KDV ekle/ayır — 14 test yeşil. `PriceSchema` (kanal tabanlı `amount`) eklendi.
  - **Kapsam değişikliği:** `Customer.discount_percent` bu görevden ÇIKTI — artık fiyat değil indirim sayılıyor (kupon/kampanyayla aynı havuz, istiflenmez), yeri **03.4**.
  - **Kalan:** bundle açılımı — `Bundle`/`BundleItem` şemaları henüz yok (05.5); onlar gelince buraya eklenir. Kapsamı 27.07'de daraldı: **paket yalnız B2C ve TTC** (DOMAIN §13), yani açılım kanal/taban çözmez — yalnız `allocated_unit_price`'ları `OrderItem`'lara aktarır, hediye kalemi 0 fiyatla girer ve genel indirim binmez. Motorun kontrol edeceği tek şey: etkin kanal `b2c` değilse paket satılamaz.
- [x] (03.4) **İndirim motoru:** kupon/otomatik, kapsamlar, **tek-en-büyük** kuralı, koşullar (min sepet, ilk sipariş, tarih, kullanım sınırı), sepet indirimini kalemlere **oransal dağıtma**
  - *Bitti:* iki uygun indirimde büyüğün seçildiği + dağıtım toplamının indirime eşit olduğu testler
  - **Durum (27.07):** `apply-discount.ts` — tek-en-büyük havuzu (kupon · otomatik · **müşteri oranı**), koşullar (kod, tarih, asgari sepet, ilk sipariş, kullanım sınırları, kişisel kupon), kapsam (cart/kategori/koleksiyon), muafiyetler (paket + teklif satırı ne matrahta ne payda), oransal dağıtım. 17 test. **Yakalanan hata:** matrah kapsamla süzülüyordu ama pay TÜM kalemlere dağılıyordu — kategori indirimi başka kategoriye sızıyordu; matrah ve dağıtım artık aynı yüklemi kullanıyor.
- [x] (03.5) **Rezervasyon kararları:** kullanılabilir = fiili − aktif rezervasyon hesabı; TTL/geç-ödeme dallanması (yeniden ayır → olmazsa iade kararı); batch-pinned kural (FEFO önerisinden pinned düşülür)
  - *Bitti:* geç webhook senaryosu (stok var / yok) iki dalıyla test edilmiş
  - **Durum (27.07):** `reservation.ts` — `availableQty` (süresi dolmuş rezervasyon sayılmaz), `availableInBatch` (teklife söz verilen stok normal hazırlığa görünmez), `decideReservation` (kısmi ayırma YOK, TTL hesabı), `decideLatePayment` (proceed → reserve_again → refund dallanması), `suggestFefoPicks` (önce süresi dolan, satılamaz parti hiç önerilmez, eksik miktar bildirilir). 15 test.
- [ ] (03.6) **Ödeme türetimi:** karşılanan tutar (`fulfilled_qty × (unit_price − birim indirim payı)` + kargo ücreti kuralı) → `payment_status` (pending/paid/partial/refunded); kısmi karşılamada fark hesabı (peşin → iade; kapıda → düşür)
  - *Bitti:* kısmi + kuponlu + kargolu kombinasyon senaryosu doğru tutarı döndürüyor
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
- [x] (03.11) **Referans numarası:** marka+yıl+rastgele üretici + "ilk kalıcı durumda üret" kuralı
  - *Bitti:* biçim ve benzersizlik (çakışma yeniden deneme) testli
  - **Durum (27.07):** `reference-no.ts` — `LA-26-7K4M2P`; rastgele (sıralı numara hacim sızdırır), karışabilen karakterler (I O S Z 0 1 2 5 8) yok, rastgelelik enjekte edilebilir. Benzersizlik DB'nin işi: çakışmada çağıran yeniden üretir. 5 test.

## Netleşecekler

- ~~**Motor ↔ servis sınırı**~~ — 27.07'de karara bağlandı: `domain-core` ile `database` birbirini bilmez; satırları servis getirir, kararı motor verir, ikisini uygulama katmanı birleştirir. Uygulama iş kuralını kendi hesaplayamaz — motora sorar (STACK §4, §13).
- **TS ↔ SQL sınırı (açık):** hangi kurallar saf TS'te, hangileri atomiklik gereği Postgres fonksiyonunda (RPC) yaşar; ör. rezervasyon *kararı* burada, *atomik yazımı* RPC'de. 06/07'ye girmeden netleşir.

---

**Modül durumu (26.07.2026):** başlamadı. `packages/domain-core` kabuk (yalnız paket sabiti). 04/05'te yazılan servisler bugün domain-core'a bağımlı değil — fiyat çözümü, rezervasyon ve durum makinesi buraya geldiğinde 05/06/07'nin ilgili görevleri bu pakete devreder.
