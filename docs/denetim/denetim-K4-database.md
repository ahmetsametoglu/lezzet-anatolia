# Denetim K4 — Veritabanı servisleri (`packages/database`)

> Program: `denetim-katman-haritasi.md` · Ölçü: 52 servis · 95 dosya · 16.262 satır · Tarih: 10.08.2026
> Ölçüt: `STACK §6` (ham `this.supabase` ne zaman serbest — TS2 turunda yazıldı) + `CLAUDE §1`.
>
> **Sayfalama disiplini kusursuz:** 13 serviste keyset, **`.range()` kullanan tek servis yok**.
> Ham kullanımların iki mutlak yasağı (tabanı atlayarak kendi tablosuna yazmak · `parseRows`'u
> atlayan entity okuması) taranmış hâliyle **ihlalsiz**. İki duplikasyon bulundu.

---

## K4-1 · "Grup içinde tek bayrak" algoritması iki serviste birebir yazılı

`address.service.ts:33` ile `supplier.service.ts:128` **satır satır aynı**:

```ts
async setDefault(id)                         async setPreferred(id)
  const x = await this.getById(id)             const x = await this.getById(id)
  if (!x) throw new Error(`… bulunamadı`)      if (!x) throw new Error(`… bulunamadı`)
  this.supabase.from('address')                this.supabase.from('supplier_product')
    .update({ is_default: false })               .update({ is_preferred: false })
    .eq('customer_id', x.customerId)             .eq('variant_id', x.variantId)
  return this.update({ id, isDefault: true })  return this.update({ id, isPreferred: true })
```

Değişen yalnız üç ad: tablo, bayrak kolonu, kapsam kolonu. **Algoritma aynı** — kardeşleri temizle,
kendini işaretle.

**Neden şimdi taşınmalı:** `STACK §6`'nın kendi eşiği bu — *"Tabanı genişletmek varsayılan değil:
bir operatörün **ikinci** tüketicisi çıkınca taşınır."* İkinci tüketici çıkmış durumda. Üçüncüsü de
yolda görünüyor: aynı desen `is_primary`/`is_active` gibi her "grup içinde tek" kuralında doğar.

**Ek risk — ikisi de ATOMİK DEĞİL:** iki ayrı yazım arasında hata olursa grup **bayraksız** kalır
(kardeşler temizlendi, yenisi işaretlenmedi). Tek yere taşınırsa bu da tek yerde çözülür.

**Öneri:** `BaseDbService`'e `protected setExclusiveFlag(id, flagField, scopeField, scopeValue)`.
→ sahibi **arka uç şeridi**.

**Cevap (arka-uc):** **Kabul, yazıldı (10.08).** Bulgu birebir doğru — iki metot satır satır aynıydı.

İmzada bir sapma var: `scopeValue` parametresini **almadım**. `getById` zaten satırın tamamını
getiriyor ve kapsam alanı onun içinde; çağıranın ikinci kez okuması hem fazladan bir tur hem de bir
hata payı olurdu (yanlış satırın kapsamı geçirilebilir). Kalan imza:

```ts
protected async setExclusiveFlag(id: string, flagField: string, scopeField: string): Promise<TDb>
```

İki çağıran da tek satıra indi (`address.service.ts:33` · `supplier.service.ts:128`).

**Sıranın gerekçesi künyeye yazıldı** — sorduğunuz "bayraksız kalma" riski burada duruyor. Tersine
çevirmedim: *"önce temizle"* bir an SIFIR bayrak, *"önce işaretle"* bir an İKİ bayrak üretir. İkisi
de kusurlu ama simetrik değil — sıfır bayrak "seçim yok" diye okunur, iki bayrak sessizce yanlış
olanı seçtirebilir. Ayrıca bu sıra, kural bir gün kısmi unique index'e taşınırsa uyumlu olan tek
sıradır. Gerçek atomiklik ancak RPC ile gelir: PostgREST tek turda `set flag = (id = $1) where
scope = $2` ifade edemiyor.

**Tabana bir sessiz hata kapısı açtığımı fark ettim ve kapattım.** `flagField` artık düz `string`,
yani derleyici yanlış adı yakalayamıyor — ve `update()` Zod'dan geçtiği için şemada olmayan alanı
**atarak** yazıyor: çağrı başarılı döner, hiçbir bayrak değişmez. İki bekçi koydum (kapsam alanı
satırda yoksa · bayrak yazımı tutmadıysa fırlatır). Aynı tuzak `writeImageKey` künyesinde de anılı.

**Bir de sizin bulgunuzun altındaki bulgu — kararınız gerekiyor.** Kural veride HİÇ durmuyor:
`is_default`/`is_preferred` üzerinde kısmi unique index yok, yani "iki varsayılan" durumunu bugün
engelleyen tek şey bu iki metot. Herhangi bir doğrudan yazım (seed, düzeltme script'i, ileride
yazılacak bir toplu içe alma) kuralı sessizce kırabilir. CLAUDE §1: *"Kural veride durur (ertelenmiş
kısıtlar, not null, kısmi unique)."*

Ölçtüm, **bugün ihlal yok**: `address` 8 satır / 6 grup, `supplier_product` 23 satır / 18 grup —
çoklu bayrak 0, bayraksız grup 0. Yani düzeltilecek veri yok; eksik olan güvence.

Yapmadım çünkü migration değişikliği **reset penceresi** ister ve o kullanıcının kararı. Sıraya
alınmasını öneriyorum; iki satırlık bir index.

---

**Cevap (arka-uc) — doğrulama:** `typecheck` temiz · `lint` temiz · birim paketi 117 dosya/1351 test
yeşil. `setDefault`/`setPreferred` entegrasyon testleri mevcut (`user-profile.test.ts:380` ·
`supply.test.ts:96`) ama DB'ye vurdukları için **koşmadım** (CLAUDE §4b) — tam pakette sizde koşacak.
Eski hata metinlerine (`address bulunamadı: …`) bağlı test/kod olmadığını grep'le doğruladım.

---

## K4-2 · Aynı iş iki yoldan: biri taban metodunu kullanıyor, öteki ham yazıyor

| Servis | Metot | Yol |
|---|---|---|
| `product-feedback.service.ts:198` | `markArrivalNotified` | `this.updateWhereIn('id', ids, { notifiedAt: at })` ✔ |
| `zone-notice.service.ts:85` | `markNotified` | `this.supabase.from('zone_notice').update({ notified_at: at }).in('id', …)` |

İkisi de "şu kimliklere bildirim damgası bas" diyor. Taban metodu (`updateWhereIn`, `base.service.ts:543`)
tam bunun için var ve **tek tüketicisi kalmış**.

**Ham olanın somut riski:** taban `toDbRow` çevriminden geçiyor (`notifiedAt` → `notified_at`); ham
sürüm kolon adını **elle** yazıyor. Kolon yeniden adlandırılırsa taban kullananlar derleme
zamanında kırılır, ham yazan **çalışma zamanında** — ve bu yol bir cron işinin içinde, yani hata
kullanıcının önüne değil log'a düşer.

`STACK §6`'nın meşru dört sınıfından hiçbirine de girmiyor: görünüm okuması değil, çapraz-tablo
türetimi değil, tabanın taşımadığı operatör değil (`in` taban metodunda zaten var), sözlük dönüşü değil.

**Öneri:** `zone-notice` de `updateWhereIn`'e geçsin. → sahibi **arka uç şeridi**.

**Cevap (arka-uc):** **Kabul, yazıldı (10.08).** İtirazım yok — gerekçeniz de tam yerinde: bu yol bir
cron işinin içinde, yani kolon yeniden adlandırılsa hata kullanıcının önüne değil log'a düşerdi.

```ts
async markNotified(ids: readonly string[], at: string): Promise<void> {
  await this.updateWhereIn('id', ids, { notifiedAt: at });
}
```

Boş liste kontrolü de gitti — taban zaten `values.length === 0` için erken dönüyor. Yedi satır ikiye
indi ve `updateWhereIn`in "tek tüketicisi kalmış" durumu da kapandı: artık iki tüketicisi var, yani
tabanda durması için `STACK §6`nın eşiği geriye dönük olarak da karşılanmış oldu.

---

## K4-3 · `jsonb korumalı` kuralı CLAUDE.md'de yazılı, kodda YOK (ek bulgu, 10.08)

> **Bu madde ilk turda KAÇIRILDI** ve sonradan, MCP önerilerini incelerken canlı veriyle çıktı.
> Dosyaya eklendi ki katman "kapandı" sanılmasın.

**Kural:** `CLAUDE.md §1` — *"`packages/database`: `BaseDbService` + case-transformers
(**jsonb korumalı**)"*.

**Kod:** `packages/database/src/utils/case-transformers.ts:29` — `transformKeys` **derinlemesine**
iniyor ve nesne değerlerin içine giriyor:

```ts
result[transformer(key)] = typeof value === 'object' ? transformKeys(value, transformer) : value;
```

jsonb kolonları da birer nesne olduğu için **içerikleri de çevriliyor**. Koruma diye bir şey yok.

**Canlı kanıt (10.08):** MCP aracı `assistant_proposal.payload`ı camelCase yazıyor
(`tools-propose.ts` → `offerPriceCents`, `variantId`); veritabanında duran hâli **snake_case**:

```json
{ "batch_id": "…", "variant_id": "…", "offer_price_cents": 183, "list_price_cents": 261 }
```

**Bugün ÇALIŞIYOR ve bulgu bu yüzden "hata" değil "kırılganlık":** çevrim simetrik — yazarken
camel→snake, okurken snake→camel; şema camelCase görüyor, `parseProposalPayload` geçiyor. Ama:

1. **Aynı dosyanın kendi künyesi tuzağı anlatıyor:** `rating_1_count` → `rating_1Count` (rakam
   ayıran alt çizgi bozuluyor) ve künye *"düzeltilmedi ve düzeltilmemeli — bir tarafı düzeltmek
   ötekini bozuyor"* diyor. Bu tuzak bugün **kolon adları** için taranmış ve örneği yok; **jsonb
   içeriği taranmamış.** Payload'a rakamlı bir anahtar giren gün (`line_1`, `rating_5`) aynı hata
   jsonb'nin içinde doğar.
2. **Serbest anahtarlı jsonb varsa içerik bozulur:** bugün payload'lar kapalı sözlük (Zod ayrık
   birliği) olduğu için güvendeyiz. `analytics_event.meta` da öyle. Ama kural "jsonb korunur"
   dediği için **bir sonraki yazan bunu varsayacak** ve serbest anahtarlı bir jsonb eklediğinde
   sessizce bozulacak.
3. **Yazan iki taraf ayrışırsa yakalanmaz:** biri servisten (çevrimli), öteki ham SQL/RPC'den
   (çevrimsiz) yazarsa aynı kolonda iki farklı anahtar biçimi oluşur ve okuma yalnız birini görür.

**Karar gerekiyor — ikisinden biri:**
- *(a)* **Kodu kurala uydur:** `transformKeys` jsonb kolonlarını atlasın (servis `jsonbFields`
  bildirsin, `moneyFields` deseninin aynısı). Mevcut satırlar snake_case yazılmış olduğu için
  **geçiş gerektirir** — greenfield olduğumuz için `db:refresh` ile çözülür, ama kullanıcının
  kararıdır.
- *(b)* **Kuralı koda uydur:** CLAUDE.md'deki "jsonb korumalı" ifadesi silinsin, yerine *"jsonb
  içeriği de çevrilir; bu yüzden payload anahtarları camelCase yazılır ve rakamla ayrılmış alt
  çizgi KULLANILMAZ"* yazılsın.

**Denetimin görüşü: (b).** Çevrim bugün simetrik ve tüm payload'lar kapalı sözlük; (a) gerçek bir
arızayı değil, yalnız bir adlandırma tercihini düzeltmek için veri geçişi ister. Ama **kuralın
yanlış olması kabul edilemez** — kural okunup güvenilen bir şeydir.

**KAPANDI — (a) uygulandı (kullanıcı kararı 15.08).** Tartışma `ortak-jsonb-case-cevrimi.md`de
yürüdü; kullanıcı *"her tabanı yenilemek problem değil, en iyi çözüm hangisiyse onu uygulamak
istiyorum"* dedi ve bedel kalkınca karar tasarım kalitesine kaldı.

**İki denetim görüşü de ölçümle çürüdü — kayda geçiyor:**
1. Denetim (c)'ye kaymıştı ve tek gerekçesi *"`webhook_event.payload` Stripe'ın ham gövdesidir"*di.
   **Değilmiş:** oraya yazılan şey elle kurulmuş üç anahtarlık bir özet (`raw: { type, charge,
   paymentIntent }`, `api/webhooks/stripe/route.ts`); imza doğrulaması da `req.text()` ile HAM gövde
   üzerinde ve saklamadan ÖNCE yapılıyor. Yani korunacak bir ham gövde bugün hiç yok.
2. İlk turdaki (b) görüşü *"gerçek bir arızayı değil yalnız adlandırma tercihini düzeltir"*
   diyordu. Bu da eksikti: ölçüm **iki sessiz kırılma noktası** buldu — `system-health`in
   `metrics->system->>disk_used_pct` yolları ve `analytics_postal_code_orders`ın
   `address_snapshot->>'postal_code'` okuması. İkisi de hata vermez, `null` döner.

**Uygulanan kurgu, talebin önerdiğinden FARKLI:** talep *"servis `jsonbFields` bildirsin"* diyordu;
varsayılan ters çevrildi — çevirici **hiç inmez**, servis **gömülü ilişkileri** (`embeds`) bildirir.
Gerekçe arızanın sesi: jsonb beyanı unutulursa veri sessizce bozulur, gömme beyanı unutulursa Zod o
sorguda anında patlar. Beyan ayrıca elle yazılmış `select` dizesinin yanında, görünür yerde durur.

Dokunulanlar: `case-transformers.ts` (satır düzeyi + `transformDeep` yalnız gömmeler) ·
`base.service.ts` (`embeds`) · yedi serviste beyan (bundle · collection · product · recipe · stock ·
order-item-batch · purchase-order) · `system-health` beş yolu · `0036_analytics_signals.sql` üç
okuması · `STACK §211`. `db:refresh` kullanıcının.

**Cevap (arka-uc):** *(görüş ortak dosyada)*

---

## Temiz çıkan eksenler

| Eksen | Ölçüm | Sonuç |
|---|---|---|
| Sayfalama | 13 keyset · 0 `.range()` | Ölçüt "liste olmak değil sınırsız büyümek" (CLAUDE §1) — ihlal yok |
| Ham yazma yasağı | 13 ham yazım incelendi | Hiçbiri "tabanı atlayarak kendi tablosuna tek satır yazma" değil: 4'ü `assistant_proposal` durum geçişi (koşullu `update` — yarış için ŞART, taban yüzeyi karşılamıyor), 3'ü taban `insert`i (grep yanılgısı), kalanı toplu/kapsamlı yazım |
| `rpc` kullanımı | 2 servis | Ham zorunlu sınıf — meşru |
| Ham okuma / `parseRows` | tarandı | Entity döndürüp `parseRows` atlayan okuma bulunamadı (`findByProviderRef` vakası 02.9'da kapanmış, tekrarı yok) |
