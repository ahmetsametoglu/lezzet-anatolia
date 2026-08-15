# Envanter — `docs/talep` + `docs/denetim` (15.08.2026)

> **Neden bu dosya var.** Kullanıcı kararı 15.08: proje artık **tek ajanla** yürüyor. `docs/talep`
> şeritler arası iletişim için kurulmuştu (*"X şeridi Y şeridinden şunu istiyor"*) — o mekanizmanın
> muhatabı kalmadı. Ama dosyaların İÇERİĞİ değerli: ölçülmüş, gerekçelendirilmiş, `dosya:satır`
> verilmiş açık işler.
>
> **Bu dosya envanterdir, karar değildir.** Silme kullanıcının kararıdır ve sırası bağlayıcıdır:
> **önce indir, sonra sil.** `docs/talep` `.gitignore`ın 21. satırında — silinen dosya **geri
> gelmez**, yedeği yoktur. `docs/denetim` ise git'te izleniyor (silinse geri alınabilir).
>
> Envanter 41 talep + 11 denetim dosyasının okunmasıyla çıkarıldı; kapanma iddiaları koda karşı
> **doğrulandı** (aşağıda hangi ölçümle olduğu yazılı).

---

## A · KAPANMIŞ — indirilecek bir şey yok, silinebilir (9 dosya)

Hepsinin ya cevabı "yapıldı/karşılandı" diyor ya da bugünkü kodla doğrulandı.

| Dosya | Doğrulama |
|---|---|
| `arka-uc-product-listing-satir-semasi.md` | Cevap: *"Yapıldı (07.08)"* — `ProductListingRowSchema` var |
| `musteri-application-storefront-benimseme.md` | Cevap: *"Karşılandı (08.08) … bu dosyayı silebilirsiniz"* |
| `not-arka-uc-detay-birincil-boy-alani.md` | `git show HEAD:…/storefront-types.ts \| grep primaryVariantId` → **1** ✓ |
| `not-arka-uc-iki-isim-commitinize-bagli.md` | Beklenen tipler HEAD'de; `variant-choice.ts` **silinmiş** ✓ |
| `not-mobil-detay-en-pahali-boyu-secili-aciyor.md` | `21.53`'te kapandı (mobil detay `primaryVariantId` okuyor) |
| `arka-uc-application-alt-yol-disa-verimi.md` | Kendi başlığı: *"KAPANDI (10.08) … sizden bir iş kalmadı"* |
| `not-arka-uc-proposal-testi-inline-moduyla-kirmizi.md` | 15.08 tam paket: `proposal.test.ts` **yeşil** ✓ |
| `not-mobil-kunye-kaymasi-cart-warehouse.md` | Geçmiş olay bildirimi; dersi CLAUDE.md §0'da yazılı |
| `not-mobil-yer-sozlesmesi-uc-hal.md` | Kendi metni: *"Okuyunca silebilirsiniz"* |

---

## B · KALICI DEFTER — silinmez (4 dosya)

Bunlar talep değil, modül hafızası. Tek ajanda bile değerlerini korurlar: içlerinde alınmış
kararlar ve ölçümler var, hiçbiri başka yere işlenmemiş.

- `koordinasyon-web-mobil.md` (80 KB) — web ↔ native defteri. **En büyük dosya ve en çok kalıcı
  karar burada.** Tek ajanda "iki sorumlu" protokolü anlamsızlaştı ama içeriği taranmadan silinemez.
- `inceleme-analitik-web-native.md` — analitiğin native boşluğu; karar kullanıcının, `ANALYTICS.md`'ye
  işlenecek. **Henüz işlenmedi.**
- `bildirim-modulu-web-mobil.md` — bildirim modülü (kayıt · uygulama içi · push). **Üç girdi de
  "AÇIK — cevap bekliyor"**; bugün üç katmanın da hiçbiri yok (ölçüldü 09.08).
- `not-mobil-test-defteri.md` — mobil test kayıtları.

---

## C · GERÇEK AÇIK İŞ — indirilmeli, sonra silinebilir (28 dosya)

### C0 · Bugünü doğrudan engelleyenler

**1 · `arka-uc-seed-asistan-onerileri.md` — ❌ REDDEDİLDİ (kullanıcı kararı 15.08), kova A'ya geçti**
Seed `assistant_proposal` yazmıyor; her `db:refresh` kuyruğu boşaltıyor (15.08: 31 → 0).
**Kullanıcı besleme dosyasına öneri yazılmasını istemiyor:** öneriler CANLI alınacak, çünkü
seed'in ürettiği payload ajanın gerçekten kurabileceği payload değildir — ekran yeşil görünürken
zincir kırık olabilir. Karar ve kabul edilen bedeli `docs/build/22-mcp-asistan.md` sonundaki
**KARAR (kullanıcı, 15.08)** bölümüne işlendi. **Dosya artık silinebilir.**

**2 · `not-denetim-min-basket-testleri-eski-esikte.md` + `not-denetim-e2e-asgari-sepet-esigi-kuresel-satirla-carpisiyor.md`**
Aynı kökün iki yüzü. 10.08'de kapıya-teslime 40 € taban geldi; testler eski eşikte kaldı.
**15.08 tam paketinde hâlâ 9 düşüş** (`checkout-draft` 8 + `checkout-options` 1) ve `e2e/customer/edge-min-basket.smoke.ts`
13 € yazıyor. Not üç seçenek de öneriyor (birincisi: fikstüre `priceCents` parametresi).
→ **Kayıt yeri: `docs/build/08-musteri-app.md` (08.40) altına.**

**3 · `ortak-jsonb-case-cevrimi.md` — kullanıcı kararı bekliyor**
`CLAUDE.md §1` *"jsonb korumalı"* diyor, `case-transformers.ts:29` korumuyor. Repoda iki biçim
yan yana: `assistant_proposal.payload` snake_case, `error_log.context` camelCase. Asıl risk
`webhook_event.payload` — Stripe'ın **ham gövdesi** çevrilirse saklanan şey artık "gelen gövde"
değil. Üç seçenek yazılı; denetimin görüşü **(c) karma**. Dört şeridin görüş bölümü **boş kaldı**.
→ **Karar kullanıcının;** çıkınca `CLAUDE.md §1` + `denetim-K4-database.md § K4-3` kapanır.

### C1 · Müşteri yüzeyi

| Dosya | Açık olan | İneceği yer |
|---|---|---|
| `musteri-liste-fiyati-baslangic.md` | Madde 1: kartta **"…'dan"** eki (madde 2 `08.35`'te yapıldı) | `08-musteri-app` (08.10) |
| `musteri-asgari-sepet-cumlesi.md` | Web'de cümleye *"ara toplamınıza"* eklenmesi (`PlaceRestriction`) | `08-musteri-app` |
| `not-denetim-adres-posta-kodu-secilebilir.md` | Web adres formunda posta kodu **seçilecek**; mobil tarafı bitti, `suggestPlaces`/`PlaceOptionListSchema` hazır | `08-musteri-app` |
| `musteri-puan-sistemi-web-gorusu.md` | **Davet altyapısı (müşteri + sefer) web şeridinin işi** — kullanıcı kararı 11.08 | `17-geri-bildirim-puan` |
| `musteri-e2e-senaryo-tavsiyeleri.md` | 6 senaryo; **S1 ve S3 birer açık** (senaryo değil, gerçek boşluk) | `00-iskelet` (00.9) |

### C2 · Operasyon yüzeyi

| Dosya | Açık olan | İneceği yer |
|---|---|---|
| `operasyon-kargo-numarasi-girisi-yok.md` | `setShipment`'in yüzeyi yok; kabul edildi, `07.12` turuna bırakıldı | `07-siparis` (07.12) |
| `operasyon-segment-disa-alma-tasarimi.md` | Dışa alma düğmesi + kapı **aynı turda**; kapının tasarımı hazır (4 karar verilmiş) | `13-analitik` (13.5) |
| `operasyon-vitrin-gorselleri-sekmesi.md` | Arka uç hazır (`site_image`), sekme yazılmadı | `09-admin` (09.16) |
| `operasyon-katalog-vitrin-isaretleri.md` | Yalnız madde 3: kategori `tagline` **yazma yüzeyi** (kolon+şema var, servis taşımıyor) | `05-katalog` |
| `operasyon-belgeden-urun-onizlemesi.md` | `22.6` önizlemeleri + `product_create`'te `categoryId` null hâli | `22-mcp-asistan` (22.6) |
| `operasyon-e2e-senaryo-tavsiyeleri.md` | 6 senaryo, beşi aynı sınıftan: **bayat ekran kopyası** | `00-iskelet` (00.9) |
| `not-operasyon-varyant-sirasini-kimse-yazmiyor.md` | ⚠ **ÖLÇÜMÜ YANLIŞ — aşağıda düzeltildi** | — |

> **`not-operasyon-varyant-sirasini-kimse-yazmiyor.md` düzeltmesi (denetim, 15.08).**
> Not *"`syncVariants`'ın kaynak ağacında HİÇ ÇAĞIRANI YOK"* diyor. **Yanlış:**
> `apps/web/lib/catalog/product-actions.ts:102` çağırıyor ve 11.08'den beri orada (`0fe62fbd`).
> Ama notun **sonucu yine de doğru**, sebebi başka: o çağrı bir operatör ekranı değil, **MCP
> `product_draft` önerisinin uygulanma yolu.** Yani varyant sırasını bugün yazabilen tek şey
> asistandır; operatörün elinde kaldıraç yok.
> **Ve bundan yeni bir risk doğuyor:** onaylanan bir `product_draft` önerisi varyant taşıyorsa
> `sort_order`'ı **yeniden yazar** — operatörün dizilişini asistan sessizce ezebilir. Bu ölçülmedi,
> `BEKLEYEN` olarak kaydedilmeli.

### C3 · Arka uç / paketler

| Dosya | Açık olan | İneceği yer |
|---|---|---|
| `arka-uc-seed-rota-disi-kargo-deposu.md` | Seed **iki gruplu sepet** senaryosunu hiç üretemiyor → `shipping` yolu gerçek veriyle hiç sınanmadı | `19-coklu-depo` |
| `not-herkese-application-barreli-istemciye-girmesin.md` | İki iş: `lib/storefront/featured.ts`'e **`server-only` yok** (ölçüldü 15.08: 0 eşleşme) · kuralın `docs:check`'e indirilmesi önerisi | `00-iskelet` / `08-musteri-app` |
| `arka-uc-e2e-senaryo-tavsiyeleri.md` | 6 senaryo; biri (VIES) dış servise bağlı | `00-iskelet` (00.9) |
| `denetim-paket-stok-ve-depo-okumasi.md` | İnceleme bitti; **paket kalemleri iki depoya dağıldığında müşteri son onaydan sonra yanlış cümleyle düşüyor** — düzeltmeler açık | `05-katalog` (05.5) / `19-coklu-depo` |
| `statik-metin-soz-denetimi.md` | İki açık madde: `bank_transfer`/`cheque` yalnız B2B'ye · hesap silme + sipariş anonimleştirme | `08-musteri-app` (08.8) |
| `talep-web-teslimat-talebi-kaydi.md` | `delivery_interest` kuvvetli/zayıf sinyal — kayıt `19.24`'te, **doğrulanmalı** | `19-coklu-depo` (19.24) |

### C4 · Asistan (22.x) — çoğu teslim edildi, kalanı doğrulama

| Dosya | Durum |
|---|---|
| `operasyon-oneri-onayi-formun-icinde.md` | *"Teslim edildi (22.8)"* — iki soru cevapsız (arşiv özeti · sıradaki tip) |
| `operasyon-asistan-kuyrugu-uc-kapili-karar.md` | `22.5` teslim edildi |
| `operasyon-firsat-karti-talimat.md` | Talimat dosyası; `batch_offer` kartı yazıldı. **`zone_extend` haritası hâlâ açık** |

### C5 · Bilgi notları — okunup silinebilir

- `not-mobil-tarifler-okuma-sozlesmesi.md` — 05.16 bitti; 09.21 + 08.24 zaten görev satırlarında
- `not-mobil-sepet-yarisi-web-native.md` — kullanıcı işaret edince değerlendirilecek (kendi metni)
- `not-mobil-talep-maili-duzeltildi-genislik-acik.md` — tek açık: mail kartı genişliği; kaydı `BEKLEYEN(14.7)`'de duruyor, **ölçüm kullanıcının cihazında**

---

## D · `docs/denetim/` — 11 dosya (git'te izleniyor)

`README` yaşam döngüsü: *"TÜM maddeleri kapanan dosya SİLİNİR."*

| Dosya | Durum |
|---|---|
| `denetim-katman-haritasi.md` | Program dosyası, 11/11 katman tarandı. **Bulgu dosyalarının tamamı kapanınca silinir** |
| `denetim-K1-veri-semasi.md` | Şema disiplinli, 2 hafif kayıt — cevaplanmış, kapanmaya yakın |
| `denetim-K2-tipler.md` | Duplikasyon düzeltildi; 1 kural boşluğu |
| `denetim-K3-domain-core.md` | 1 düzeltildi; **KDV bölmesi testsiz** (7 yerde kullanılıyor) açık |
| `denetim-K4-database.md` | 2 duplikasyon; **K4-3 jsonb** → `ortak-jsonb-case-cevrimi.md`'ye bağlı, kullanıcı kararı bekliyor |
| `denetim-K5-application.md` | ⚡ **EN AĞIR ve HÂLÂ AÇIK.** 13 modül iki yerde. `08.39` aşama 2/3 bitti, **3/3 duruyor** — 15.08 `knip` bunu dört ölü dosyayla gösteriyor (`lib/order/reserve.ts`, `lib/cart/discount.ts`, `lib/delivery/places.ts`, `lib/settings-scope.ts`) |
| `denetim-K6-K7-paketler-backend.md` | Temiz; tek kayıt TS sürüm ayrışması (koordinasyon defterinde) |
| `denetim-K8-web-lib.md` | DB'ye vurmayan 19 test entegrasyon kuyruğunda — **doğrulanmalı** |
| `denetim-K9-K10-K11-yuzeyler.md` | 2 hafif kayıt (adlandırma düzeyinde) |
| `backlog-operasyon-web.md` | ⚡ **16 açık, 0 kapalı.** Kullanıcının 14.08 arayüz testlerinden. `OB-01` bloke edici: yeni rota tanımlarken depo seçilemiyor |

---

## Özet — sayılarla

| Kova | Adet | Ne yapılacak |
|---|---|---|
| A · kapanmış | 9 | Silinebilir (kullanıcı kararı) |
| B · kalıcı defter | 4 | Silinmez; içeriği kalıcı yerlere işlenmeli |
| C · açık iş | 28 | **Önce görev satırına indir, sonra sil** |
| D · denetim | 11 | 8'i kapanmaya yakın · K5 ve `backlog-operasyon-web` ağır ve açık |

**En değerli üç bulgu:**
1. Seed öneri yazmıyor → her `db:refresh` asistan ekranını körleştiriyor (**bugün yaşandı**)
2. `min_basket` 9 test her koşuda kırmızı → kök 5 gündür biliniyor, düzeltilmedi
3. `product_draft` uygulanınca varyant `sort_order`'ını ezebilir (**bu envanterde ölçüldü, kaydı yok**)
