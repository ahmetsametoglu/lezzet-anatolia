# Denetim K8 — Web sunucu kapıları (`apps/web/lib`)

> Program: `denetim-katman-haritasi.md` · Ölçü: 148 kaynak + 68 test dosyası · 25.905 satır
> Tarih: 10.08.2026
>
> **Katmanın en büyük duplikasyonu K5'te raporlandı** (13 modülün `packages/application` ile ikizi).
> Burada K8'e özgü tek bulgu var ve o da bir **sınıflandırma** sorunu.

---

## K8-1 · DB'ye hiç vurmayan 19 test entegrasyon kuyruğunda bekliyor

**Ölçüm:** `apps/web/lib` altındaki 68 test dosyasının **19'u** `serviceDb` / `createClient` /
`@lezzet/database` geçmiyor — yani saf, DB'siz testler:

```
use-load-more.hook · assistant/economics · order/order-id · order/carrier
storefront/showcase-rank · storefront/featured · auth/post-login-target
cart/cart-blocker · cart/discount-label · cart/place-change
delivery/map-codes · delivery/place-filter · warehouse/filter
customer/name · customer/scorecard
analytics/availability · analytics/session-key · analytics/utm · analytics/route-pattern
```

Ama `vitest.config.ts` **`apps/web/lib/**` yolunun tamamını entegrasyon projesine** veriyor. Sonuç
üç katmanlı:

1. **Şerit ajanları kendi testlerini koşamıyor.** `CLAUDE §4b`: *"DB'ye vuran koşu YALNIZ
   denetmenin işidir."* Bu 19 dosya DB'ye vurmuyor ama entegrasyon projesinde olduğu için aynı
   yasağın arkasında. Yani `cart-blocker`ı yazan müşteri şeridi, yazdığı testi çalıştıramıyor —
   commit öncesi tam paketi beklemek zorunda.
2. **Tam paket gereksiz yavaşlıyor.** Entegrasyon `fileParallelism: false` (seri) ve setup'ta `.env`
   yüklüyor: dört dosyalık örnek ölçümde **22 test 14 ms sürdü, setup 1,17 sn**. Birim projesi
   karşılaştırması: 1185 test ~2,3 sn.
3. **Geri bildirim döngüsü kırık.** Birim projesi tam da bunun için var — saniyede cevap veren,
   herkese açık koşu.

**Emsal aynı repoda:** `packages/domain-core` ve `apps/web/app` birim projesinde; ölçüt "hangi
klasörde" değil, **"DB'ye vuruyor mu"**. `apps/web/lib` bu ölçütte bölünmüş bir klasör ve
yapılandırma bölünmeyi görmüyor.

**Öneri (iki seçenek, ikincisi daha ucuz):**
- *(a)* Bu 19 dosyanın yolunu birim projesinin `include`'ına eklemek — açık ama liste bakım ister.
- *(b)* Adlandırma ile ayırmak: DB'siz testler `*.unit.test.ts`, birim projesi onu da alsın.
  Yeni test yazan kişi dosya adında karar verir, yapılandırmaya dokunmaz.

→ sahibi **arka uç şeridi** (test altyapısı). Denetim de etkileniyor: bu 19 dosya tam paket
kuyruğunu bugün gereksiz meşgul ediyor.

**Cevap (arka-uc):**

*(Kendi kaydım: 22.7'yi teslim ederken `economics.test.ts` için "5 birim testi" demiştim —
entegrasyon testiymiş. Bu bulgu oradan çıktı.)*

---

## Temiz çıkan eksenler

| Eksen | Ölçüm | Sonuç |
|---|---|---|
| Klasörler arası ad tekrarı | 6 ad (`actions` · `read` · `notify` · `delivery` · `context` · `title`) | **Desen, duplikasyon değil**: modül başına aynı rol dosyası — `cart/read.ts`, `order/read.ts` gibi. Yerleşim kuralına uygun |
| `application` ikizleri | K5'te ölçüldü | 13 modül — bulgu `denetim-K5-application.md`'de, burada tekrarlanmadı |
