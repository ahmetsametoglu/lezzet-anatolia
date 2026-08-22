# Test dalgası — sıra, yöntem ve envanter

> **Kullanıcı kararı 22.08:** *"bu özellik entegrasyonu bitince hepsini yazmak için bir plan
> oluşturalım"* + *"Önce en son eklenen modüllerin testlerini kurgulayacağız. Sonra geriye doğru
> devam edeceğiz."* Bu dosya o dalganın planıdır.

## 0. Bu dosya ne, ne DEĞİL

**Ne:** dalganın SIRASI, YÖNTEMİ ve — sırası gelen dalga için — ENVANTERİ.

**Ne değil:** durum kaydı. `CLAUDE §5` gereği durumun tek sahibi `docs/build/NN-*.md` görev
satırıdır. Her dalga, ilgili modül dosyasında bir **test görev satırı** (`NN.k`) olarak açılır ve
ilerleme orada işaretlenir; burası yalnız o satırlara giden haritadır. Emsal yazıldı: **`15.18`**
(modül 15'in test envanteri, 22.08).

Envanter **sırası gelince** yazılır, hepsi şimdi değil. Bugün yazılan bir "modül 07 envanteri", o
dalga başlayana kadar çürür — arada kod değişir ve envanter kimsenin uymadığı bir listeye döner.
Bugün yalnız **Dalga 1** tam envanterlidir.

## 1. Neden dalga, ve bugüne kadar yazılmamış olmanın bedeli

Kural 11.08'de kondu: *test istenmeden yazılmaz*. O kural boşuna değildi — greenfield'da arayüz ve
şema haftada birkaç kez yön değiştiriyordu ve her dönüşte testler de yeniden yazılıyordu.

Yerine geçen şey **ölçüm** oldu: her parça yazıldığı gün gerçek veriyle ölçüldü ve ölçüm görev
satırına yazıldı (fiyat farkları, eşik hâlleri, posta kodu dalları, yarış güvenceleri).

**Ölçüm o anın doğrusunu kanıtlar, regresyonu YAKALAMAZ.** 22.08'de ölçülen "B2B 3,76 € / B2C
4,57 €" farkı, yarın biri `pricingViewerOf` çağrısını düşürdüğünde sessizce bozulur ve hiçbir
kırmızı yanmaz. Dalganın tek işi bu sessizliği kapatmak.

## 2. Bugünkü durum — ölçüldü (22.08)

| Koşu | Dosya | Kim koşar |
| --- | --- | --- |
| `vitest --project unit` | 118 dosya · **1380 test** · ~4 sn | herkes, her an (`CLAUDE §4b`) |
| `vitest --project integration` | 140 dosya (yerel Supabase'e vurur) | **yalnız denetmen**, kilitli tam pakette |
| `apps/mobile` jest | 86 dosya | mobil şerit (`pnpm --filter mobile test`) |
| Playwright duman | 10 senaryo (`e2e/`) | **yalnız denetmen**, sakin pencerede |

**Kapsam boşluğu buradan görünmüyor** ve görünmemesi normaldir: 1380 testin ezici çoğunluğu
`domain-core` (51 dosya) ve `database` (31 dosya) gibi ERKEN yazılmış katmanlarda. Son iki ayın
yüzeyleri — sosyal gelen kutusu, AI ajan araçları, barkod — bu sayının içinde neredeyse hiç yok.
Sıranın "yeniden eskiye" olmasının sebebi de bu: **en yeni kod en az korunan koddur.**

## 3. Yöntem — hangi test nereye yazılır

Ayrım `vitest.config.ts`'in kendi kuralıdır, burada tekrar edilmiyor; dalga için bağlayıcı özet:

- **Saf (DB'siz)** → birim projesine dahil bir köke yazılır ve **şerit kendi koşar**. Bir dosyayı
  buraya yazmak, `include` listesinde olduğunu doğrulamayı da kapsar (§4).
- **DB'ye vuran** → entegrasyon köküne yazılır (`apps/web/lib`, `packages/database`,
  `apps/backend`, `apps/mobile-api`, `packages/application`) ve **koşmak denetmenin işidir**
  (`CLAUDE §4b`). Şerit yazar, koşmaz.
- **Teardown** `purgeTestData` / `mustDelete` ile; dosyaya elle silme yazılmaz.
- **Küresel sayıya bakan iddia YOK** — başka şeridin verisi o sayıyı oynatır; yalnız testin kendi
  kurduğu satırlar sayılır.
- **`settings` gibi küresel tekil satır** değiştirilecekse önce okunur, `afterAll`'da geri konur.
- **Bu dalga boyunca "istenmeden test yazma" kuralı KALKAR**, dalga dışında sürer.

### Neyi test etmeye değer

Öncelik ölçütü kapsama yüzdesi değil, **sessiz bozulma riski**:

1. **Kararlar** — bir dalın yanlış seçilmesi yanlış para/stok/mesaj üretiyorsa (fiyat çözümü,
   pencere hesabı, rota kararı, izin damgası).
2. **Sözleşme sınırları** — dış veriden gelen biçim (webhook payload, damga birimi, imza).
3. **Yetki kapıları** — rolün reddedilmesi (`403`), kapsam dışı deponun görülmemesi.
4. **"Bir kez yaşandı" hataları** — kodda künyesi olan her düzeltme bir test adayıdır; künye
   *"bu şöyle bozulmuştu"* diyorsa, testi *"bir daha bozulursa yakalarım"* der.

Test edilmeyecekler de açık yazılır: sunum biçimi (renk, boşluk), çizim birebirliği, üçüncü taraf
kütüphanenin kendi davranışı.

## 4. ÖN KOŞUL — koşmayan test yazma tuzağı (ölçüldü 22.08)

**Dalga başlamadan kapatılacak:** iki paket HİÇBİR vitest projesinde değil.

| Paket | Bugün test | `vitest.config.ts` include |
| --- | --- | --- |
| `packages/address-fr` | 0 | **YOK** |
| `packages/react-hooks` | 0 | **YOK** |

İkisi de saf (adres ayrıştırma · React hook'ları) ve birim projesine aittir. Bugün oraya bir test
yazılsa **sessizce hiç koşmaz** — "test yazdım" ile "test koşuyor" arasındaki fark tam olarak bu ve
aynı tuzak `mask.test.ts`'te bir kez yaşandı (`vitest.config.ts` künyesi).

Aynı turda doğrulanacak ikinci gerçek: **`pnpm test` mobil jest paketini KOŞMAZ** (yalnız vitest).
Mobil şeridin 86 dosyası kendi komutuyla koşuyor. Bu bugün bilinçli sayılabilir (mobil DB'ye
vurmuyor, kendi şeridi var) ama **yazılı değildi** — dalga kapanırken ya birleştirilir ya
gerekçesiyle kayda geçer.

## 5. Sıra — yeniden eskiye

| Dalga | Kapsam | Neden bu sırada | Durum |
| --- | --- | --- | --- |
| **0** | §4 ön koşulu | Koşmayan teste yazı yazmak, hiç yazmamaktan pahalı | açık |
| **1a** | **15** — sosyal gelen kutusu + AI ajan araçları | En yeni ve en geniş yüzey; envanteri hazır | `15.18` |
| **1b** | **23** — barkod | En yeni MODÜL (22.08 doğdu), yüzeyi hâlâ küçük — ucuzken çivilenir | açığı §6.2 |
| **2** | **21.9x** mobil kabuk/kurye/davet | Mobil şeridin kendi defteri var (`docs/talep/not-mobil-test-defteri.md`) — dalga onunla birleşir | şeridinde |
| **3** | **19** çoklu depo (transfer · besleme · yer çözümü) | Ağustos ortası; motorları `domain-core`da ve zaten testli, açık uygulama kapılarında | envanter sırası gelince |
| **4** | **09.28 · 08.5x · 11.7 · 10.9** — fiyat grubu, adres, kurye kapsamı, kargo künyesi | Tekil ama para/yetkiye dokunan işler | envanter sırası gelince |
| **5** | **16 · 17 · 20** talep/geri bildirim/AI çekirdeği | Temmuz sonu–ağustos başı | envanter sırası gelince |
| **6** | **05–14** katalog·stok·sipariş·admin·depo·para·analitik·bildirim | En eski ve en çok testi olan katman; boşluklar burada nokta atışı | envanter sırası gelince |

Her dalga **bir modül dosyasında bir görev satırı** açar. Dalga bitmeden sonrakine geçilmez —
yarım bırakılan test envanteri, envanter olmayan durumdan daha yanıltıcıdır ("bunun testi var"
denip bakılmaz.)

## 6. Dalga 1 envanteri

### 6.1 · 15 — sosyal gelen kutusu + ajan (görev satırı `15.18`)

Envanterin tamamı **`docs/build/15-whatsapp.md` → `(15.18)`** satırındadır ve burada
TEKRARLANMIYOR (`CLAUDE §1`: aynı gerçek iki yere yazılırsa ikisi de güvenilmez olur). Orası
22.08'in eklemeleriyle birlikte güncel: imza doğrulama, webhook ayrıştırma ve damga birimi tuzağı,
`whatsappHref`, kanal sözlüğü, AI beyanı, mobil sunum yardımcıları (saf); `updateIfNull` /
`linkCustomer`, beş destek aracı, `/api/v1/social/*`, izin çift yazımı, mod kapısı (DB'ye vuran).

### 6.2 · 23 — barkod (yeni görev satırı açılacak: `23.10`)

Bugünkü hâl ölçüldü: `packages/application/src/warehouse/scan.ts` ve
`apps/mobile/src/components/scan/scan-sheet.tsx` **testli**; ikisi testsiz.

**Saf (birim — şerit koşar):**
- `apps/mobile/src/components/scan/dev-scan-pool.ts` — dev simülasyon havuzu: kod üretimi, havuzun
  tükenmesi, üretim modunda devre dışı kalması. (Testi olmayan bir dev aracı, bir gün üretimde
  açık kalır.)
- Barkod biçim doğrulaması (EAN-13/EAN-8 sağlama basamağı) — `packages/types` şemasında nerede
  duruyorsa orada; geçersiz basamak REDDEDİLMELİ.

**DB'ye vuran (yazılır, denetmen koşar):**
- `VariantBarcodeService` — tek arama kapısı: bilinen kod doğru varyanta düşer · bilinmeyen kod
  `null` (SIFIR ya da "ilk varyant" DEĞİL) · **öğrenen eşleme** aynı kodu ikinci kez bağlamaz ·
  aynı kod iki varyanta bağlanamaz (kısıt gerçekten reddediyor mu).
- Mal kabulde okutma → `receive_intake` yolunun kod eşleşmesiyle doğru partiye yazması.

## 7. Sonraki dalgaların envanteri

Sırası gelen dalga başlarken **o modülün dosyasında** yazılır (emsal `15.18`). Yazılırken üç şey
ölçülür ve envantere geçer: *(a)* modülün hangi dosyaları testsiz, *(b)* görev satırlarında geçen
hangi ÖLÇÜM bugün hiçbir testle korunmuyor, *(c)* kod künyelerinde *"şöyle bozulmuştu"* diyen
hangi düzeltmenin nöbetçisi yok.

## 8. Dalga kapanış ölçütü

Bir dalga şu üçü olmadan kapanmaz:
1. Envanterdeki her madde ya yazılmış ya **gerekçesiyle üstü çizilmiş** (`~~…~~`, `CLAUDE §5`).
2. Birim yarısı yeşil (şerit koşar ve çıktısını gösterir).
3. DB'ye vuran yarısı **kilitli tam pakette** koşmuş (`pnpm test`) — kanıt `.test-results/latest.json`.
