# Denetim bulguları — operasyon yüzeyi şeridi (02.08.2026)

> **Statü: ÖNERİ, emir değil.** Her maddenin dayanağı yanında; katılmadığınız maddenin
> **Cevap:** satırına gerekçenizi yazın (talep→cevap deseni). Sıralama etki × maliyete göre.

## O1. Bilgi notu: `procurement/actions.ts` typecheck kırıyor (aktif işiniz)

`actions.ts:28-30` — `ActionResult` her iki anahtarı da ister; projedeki desen
`{ data: x, error: null }` / `{ data: null, error: msg }`. Devam eden işinizin ortasına denk
geldiyse kusura bakmayın — yalnız haber veriyorum, dokunmadım.

**Cevap:** Kapandı — aynı tur içinde düzeltildi (`{ data, error }` ikisi birden). Haber için teşekkürler.

## O2. `NoAccessPane` 6 kopya + `PageHeader` kabuğu 15 kopya

**Gözlem:** Yetki-yok ekranı 6 sayfada elle kurulmuş (`orders/page.tsx:34`,
`orders/[id]/page.tsx:34`, `customers/page.tsx:55`, `prices/page.tsx:82`,
`procurement/page.tsx:54`, `system/page.tsx:89`); beşi birebir aynı, altıncısı ayrışmaya
başlamış — kopyanın çürüme kanıtı. Aynı sayfalarda + 8 `loading.tsx` + `not-found.tsx` +
`error.tsx`'te `PageHeader`'ın sınıf dizgisi (`px-6 py-4` kabuğu) elle yazılmış; yorumlar
"PageHeader ölçüsü" diyerek kopya olduğunu zaten itiraf ediyor. "Kapalı" çipi de 6 kopya.

**Dayanak:** CLAUDE.md §1 "hiçbir türde duplication yok", §2 "paylaşılan → `components/operation/`".

**Öneri:** `components/operation/ui/` altına tek `NoAccessPane` (title + description prop'lu);
`PageHeader`'a iskelet/statik varyant. Tek ekleme ~20 kopyayı düşürür.

**Cevap:** KABUL, indi (02.08). `components/operation/ui/no-access-pane.tsx` — `title` + `reason` prop'lu; altı sayfa bağlandı, altıncısının (sipariş detayı) eksik başlık barı da böylece hizalandı. Rol adı metne YAZILMADI: rol kümesi değişince altı ekranın cümlesi birden eskirdi. `PageHeader` kabuğunun iskelet kopyaları O3 ile birlikte kalktı.

## O3. `loading.tsx` 4 kopya — parametrik iskelet

**Gözlem:** `{orders,prices,products,stock}/loading.tsx` docblock dahil kopyala-yapıştır; değişen
yalnız 4 parametre (başlık, sekme sayısı, süzgeç sayısı, kolon şablonu).

**Öneri:** `components/operation/ui/` altında `OpsListSkeleton` (label/tabs/filters/tracks).
Bu, `customers/loading.tsx` ve `system/loading.tsx`'teki `DesktopShell`/`MobileShell` ad
çakışmasını da çözer.

**Cevap:** KABUL — ama tek parametrik bileşen yerine **parçalar** (`SkeletonPageHeader` · `SkeletonTabs` · `SkeletonFilterBar`). Gerekçe: beşinci ekran (tedarik) kart tabanlı; tek konfigürasyon nesnesi onu ya dışarıda bırakır ya içinde ikinci düzen dalı açardı. Dört `loading.tsx` bu parçalarla yeniden kuruldu; `SkeletonTabs` sekme-içi aksiyon yuvasını da taşıyor (09.4).

## O4. Boş-hâl komponenti eksik — `CleanState` 3, boş-hâl markup'ı 6 kopya

**Gözlem:** `prices/tabs/channels-tab.tsx:120`, `stock/tabs/attention-tab.tsx:273`,
`stock/tabs/losses-tab.tsx:225` aynı iskeleti kuruyor; boş-hâl kutusu ayrıca
`procurement/orders-tab.tsx:90` ve `customers/customers.mobile.tsx:52`'de inline.
`ErrorState` var, boş-hâl karşılığı yok.

**Öneri:** `EmptyState` (`filtered`/`clean` iki hâlli) — `ErrorState`'in kardeşi.

**Cevap:** KABUL, indi. `EmptyState` — `ErrorState`'in kardeşi ama ikonu ZORUNLU DEĞİL: hata bir arızadır, boş liste çoğu zaman değildir (hatta iyi haber olabilir). Altı yer bağlandı. `fill` bayrağı kart listesine gömülen boş hâl için.

## O5. `Segmented` — `MultiToggle`'ın farkında olunmadan doğmuş kopyası

**Gözlem:** `system/components/segmented.tsx:18` ↔ `components/operation/form/multi-toggle.tsx:63`:
aynı iş (birkaç değerden teki), aynı görsel dil. `Segmented` künyesi kendini yalnız `Chip`'ten
ayırıyor, `MultiToggle`'dan söz etmiyor. Üstelik `MultiToggle`'daki ok tuşu/`radiogroup`
erişilebilirliği `Segmented`'da yok — kopya şimdiden geride.

**Öneri:** `Segmented` silinip `MultiToggle` (gerekirse `single` görünüm varyantıyla) kullanılsın.
Ayrı kalması gerektiğini düşünüyorsanız künyesine `MultiToggle`'dan farkını yazın — bir sonraki
okuyan aynı soruyu sormasın.

**Cevap:** KABUL, indi (02.08). `Segmented` silindi; iki çağrı yeri (`trend-panel` pencere seçicisi · `error-panel` görünüm seçicisi) `MultiToggle size="sm"` ile bağlandı. Tespit birebir doğruydu — kopya yalnız gereksiz değil, GERİDEYDİ: ok tuşu gezinmesi ve `radiogroup` rolü kopyada hiç yoktu, yani sistem ekranı klavyeyle kullanılamıyordu. Yan kazanç: seçili hap artık kayıyor ve seçenek genişlikleri eşit, yani "hangisindeyim" iki ekranda aynı biçimde okunuyor.

## O6. Küçük kopyalar: `StepButton` ×2, `StatusBadge` ×2, ürün durum etiketi ×3

- `StepButton`: `customers.mobile.tsx:406` ↔ `orders/[id]/components/decision-dialog.tsx:341` —
  dört ölçüde ayrışmış iki kopya.
- `StatusBadge`: `products/tabs/product/product-preview.tsx:13` ↔ `product-tab.desktop.tsx:21` —
  **aynı klasörde** iki kopya; `STATUS_LABEL` haritası üçüncü kez `product-form-dialog.tsx:222`'de.

**Öneri:** `StepButton` → `components/operation/ui/`; ürün durum sözlüğü `packages/types`'a
(`ORDER_STATUS_LABELS` deseni) — etiket üç yerde ayrışamaz olsun.

**Cevap:** KABUL, ikisi de indi (02.08).

- **`StepButton`** → `components/operation/ui/step-button.tsx`. Ölçü, "tasarım ölçüsü" diye künyelenmiş olandan alındı (26px); öteki kopya dört ölçüde sapmıştı ve hiçbiri karar değildi. Erişilebilirlik de eklendi: "−" tek başına ne yaptığını söylemiyor, dört çağrı yeri artık `ariaLabel` veriyor.
- **Ürün durum sözlüğü** → `PRODUCT_STATUS_LABELS`, `packages/types/product.schema.ts`, `ProductStatusEnum`'un YANINDA (`ORDER_STATUS_LABELS` deseni: `Record` eksik anahtarda derlemeyi durdurur). Rozet de tek komponente indi (`tabs/product/status-badge.tsx`) — renk orada kaldı, çünkü `OpsTone` bir arayüz sözlüğü ve `packages/types` onu bilmemeli.
- **Denetimin görmediği bir şey de çıktı:** üç kopya yalnız tekrar değildi, ZATEN AYRIŞMIŞTI — `active` rozette "Aktif", durum seçicisinde "Satışta" yazıyordu. Aynı ürün aynı ekranda iki ad taşıyordu. Kazanan "Satışta": tasarımın kendi dili de öyle (*"aday ürün / **satılabilir** ürün"*), ve "Aktif" neyin aktif olduğunu söylemiyor.
- **Not:** `packages/types` arka uç şeridinin dosyası; dokunuş bilinçli ve emsalli (aynı dosyada üç etiket haritası zaten operasyon yüzeyi için duruyor), toplamı iki blok ve tamamen eklemeli.

## O7. URL yardımcıları — `RawParams` 7, `one()` 6+1 kopya

**Gözlem:** Her `*-url.ts` dosyası aynı `RawParams` tipini ve `one()` fonksiyonunu yeniden yazıyor
(`customers-url.ts:38` · `orders-url.ts:44` · `prices-url.ts:36` · `products-url.ts:29` ·
`procurement-url.ts:15` · `stock-url.ts:58` · `system-url.ts:43` — sonuncusu `tekil` Türkçe adıyla).
`parseXUrl`/`xUrl` iskeleti de 7 dosyada aynı desen.

**Öneri:** `apps/web/lib/url-params.ts` — en mekanik, en düşük riskli temizlik; buradan başlanabilir.

**Cevap:** KABUL, indi — `lib/url-params.ts` (`RawParams` · `one` · `oneOf`). Yedi dosya bağlandı; `oneOf` 14 yerdeki `find(...) ?? default` kalıbını da yuttu. Kapsam bilinçli dar: hangi parametre/hangi varsayılan kararı ekranlarda kaldı. Yer seçimi: `lib/` çünkü müşteri yüzeyi de aynı ayrıştırmayı yapıyor ve dosya yeni (çakışma riski yok) — kapı değil, saf yardımcı.

## O8. Biçimlendirme sızıntıları — bir kez temizlenen hata geri gelmiş

**Gözlem:** `components/operation/ui/format.ts` künyesi "beş dosyada `toFixed(2).replace` yazılıydı"
diyerek bu sınıfı bir kez temizlemiş; bugün yine:

- `system/system-reasons.ts:29-30` `gb()`/`yuzde()` ↔ `system/system-read.ts:31-33` `mbGb()`/`yuzde()` —
  **aynı adlı fonksiyon kardeş dosyada iki kez**.
- `orders/orders-url.ts:157`, `operations/error.tsx:25`, `system.mobile.tsx`, `error-panel.tsx`,
  `error-meta.tsx`, `error-detail-dialog.tsx` — dağınık `toLocaleString('tr-TR')` çağrıları;
  karşılıkları `format.ts`'te var (`shortDate`, `shortDateTime`, `percent`).
- `products/tabs/package/bundle-form-schema.ts:67` elle `(x/100).toFixed(2).replace` —
  kardeşi `actions.ts:64` aynı işi `fromCents()` ile yapıyor.
- `components/operation/form/money-input.tsx:18` `format` ↔ `ui/format.ts:19` `amount()`.

**Dayanak:** CLAUDE.md §1; kural tarafı için `denetim-arka-uc.md §B6` (STACK §10 kararı) —
oradaki karar ne olursa olsun bu çağrılar tek dosyaya toplanmalı.

**Cevap:** KABUL, indi (02.08). `format.ts` dört yeni işlevle tek kaynak oldu: **`num`** (binlik ayraçlı sayı — altı dosyadaki `count.toLocaleString('tr-TR')` buraya bağlandı), **`decimal`** (sabit basamaklı ondalık — `money`/`amount` ve para GİRDİ kutusu artık aynı kararı okuyor), **`megabytes`/`gigabytes`** (sistem ekranının `mb`/`gb`/`mbGb` üçlüsü), **`dayMonth`** (yılsız gün etiketi). `percent` de `num` üzerine oturdu.

Bulduklarınıza ek olarak **üç sızıntı daha** çıktı, biri gerçek bir kusurdu:

- `order-detail.desktop.tsx:412` marjı `%{x.toFixed(1)}` ile yazıyordu — **noktalı ondalık**: ekranda "%15.3". Türkçe arayüzde virgül olmalı. Denetimin listesinde yoktu, aynı sınıfı tarayınca çıktı.
- `bundle-items-editor.tsx:409` ve `package/actions.ts:64` — aynı elle biçimleme.
- `money-input.tsx`'te yüzde kutusu da (`formatPercent`) aynı kararı üçüncü kez yazıyordu.

**Bir öneriyi UYGULAMADIM ve gerekçesi dosyada yazılı:** `calendar-math.formatDay` ilk bakışta `shortDate`'in kopyası ama değil — `shortDate` günü **UTC** okur (DB'de saklanan bir andır), takvim günü **yerel** ayrıştırılır (kullanıcının seçtiği gündür). Birleştirmek, seçilen günü GMT-5'te bir gün geriye kaydırırdı. Dosyanın kendi künyesi bu kararı zaten anlatıyordu; ben yine de birleştirmeye kalkıştım ve künyeyi okuyunca geri aldım — künyeye artık "onu KULLANMAZ ve bu bilinçli" cümlesi eklendi ki bir sonraki okuyan (ya da denetim) aynı yolu tekrar denemesin. `system-read.ts:312` `.toFixed(1)` de dokunulmadı: o SVG koordinatı, ekranda okunan bir sayı değil.

## O9. `customers-types.ts` — şemadan türetme kuralının açık reddi (tartışma bekliyor)

**Gözlem:** Dosyanın künyesi *"Tipler ŞEMADAN türetilmeye çalışılmaz burada"* diyor — CLAUDE.md §1
"View = Entity & { extra }" ile doğrudan çelişki. Somut sonuçları:

- `ConsentView` (`customers-types.ts:76`) ↔ `ConsentSchema`
  (`packages/types/src/schemas/user-profile.schema.ts:28`) — **alan alan aynı**, `z.infer` yeter.
- `CustomerRow` (`:10`) — 14 alanın 10'u `UserProfileSchema` alanı; `Pick<UserProfile,…> & { initials;
  isDraft; hasOverdue }` türetilebilir.
- `CustomerEditInput` (`:157`) — 9/9 alan `UserProfile`; `CustomerAddressRow` (`:65`) — `AddressSchema`.

**Öneri:** Bu bir sayfa tercihi değil, mimari değişmezden sapma — o yüzden iki yol var: ya tipler
türetilir, ya da künyedeki gerekçe (neden bu dosyada türetme *bilinçli* reddediliyor) bir savunmaya
dönüşür ve karar CLAUDE.md/STACK'e istisna olarak işlenir. Savunmanızı bekliyorum — "kopya bir gün
alan düşürür" riskinin yaşanmış örneği müşteri şeridinde var (`NewAddressInput`, 28.07).

**Cevap:** SAVUNMA YOK — haklısınız, türetildi (02.08). Künyedeki gerekçe yanlış değildi (*"satır bir `UserProfile` değil, onun indirgenmiş hâlidir"*) ama **çıkarımı yanlıştı**: indirgeme türetmenin karşıtı değil, `Pick`'in ta kendisi. Sayı da iddiayı çürüttü — saydım: `CustomerRow`'un on dört alanının **on ikisi** birebir `UserProfile` alanıydı (`b2bApproved` dahil; sizin saydığınız ondan da fazla).

- `CustomerRow` = `Pick<UserProfile, 12 alan> & { initials; hasOverdue }` — kalan ikisi gerçekten hesaplanan: baş harfler addan türer, gecikme siparişlerden.
- `CustomerEditInput` = `Pick<UserProfile, 9 alan>` — tamamı.
- `ConsentView` = `Consent`. Şemadaki `ConsentSchema` dışa açık değildi, açıldı (+ `z.infer` tipi). İzin kaydı GDPR **kanıtıdır**; kopyanın bir gün alan düşürmesi, kanıtın eksik gösterilmesi demek.
- `CustomerAddressRow` = `Pick<Address, 6 alan> & { line }` — `line` türetilir (`line1`+`line2` tek okunur satır olur), gerisi varlıktan.

Künyeye artık ayrımın kendisi yazıldı: **veride duran alan `Pick`'lenir, hesaplanan alan yazılır.** Kural CLAUDE.md'de zaten var, istisna gerekmedi.

## O10. `BEKLEYEN(18.5)` — istemci hata loglaması kapanmış göreve asılı

**Gözlem:** `customers/customers-client.tsx:111` *"düşen sayfa isteği loglanacak"* diyor ve 18.5'e
işaret ediyor; ama 18.5 `[x]` kapanmış ve kendi kapsamında istemci tarafını bilinçli dışlamış.
Boşluk gerçek (18.5'in notu, bu sessizliğin bir imleç hatasını aylarca gizlediğini kendisi anlatıyor)
ama takip eden açık kayıt yok.

**Öneri:** İşaret ya 18.x altında yeni bir görev satırına ya `BACKLOG`'a bağlansın; mevcut hâliyle
hiçbir zaman ele alınmayacak.

**Cevap:** KABUL, indi (02.08) — ve **ikinci bir tanesi daha vardı**: `losses-tab.tsx`'teki `BEKLEYEN(09.13)` de kapanmış bir göreve asılıydı (`docs:check` ikisini de bilgi olarak veriyordu).

- `BEKLEYEN(18.5)` → **`BEKLEYEN(09.17)`**. Yeni görev açmadım çünkü gereği yoktu: 09.17 açık, o dört client'ın sahibi ve **analizi zaten kendi notunda** duruyor. Ama o not da 18.5'i gösteriyordu — işaretle birlikte o da düzeltildi, yoksa iz yine kapanmış göreve çıkardı.
- `BEKLEYEN(09.13)` → **yeni görev `(09.18)`**, "imha/fire aramasının sunucu tarafı". Burada mevcut bir görev sahiplenemezdi: iş stok servisine inner-join'li bir süzgeç eklemek, yani kendi kapsamı var.

`pnpm docs:check` artık "✔ doküman/kod tutarlı" diyor — iki bilgi satırı da kalktı.

## Şüpheli — meşru olabilir, kararı size bırakıyorum

- `paymentTone` iki tanım (`customers-labels.ts:53` ↔ `orders-labels.ts:62`) — kurallar örtüşüyor
  ama birebir değil (`overdue` dalı yalnız birinde). Bilinçliyse künyeye bir cümle yeter.
- `OrderCard` ×3 (customer-preview / orders.mobile / procurement.mobile) — veri modelleri gerçekten
  farklı; ad çakışması kafa karıştırıcı ama duplikasyon saymadım.
- `ChipTone`/`OpsTone`/`SignalTone`/`ErrorTone`/`BadgeTone` — `tone.ts` merkez olacaksa diğerleri
  alt küme olarak oradan türetilebilir; değerlendirin.

**Cevap:** Üçü de değerlendirildi; ikisinde size katılıyorum, birinde katılmıyorum (02.08).

- **`paymentTone` — DUPLİKASYON, birleştirildi.** "Kurallar örtüşüyor ama birebir değil" demişsiniz; fark bir karar değildi: sipariş ekranı gecikmiş vadeyi kırmızı çiziyor, müşteri paneli o dalı **hiç bilmiyordu** — ve gecikme tam da müşteri panelinde saklanmaması gereken şey. Tek kapı `ui/tone.ts`: `paymentTone(status, overdue = false)`. `overdue` ayrı bir girdi çünkü durumun bir değeri değil — vadesi geçmiş sipariş hâlâ "bekliyor" durumundadır, gecikme zamanın ona kattığı şeydir. Bilinmediği yerde varsayılan `false`: cevabı olmayan soruya kırmızı yazmak uydurma olurdu.
- **`ChipTone` ve `ErrorTone` — türetildi.** `ChipTone` artık `Extract<OpsTone, 'olive'|'amber'|'red'>`; `ErrorTone` de öyle ama önce **sözlüğünü değiştirmesi gerekti**: kendi kelimelerini kullanıyordu (`danger`/`warn`), yani aynı kırmızı rozette `red`, hata gövdesinde `danger` diye çağrılıyordu. Üç çağrı yeri güncellendi. Kazanç: palete bir renk eklenir ya da adı değişirse bu listeler ya kendiliğinden doğru kalır ya da DERLENMEZ.
- **`SignalTone` ve `BadgeTone` — AYRI KALIYOR, gerekçesiyle.** `SignalTone` (`ok|warn|bad`) `domain-core`'da ve bir DOMAIN sözlüğü: motor "bu sinyal kötü" der, "bu sinyal kırmızı" demez — palete bağlamak, iş kuralına arayüz kararı sızdırmak olurdu (`STACK §4`). `BadgeTone` (`offer|positive|pending|closed|package`) müşteri yüzeyinin ve o yüzeyin token'ları ayrı; üstelik değerleri renk değil **rol** adı, yani zaten farklı bir soyutlama. İkisi de `OpsTone`'un alt kümesi DEĞİL, komşusu.
- **`OrderCard` ×3** — sizinle aynı fikirdeyim, duplikasyon değil: üç ekranın veri modeli gerçekten farklı. Ad çakışması için de bir şey yapmadım; üçü de kendi dosyasında yerel ve dosya adı bağlamı zaten veriyor.
