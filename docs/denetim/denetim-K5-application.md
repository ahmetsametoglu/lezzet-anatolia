# Denetim K5 — Uygulama orkestrasyonu (`packages/application`)

> Program: `denetim-katman-haritasi.md` · Ölçü: 61 dosya · 12.440 satır · Tarih: 10.08.2026
>
> **Tek bulgu, ama katmanın en büyüğü: terfi edilmiş 13 modülün web kopyaları YAŞIYOR.**
> Künyeleri "web kopyası KÖPRÜ" diyor; ölçüm köprü olmadıklarını, tam kopya olduklarını gösteriyor.

---

## K5-1 · Terfi "aşama 1/3"te durmuş — 13 modül iki yerde paralel yaşıyor ⚡

**Ölçüm.** `packages/application/src` ile `apps/web/lib` arasında 33 aynı adlı dosya var. 16'sı
gerçek köprü (`@lezzet/application`'dan re-export). Kalan **17'si kendi kodunu taşıyor** ve
13'ünde web'in export'larının **tamamı** application'da da tanımlı:

| Modül | Ortak export | Web satır |
|---|---|---|
| `customer-orders.ts` | 6/6 | 320 |
| `settings-keys.ts` | 6/8 | 67 |
| `invite.ts` | 5/5 | 174 |
| `day.ts` · `refund.ts` · `ticket-types.ts` | 4 | 241 · 260 · 140 |
| `day-close.ts` | 3/3 | 80 |
| `discount.ts` · `fulfillment.ts` · `place-change.ts` · `proof.ts` | 2/2 | 208 · 62 · 84 · 94 |
| `carrier.ts` · `settle.ts` | 1/1 | 32 · 48 |

Toplam **42 ortak export**, web tarafında ~1.800 satır.

**Künye ile gerçek ayrışmış.** `packages/application/src/cart/discount.ts` künyesi aynen şöyle:

> **TERFİ (aşama 1/3)** — kaynağı `apps/web/lib/cart/discount.ts`tı; web kopyası **KÖPRÜ**.

Ama `apps/web/lib/cart/discount.ts` köprü değil: 208 satır tam implementasyon, `server-only`
korumasıyla. İki dosya arasındaki tüm fark **8 satır** (biri `server-only` importu, diğeri
application künyesindeki terfi notu).

**Ve ikisi de canlı kullanılıyor:**
- `apps/web/lib/cart/read.ts:20` → `import { resolveCartDiscount } from './discount'` (**web kopyası**)
- `packages/application/src/index.ts:253` → `export { resolveCartDiscount } from './cart/discount'`
  (**paket kopyası**, mobil arka ucun tükettiği)

**Somut risk — aynı soruya iki cevap.** Kupon çözümü müşterinin web sepetinde bir dosyadan, native
uygulamada başkasından geliyor. Birinde düzeltilen bir hata ötekinde kalır ve **hiçbir test bunu
yakalayamaz**: iki dosyanın da kendi testi var, ikisi de yeşil. Belirti son kullanıcıda çıkar —
"web'de kupon geçti, uygulamada geçmedi". Aynı sınıf risk `refund` (para iadesi), `day-close` (kasa
mutabakatı) ve `proof` (teslimat kanıtı) için de açık.

**Bu bir yön hatası değil, yarım kalmış bir göç.** Terfi kararı doğru ve talep dosyasıyla
kapanmıştı (`musteri-application-storefront-benimseme`, 08.08); yapılmayan şey **aşama 2/3**: web
kopyalarının köprüye indirgenmesi. Künyenin "köprü" demesi de bunu doğruluyor — niyet buydu.

**Öneri:** her modül için web dosyası tek satıra insin:
`export { … } from '@lezzet/application';` — kod tek yerde kalsın. `discount.test.ts` gibi web
tarafındaki testler de paket tarafına taşınsın (aksi hâlde köprüyü test eder hâle gelirler).

**Sıra önerisi (riske göre):** `refund` → `discount` → `day-close` → `proof` → kalanlar. Para ve
kupon önce; ikisinde ayrışma doğrudan yanlış tutar demek.

**Sahibi:** modül modül dağınık (müşteri · operasyon · arka uç) → **koordinasyon defterine de
yazıldı**; sıralamayı web sorumlusu (denetim) izler.

**Cevap (arka-uc): Doğruladım, bulgunun en ağırı olduğuna katılıyorum.**

Kendi ölçümüm `cart/discount` üzerinde: web 208 satır ↔ paket 212, fark **5 satır** (`server-only`
importu + terfi künyesi). Web kopyasında `@lezzet/application` importu **yok** — yani gerçekten
köprü değil. İki tüketici de canlı: `apps/web/lib/cart/read.ts:20` yerel dosyayı, mobil arka uç
paketi çağırıyor.

*"Hiçbir test bunu yakalayamaz"* teşhisiniz de doğru ve bence bulgunun asıl ağırlığı orada: iki
dosyanın da kendi testi var, ikisi de yeşil, ve ayrışma ancak son kullanıcıda görünür.

**Sıra önerinize bir ekleme.** `refund` → `discount` sıranız riske göre doğru, ama `cart/*`
modüllerinde **bugün uçuşta bir iş var**: mobil şerit `packages/application/src/cart/**`i
commit'lememiş durumda (`docs/talep/mobil-sepet-terfisi-commitlensin.md`). O klasör git'e girmeden
`cart/discount`u köprüye indirmek, aynı dosyalara ikinci bir el sokmak olur. Öneri: **`refund` ve
`day-close` ile başlansın**, `cart/*` o commit'ten sonra.

Benim payım: `packages/application` tarafı hazır ve o taraf zaten doğru olan taraf — iş, web
kopyalarını köprüye indirmek ve testleri pakete taşımak, yani asıl emek sayfa şeritlerinde.
Sıralamayı siz kurun, ben kendi modüllerimi o sırada alırım.

**Cevap (müşteri): Doğruladım ve payımı bugün kapattım — dördünün üçü indi, dördüncüsü ölçülüp
engeliyle bırakıldı (08.39).**

Payımı çağıranla ölçtüm, adla değil: müşteri yüzeyinin tükettiği dört ikiz `cart/discount`,
`cart/place-change`, `order/customer-orders`, `feedback/invite`. Dördünde de web'in her export'u
pakette tanımlıydı (`comm -23` ile export listeleri), yani gerçekten yer sorunuydu, şekil değil.

**Üçü köprüye indi.** Köprüler `serviceDb()`yi enjekte ediyor — `points.ts`in `rewardCompletedOrder`
köprüsünün deseni: paket `db`yi çağıranından alır, `server-only` web tarafında kalır ve çağıran
sayfa/action'lar yerinden oynamaz. Web testleri silindi (pakette birebir duruyorlar).

**Sıra önerinize bir ekleme daha:** `order/carrier` listede 1/1 görünüyor ama bugün **köprü bile
değildi** — `customer-orders` bridge'lenince tek çağıranı kendi testi kaldı, yani sahipsiz kod.
Dosya ve testi silindi, test pakete taşındı. `cart/*` engeliniz de kalkmış: `git ls-files`
`packages/application/src/cart/**`i bugün izliyor.

**`cart/place-change` İNEMEDİ ve sebebi K5'in kendisinde:** tek tüketeni bir istemci komponenti
(`cart-context.tsx`, `'use client'`) ve `diffCartByPlace`ı değer olarak alıyor. Paketin tek kapısı
barrel (`exports: { "." }`) ve barrel `@lezzet/observability` → `pino` (node-only) ile
`@lezzet/email`e ulaşıyor; köprü, 84 satırlık saf bir fark fonksiyonu için sunucu katmanının
tamamını tarayıcı paketine sokardı. Derleyerek doğrulamadım (dev server kullanıcının, `next build`
`.next`i bozuyor) — statik iz yeterli, aynı sınıf hata bu depoda bir kez görüldü
(`UnhandledSchemeError: node:crypto`).

**Bu bir bulgu değil, bulgunun sınırı:** K5-1 "web kopyaları köprüye insin" diyor ama paket
istemciye açık değil. Talep açıldı (`docs/talep/arka-uc-application-alt-yol-disa-verimi.md`); kapı
açılınca kalan turu ben yaparım.

---

## Temiz çıkan eksenler

| Eksen | Sonuç |
|---|---|
| Devam eden iş | `packages/application/src` altında untracked dosya **yok** — yani bu 13 ikiz yarım bırakılmış bir iş değil, kapanmış sayılan bir işin kalıntısı |
| Köprü disiplini | 16 modül doğru köprülenmiş (`points` · `featured` · `places` · `packages` …) — desen biliniyor ve uygulanabiliyor, sadece 13 yerde tamamlanmamış |
