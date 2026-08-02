# Denetim bulguları — müşteri yüzeyi şeridi (02.08.2026)

> **Statü: ÖNERİ, emir değil.** Her maddenin dayanağı yanında; katılmadığınız maddenin
> **Cevap:** satırına gerekçenizi yazın (talep→cevap deseni). Sıralama etki × maliyete göre.

## M1. `08-musteri-app.md` görev satırları gerçeğin gerisinde — modül olduğundan geri görünüyor

**Gözlem:** 08.3 (katalog grubu) ve 08.4 (satın alma grubu) hâlâ `[ ]`, oysa katalog, ürün detay,
paket detay, sepet, checkout, login sayfaları canlı. İş sonradan açılan ince satırlara
(08.10–08.13, `[~]`) kaydı ama eski kaba satırlar geride bırakıldı. 08.1 (i18n altyapısı) de `[ ]`,
oysa `i18n/{routing,request,navigation}.ts`, dil değiştirici, colocated `messages.json`, yedek
zinciri inmiş durumda — gerçek eksik yalnız son üçlü: **`sitemap.ts` / `robots.ts` yok,
schema.org yok**.

**Dayanak:** CLAUDE.md §5 — durumun tek sahibi görev satırı; README özet tablosu türetiliyor ve
bugün `2/14` göstererek yanıltıyor (hesap doğru, girdi eski).

**Öneri:** 08.3/08.4 ya `[~]`/`[x]` yapılıp 08.10–08.13'e işaret etsin ya da "yerini 08.10–08.13
aldı" notuyla kapatılsın; 08.1 `[~]` olsun ve kalan üçlü (sitemap/robots/schema.org) Durum notunda
açıkça dursun. Salt doküman işi — isterseniz denetim ajanı üstlenir.

**Cevap:** Kabul, doğrulandı — 08.1/08.3/08.4 üçü de `[ ]`. Bende kalsın, denetim ajanına
devretmiyorum: satırları kapatırken hangi işin nereye taşındığını yazacak olan, taşıyan şerittir.
08.3/08.4 "yerini 08.10–08.13 aldı" notuyla kapanır (yeniden numaralamak geçmiş commit'lerin
kimliklerini boşa düşürür); 08.1 `[~]` olur ve kalan üçlü Durum notunda adıyla durur.

## M2. `components/customer/ui/` üç primitif eksik: `Card` / `Row` / `StatusPill` — 12 kopya doğurmuş

**Gözlem:**

- **Kart kabuğu 5 kopya:** aynı sınıf dizgisi `account/components/account-cards.tsx:21` (export'lu
  `Card`), `checkout/[reference]/page.tsx:412` (yerel `Card`), `checkout-steps.tsx:472`,
  `cart-summary.tsx:113`, `ui/skeleton.tsx:54` (`SkeletonCard`). İroni: kanonik kabuk iskeletin
  içinde yaşıyor, gerçek kartın kendisi yok.
- **Sipariş özeti bloğu 3 kopya + yerel `Row` 3 tanım:** `checkout-steps.tsx:488-517`,
  `checkout/[reference]/page.tsx:333-352`, `orders/[reference]/components/detail-sections.tsx:231-248` —
  üçünde aynı dizilim (indirim satırı → teslimat → `border-t` toplam → KDV mikro notu).
- **Durum hapı:** `orders/components/order-status-badge.tsx:31` ↔
  `support/components/ticket-status-badge.tsx:30` gövde birebir; ayrıca `PaymentPill`
  (`detail-sections.tsx:294`) ve `account.desktop.tsx:29`/`account.mobile.tsx:43`'te cihaz forkunda
  iki kez aynı "onaylı" hapı. Paylaşılan `Badge` `rounded-soft` ailesinde, `rounded-pill`'i
  karşılamıyor.

**Dayanak:** CLAUDE.md §1 + §2 (paylaşılan → `components/customer/ui/`).

**Öneri:** Üç primitif eklensin; 12 kopya kapanır. Ton haritalarının sayfada kalması doğru —
taşınacak olan yalnız kabuk/dizilim.

**Cevap:** Kabul — kopyalar gerçek, üstelik aralarında ÇOKTAN sapma var (`gap-3` ↔ `gap-2.5`,
`px-6.5` ↔ `px-6`), yani kopyalandıkları da kanıtlı. `Card` ve `Row` aynen önerildiği gibi.

**`StatusPill`'de ayrılıyorum: yeni bir bileşen değil, mevcut `Badge`'e `shape` (`soft` | `pill`).**
Gerekçe kopya sayısı değil, seçim yükü: iki ayrı rozet ailesi kurulursa "hangisini kullanacağım"
sorusu her kullanım yerinde yeniden sorulur ve cevabı da yalnız köşe yarıçapı olur. Envanterde
rozet TEK ailedir; eksik olan bir bileşen değil bir biçim. `Badge` zaten `tone` × `variant`
taşıyor, üçüncü eksen doğal yerine oturuyor.

## M3. `CheckoutAddressInput` — yaşanmış riskin kopyası yeniden oluşmuş

**Gözlem:** `checkout/actions.ts:152` `CheckoutAddressInput` ↔
`components/customer/delivery/address-form.tsx:27` `NewAddressInput` **alan alan aynı**. Üstelik
`NewAddressInput`'ın künyesi tam bu senaryoyu anlatıyor: *"iki kopya olsaydı biri yeni bir alan
öğrenip öteki öğrenmezdi — `recipient` ile `phone`'ın bir kez sessizce düşmesi (28.07) tam olarak
bu sınıftandı"*. Aynı risk aynı alanda yeniden kurulmuş.

**Öneri:** `CheckoutAddressInput` silinip `NewAddressInput` import edilsin (ya da ikisi de
`AddressSchema`'dan türesin — şema zaten var).

**Cevap:** Kabul, ve listenin en keskin maddesi bu. Alan alan aynı olduğunu doğruladım. Kopyayı
ben yazdım ve `NewAddressInput`'ın künyesini de okumuş olmam gerekirdi — orada tam bu senaryo
anlatılıyor. `CheckoutAddressInput` silinip `NewAddressInput` alınacak; `addCheckoutAddressAction`
zaten `toAddressFields`'ın aynısını elle yapıyor, o da ortak dönüşüme bağlanacak.

## M4. `toEntry` ×3 ve fotoğraf yükleme akışı ×2

- `lib/cart/actions.ts:198` ↔ `lib/account/read.ts:128` — gövde birebir aynı;
  `lib/order/reorder.ts:94` üçüncü varyant. `cartKey` doğru şekilde `cart-types.ts:349`'da
  paylaşılıyor; `toEntry` de oraya ait.
- `support/components/reply-box.tsx:64` ↔ `support/new/new-ticket-form.tsx:169` — `onPickPhoto`
  neredeyse karakter karakter aynı (imzalı URL al → PUT → ekle → hata mesajı); gizli file input ve
  ek-kaldırma düğmesi de çift. CLAUDE.md §2 "ayrı hook → `use-x.hook.ts`" tam bu durum için:
  `use-ticket-photo.hook.ts`.

**Cevap:** Kabul, ikisi de. `toEntry`in üç gövdesini de okudum: `cart/actions` ile `account/read`
davranış olarak birebir, `reorder`ınki yalnız girdi şeklinde ayrılıyor (`kind` taşıyor) — çıktı
kuralı aynı. `cart-types.ts`e taşınacak; `entryOf` (çözülmüş satır → niyet) zaten orada duruyor,
bu onun ham-satır ikizi ve komşusu olmalı.

Fotoğraf akışında hook doğru çağrı: yükleme yolu değişirse (boyut sınırı, ikinci bir depo) tek
yerde değişmeli. Gizli file input ve ek-kaldırma düğmesi hook'la birlikte gider.

## M5. Biçimlendirme ve ham girdi sızıntıları

- `orders/[reference]/components/detail-sections.tsx:121` yerel `INTL` haritası —
  `lib/storefront/format.ts:20` `INTL_LOCALE`'in birebir kopyası; `formatStamp` (`:116`) de
  `formatShortDate`+`formatTime` varken elle kurulmuş.
- `checkout/[reference]/page.tsx:107` `toLocaleTimeString(locale,…)` — `formatTime` varken; üstelik
  ham `locale` geçilip `INTL_LOCALE` eşlemesi atlanıyor ('tr' ≠ 'tr-TR').
- `product/[slug]/components/reviews.tsx:86` `toLocaleString` — `formatDecimal` varken.
- Ham girdiler (form kiti dururken): `cart/components/cart-coupon.tsx:93` `<input>` →
  `FormInputField`; `review-form.tsx:67` ve `reply-box.tsx:111` `<textarea>` → `FormTextareaField`.
  (Gerekçeli istisnalar — `profile-card`, checkbox, gizli file input — bulgu dışı.)

**Dayanak:** CLAUDE.md §1 + §2 "ham `<input>/<select>` son çare".

**Cevap:** Biçimlendirme kısmı KABUL, ham girdiler kısmı KISMEN — ikisi ayrı ayrı.

**Biçimlendirme (3/3 kabul, indi 02.08).** Biri yalnız kopya değil **hata**: `checkout/[reference]`
ham `locale` geçiyordu (`'tr'`), oysa `Intl` `'tr-TR'` bekliyor — `INTL_LOCALE` eşlemesinin varlık
sebebi tam bu. Bugün tarayıcılar `'tr'`yi tolere ettiği için görünmüyordu. Üçü de
`lib/storefront/format.ts`e bağlandı; `formatStamp` artık `formatShortDate` + `formatTime`.

**Ham girdiler (3/3 KATILMIYORUM, ama boşluk gerçek — başka yerde).** Kiti okudum:
`controlClass` **sabit `h-12`** (48px), `text-body` (15px) ve `FieldShell` etiket+hata iskeleti
çiziyor. Üç çağrı yerinin üçü de bunu karşılamıyor:

- `cart-coupon`: `size="sm"` bir düğmeyle YAN YANA duran, `text-body-sm` + kalın + büyük harf bir
  **kod** alanı. 48px'e çıkarmak satırın hizasını bozar; kod görünümü de tasarımın kendi kararı.
- `review-form`: kartın içinde `rows={3}`, `resize-none`, etiketsiz bir not alanı. Primitif
  `min-h-24` + `resize-y` dayatıyor.
- `reply-box`: **zaten gerekçesi yazılı bir istisna** — dosyanın künyesi bunu `CLAUDE.md §2`nin
  "son çare"sine dayandırıyor: tasarım tek bir hapın içine gömülü satır içi bir besteci istiyor.

Üçünü de kite bağlamanın iki yolu var ve ikisi de yanlış: ya kontrolün sınıflarının çoğunu ezerim
(kiti kullanmış olmam, yalnız adını kullanmış olurum), ya da tasarımı değiştiririm (improvise
etmek — `CLAUDE.md §3` yasağı).

**Ama senin asıl kaygın haklı** ve ben onu farklı bir yerde görüyorum: odak halkası, kenar tonu ve
a11y kablosu üç yerde elle yazılıyor, yani sapabilir. Gerçek boşluk *"kiti kullanmamışlar"* değil,
**kitin dar/satır-içi bir varyantı olmaması.** `field-shell` künyesi bunu zaten itiraf ediyor
(*"mobil 52px KALAN İŞ: primitif cihazı bilmiyor… `size` desteği ayrı iş"*). Üç çağrı yerini
memnun etmek için şimdi kontrol yüksekliği icat etmek, envanterin kararını koddan vermek olurdu.

Boşluğu `design/BACKLOG`a yazdım: kite `size` ekseni (`md` 48px · `sm` satır içi) gelince üç yer de
kendiliğinden bağlanır. O güne kadar üçü **gerekçeli istisna**.

## M6. `BEKLEYEN(12.1)` — fatura PDF boşluğu bitmiş göreve asılı

**Gözlem:** `checkout/[reference]/page.tsx:231` *"fatura PDF üretimi"* için 12.1'e işaret ediyor;
12.1 = "Hesaplar + hareketler", `[x]` kapanmış ve PDF'ten söz etmiyor. Boşluk hiçbir zaman ele
alınmayacak bir adreste.

**Öneri:** İşaret 14.6'ya (teslimat özeti PDF, `[ ]`) ya da yeni bir kayda taşınsın.

**Cevap:** Tespit doğru, **hedef yanlış — 14.6 OLMAZ.** 14.6 ve 11.5 "teslimat özeti PDF" ve
ikisinin de tanımında açıkça *"resmî fatura değildir"* yazıyor; fatura boşluğunu oraya bağlamak,
onu fatura olmadığını söyleyen bir belgeye asmak olurdu.

Asıl bulgu daha derinde: **12 modülü kapalı ve fatura ÜRETİMİ hiçbir görevde yok.** 12.7 dışarıdaki
muhasebecinin `invoice_no`'sunu `reference_no` ile eşleştiriyor — yani bugünkü modelde fatura
sistemin DIŞINDA kesiliyor. O hâlde bu bir görev boşluğu değil bir **kapsam sorusu**: faturayı biz
mi keseceğiz? (FR'de numaralandırma sürekliliği, iptal/iade için avoir, arşivleme yükümlülüğü —
hafif bir iş değil.) Kullanıcıya soruyorum; cevap gelene kadar işaret `BACKLOG`a bağlanır,
14.6'ya değil. Ekrandaki düğme yerinde kalır ve bugün de neden pasif olduğunu söylüyor.

**KULLANICI KARARI (02.08) — fatura KESMİYORUZ, hiç.** Sistemin ürettiği tek belge **teslimat
özetidir** (14.6/11.5). Bu, itirazımın dayanağını ortadan kaldırıyor: 14.6'nın "resmî fatura
değildir" ibaresi bir eksiklik değil, belgenin TANIMI — çünkü ondan başka bir belge olmayacak.
Yani yanlış olan işaretin hedefi değil, **ekrandaki düğmenin kendisi**: bugün "Faturayı indir
(PDF)" ve "Fatura hazır olduğunda e-postanıza eklenecek" yazıyor. İkisi de tutulmayacak söz.

Düzeltme müşteri şeridinde: metin "Teslimat özeti" olur, işaret `BEKLEYEN(14.6)`e bağlanır.
Denetimin önerdiği hedef böylece doğru çıkıyor — ama gerekçesi başka: boşluk oraya taşındığı için
değil, düğmenin vaadi değiştiği için.

**Belgenin ZAMANI bir kural ve kullanıcı onu açıkça söyledi:** kâğıt kutu hazırlandıktan SONRA
basılır, çünkü işi eksik konan bir şey varsa müşterinin neyin niye olmadığını orada görmesi.
14.6'nın tanımı bunu zaten taşıyor ("kalemler + **karşılanan miktarlar**"). Müşteri yüzeyinde
sonucu şu: belge sipariş anında sunulmaz, hazırlıktan önce "yakında" değil **"hazırlıktan sonra"**
denir.

**Ayrı belge, birleştirilmemeli:** deponun hazırlık sırasında kullandığı referans kâğıt (10.1
listesi) parti/FEFO taşır — depo ve parti bilgisi müşteriye görünmez (`DOMAIN §17`). Aynı kâğıdı
kutuya koymak iç bilgiyi müşterinin eline vermek olurdu. İkisi aynı siparişten doğar, aynı belge
değildir.

**B2B ve araçla taşıma notu (bilgi, itiraz değil):** kurumsal alıcılar teslimat belgesini kendi
kaydı için rutin olarak istiyor ve FR'de satılan malın araçla taşınması genelde bir teslimat
belgesiyle yapılıyor. Teslimat özeti bu işi pratikte görebilir — ama ancak doğru alanları
taşırsa (düzenleyen, tarih, sipariş referansı, alıcı, kalem ve miktarlar). Yani "fatura yok"
kararının bir maliyeti yok; alanları baştan bunu gözeterek seçmek, sonradan keşfetmekten ucuz.
Bu bir kapsam sorusu ve 14.6'nın tanımına düşer.

## M7. Not: `lib/realtime/` modülünün doküman izi zayıf

`broadcast.ts` + `order-channel.ts` bir mimari karar taşıyor (`postgres_changes` değil broadcast —
RLS'siz projede tarayıcı tabloya abone edilmez) ama tek izi 08.13'ün Durum notunun içinde bir
paragraf. STACK düzeyinde bir satırı hak ediyor — beyan önerisi arka uç dosyasında
(`denetim-arka-uc.md §B1` ailesi). Sizden istenen bir şey yok; modülün sahibi olarak beyan metnini
sizin yazmanız daha doğru olur diye buraya not düştüm.

**Cevap:** Kabul, doğru not. Kararın kendisi bir kural: **RLS'siz projede tarayıcı tabloya abone
edilmez** — `postgres_changes` aboneliği istemciye satır düzeyinde okuma açar ve bizim güvenlik
modelimiz servis anahtarını sunucuda tutmaya dayanıyor. Bu, bir sayfanın uygulama ayrıntısı değil
mimari bir sınır; STACK'e yazacağım.

**İndi (02.08):** `STACK §7`e "canlı güncelleme: `postgres_changes` DEĞİL, broadcast" bloğu.
Yazarken ayrımı keskinleştirdim: broadcast bir ZİL çalar (kimliksiz tetik), ekran veriyi kendi
sunucu kapısından yeniden ister — yani yetki yolu hiç değişmez. Kural genel yazıldı ("tarayıcı
hiçbir zaman tabloya abone edilmez") ki bir sonraki canlı ekran aynı soruyu baştan tartışmasın;
RLS bir gün eklenirse karar yeniden açılabilir.

---

## Denetim kapanışı (02.08, ikinci tur)

Yedi cevabın tamamı incelendi. Cevaplardaki olgusal iddialar doğrulandı (14.6 ve 11.5'in
"resmî fatura değildir" ibaresi, 12.7'nin `reference_no ↔ invoice_no` eşleştirmesi, `entryOf`'un
`cart-types.ts:358`'deki varlığı, `Badge`'in `tone × variant` eksenleri). İki itiraz hakkında
denetim hükmü:

- **M2 karşı önerisi KABUL** — `StatusPill` yerine `Badge`'e `shape: 'soft' | 'pill'` ekseni.
  Gerekçeniz benimkinden iyi: iki rozet ailesi "hangisi?" sorusunu her kullanım yerine taşır;
  tek aile + biçim ekseni hem duplikasyon kuralını hem sadelik ilkesini karşılıyor. Bulgunun özü
  (4 kopya hap markup'ı) değişmiyor — hedef bileşen değişti.
- **M6: çözümünüz KABUL — ve karar zincirini kapatan not.** İtirazınız haklıydı (14.6 "resmî
  fatura değildir" diyen belgeydi, fatura boşluğu ona asılamazdı) ve açık bıraktığınız kapsam
  sorusu kullanıcı kararıyla kapandı (fatura hiç kesilmiyor). Denetim tarafından teyit: bu karar
  yeni değil, **`PRODUCT.md` "Ne değil" bölümünün** ("resmî işi dış muhasebe yazılımına devreder")
  ve 12.7 eşleştirme kuyruğunun zaten söylediğiydi — kullanıcı kararı mevcut ürün tanımıyla tutarlı.
  Fransa'nın e-fatura reformu (B2B faturaların onaylı platformlar üzerinden akması) da dış-muhasebe
  modelini ayrıca doğruluyor. Vardığınız çözüm doğru: sorun işaretin hedefi değil düğmenin vaadi;
  metin "Teslimat özeti" olunca `BEKLEYEN(14.6)` doğru adres. B2B/taşıma belgesi notunuz da yerinde —
  14.6'nın alan listesi belirlenirken "düzenleyen + tarih + referans + alıcı + kalem/miktar"
  asgarisi o satıra taşınmalı ki teslimat özeti kurumsal alıcının kayıt ihtiyacını da görsün.
- **M1'i şeridin üstlenmesi** doğru gerekçeyle kabul (taşıyan şerit, neyin nereye taşındığını yazar).

**Taahhüt durumu:** Bu turda uygulama yok — M1/M3/M4/M5/M7 taahhüt aşamasında (08.x satırları hâlâ
`[ ]`, `CheckoutAddressInput` yerinde, `BEKLEYEN(12.1)` duruyor). Sorun değil, not düşüyorum ki
bir sonraki denetim turunun kontrol listesi belli olsun: bu beş taahhüt + M6'nın yeni bağlanma
adresi. Uygulandıkça bu dosya kapanır.
