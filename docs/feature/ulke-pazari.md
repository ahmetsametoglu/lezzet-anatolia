# Ülke pazarı — Strasbourg'dan Almanya'ya satış, ülkeye özel fiyat ve KDV

> **Statü: KARAR ALINDI (12.10.2026), uygulama başlıyor.** Özelliğin tek kaydı bu dosya: yasal zemin, kararlar, hedef model,
> yol haritası ve açık işler burada tutulur; iş `docs/KALAN.md`'ye satır olarak açılmaz. Muhasebe zemini
> [`kasa-muhasebe.md`](kasa-muhasebe.md), iki işin ayrımı [`iki-is.md`](iki-is.md)'dedir. İş yöneticinin altında iki ajanla
> yürür: **[A]** model ve arka uç, **[B]** tasarım ve ekranlar, **[Y]** yönetici (karar, inceleme, belge, commit, cihaz denemesi).
> Bu, `CLAUDE.md`'deki alt ajan yasağına kullanıcının bu özellik için açık istisnasıdır (kasa-muhasebe 13. kararın emsali).

## 1. Yasal zemin

- **Uzaktan satış:** satıcının taşıdığı ya da taşıttığı mal Fransa'dan başka bir AB ülkesindeki tüketiciye giderse uzaktan
  satıştır. AB'ye uzaktan satışların toplamı içinde bulunulan ya da önceki takvim yılında KDV hariç **10.000 €**'yu geçmedikçe
  Fransız KDV'si uygulanır; geçince varış ülkesinin KDV'si uygulanır ve beyan Fransa'daki AB tek beyan noktasından (OSS) yapılır.
  Eşik beklenmeden varış ülkesi KDV'si seçilebilir; bu özellikte seçilmez (3. karar).
- **Yerel satış:** mal Almanya'da depolanıp oradan satılırsa satış Almanya'da yerel satıştır, eşik işlemez ve Alman KDV'si ilk
  satıştan gerekir ([`DOMAIN.md`](../architecture/DOMAIN.md) §5). Bizim düzenimiz bu değil: mal Strasbourg'da durur.
- **Oranlar ülkeye göre farklı sınıflanır:** şekerleme (lokum) Fransa'da %20, Almanya'da %7; şişe su ve alkolsüz içecek Fransa'da
  %5,5, Almanya'da %19. Ürünün Alman oranı Fransız oranından türetilemez, ürün başına girilir.
- **İşletme satışı:** geçerli AB vergi numaralı Alman işletmeye satış KDV'den muaftır (ters yükleme); numara doğrulanmamışsa
  Fransız KDV'si uygulanır. Eşiğe yalnız tüketici satışı girer.

## 2. Kararlar (kullanıcı, 12.10)

| # | Karar | Sonucu |
|---|---|---|
| 1 | **Almanya paketi Strasbourg'da hazırlanır, Almanya'da taşıyıcıya verilir** (21.09 düzeni) | Depo fiziksel olarak Fransa'da kalır; Almanya gönderisinin taşıyıcıya göre çıkışı Almanya'daki teslim noktasıdır, tarife yurt içi Almanya. |
| 2 | **Ülkeye özel fiyat hem tüketici hem işletme fiyatında** | Ülke fiyatı yoksa genel fiyat geçerli; ülke fiyatı genel fiyatın yerine geçer. |
| 3 | **Alman KDV'si eşik aşılınca uygulanır** | Eşiği aşan sipariş ve sonrakiler Alman oranıyla yazılır; geçiş otomatik. Tüketici fiyatı KDV dahil olduğu için etiket değişmez, net gelir değişir. |
| 4 | **Uçtan uca, testli, tasarım Claude Design'da onayla; bitince Oppo'da çevrim içi deneme; iki ajanla** | Yol haritası §5. |
| 5 | **Ülke bilinmezken Almanca arayüz Almanya fiyatını gösterir** | Fransızca ve Türkçe arayüz genel fiyatı gösterir; adres seçilince adresin ülkesi geçerlidir. |
| 6 | **Almanya KDV oranı baştan zorunlu** | Oranı girilmemiş ürün Almanya'daki tüketiciye satılmaz. İşletme satışında Alman oranı kullanılmadığı için orada zorunlu değildir (yönetici yorumu, kullanıcı onayında). |
| 7 | **Otomatik fiyat tam euro ya da 50 sente yukarı yuvarlanır** | Nakit ödemede küsurattan kaçınmak için. Yön yukarı, çünkü aşağı yuvarlanan fiyat hedef marjı ıskalar. Otomatik fiyatlı üründe Almanya fiyatı da hedef marjdan, Almanya'da uygulanan KDV oranıyla hesaplanır. Adım ayardır (varsayılan 50 sent), bugünkü 5 sentlik sabit adımın yerine geçer. Elle yazılan fiyatı veren kişi tam fiyat verir; yüzdeyle türeyen fiyatlar (fiyat grubu, müşteri kuralı, kupon) yuvarlanmaz, çünkü verilen oran bozulur. |
| 8 | **Ekranlar onaylandı** (Claude Design 2. tur, `07-kesif/Kesif - Ulke Pazari.dc.html`) | Ürünler kırılımı 1a, Fiyatlar 2a·2, Depolar 3a, eşik ve OSS kartı 4a (Raporlar › Muhasebe export). Her fiyat hücresi kendi marjını yazar; Almanya sütun başlığı tek satır "B2C (DE)" / "B2B (DE)". |

**Varsayılanlar** (parametrik): müşteriye özel fiyat ve near-expiry teklifi ülkeden bağımsız; fiyat grubu yüzdesi ülkenin işletme
listesine uygulanır; eşik uyarıları %80 ve %95; sistem dışı AB uzaktan satış tutarı için açılış ayarı (bu yıl ve önceki yıl,
varsayılan 0); gel-al ve yerinde satışta ülke deponun ülkesidir (mal Fransa'da el değiştirir).

## 3. Bugünkü durum (ölçüldü, 12.10)

| Konu | Bugün | Yer |
|---|---|---|
| Depo ülkesi | Tek kolon üç iş görüyor: malın yeri, kargo yapılan ülke, taşıyıcıya gönderen | `warehouse-resolve.ts` `findShippingWarehouse`; `shipping/quote.ts` ve `dispatch.ts` `senderOf` (iki kopya) |
| Ülke başına kargo deposu | Deponun kendi ülkesine bağlı tekil indeks | `0031_warehouse.sql` `warehouse_single_online` |
| Almanya'ya sipariş | Açılamıyor: gerçek veride tek kargo deposu Strasbourg (FR), rota bölgesi yalnız FR | `checkout-draft.ts` `no_shipping_warehouse`; `scripts/seed-real/data.ts` |
| Fiyat | Varyant × kanal × isteğe bağlı müşteri × geçerlilik; ülke yok | `0005_catalog_product.sql` `price` |
| KDV oranı | Ürün başına tek oran (FR; formda 5,5 / 20); sipariş kalemi uygulanan oranı saklıyor | `product.vat_rate`; `order_item.vat_rate` |
| KDV kararı | Kanal, varış ülkesi ve vergi numarasından; malın çıktığı ülkeye bakmıyor | `tax/vat-treatment.ts` |
| Eşik | `countsTowardOssThreshold` hesaplanıyor, okuyan yok | `vat-treatment.ts`; `DOMAIN.md` §5 "izler ve uyarır" diyor |
| Kasa | Kalem oranı kasaya yazılıyor; kasada tanımsız oranda kargo ürünü açılamıyor | `register/hiboutik/client.ts` `taxIdOf`, kalem `vat` |
| Native sepet | Ülkesiz okuyordu (KALAN K.27); mobile-api `country` parametresini alıyor | `apps/mobile-api/src/api/v1/cart-view.ts`, `catalog.ts` |

## 4. Hedef model

**Depo ve kargo.** Depo yalnız fiziksel ülkesini tutar. `warehouse_ship_country (warehouse_id, country, handover)` deponun kargo
yaptığı ülkeleri ve o ülkenin paketinin taşıyıcıya verildiği adresi tutar (boşsa deponun adresi). Her ülkeye en çok bir aktif
depo kargo yapar (veritabanında). Yalnız Lezzet'in tesisi satır alır. `ships_online` kolonu kalkar; kargo deposu olmak en az bir
gönderim ülkesi demektir. Gönderen tek yardımcıdadır: `senderOf(warehouse, destinationCountry)`.

**Fiyat.** `price.country` boşsa her ülkede, doluysa o ülkede geçer; müşteri satırında ülke boştur. `resolvePrice` ülkeyi alır:
kanal listesi önce ülke satırı, yoksa genel satır; grup yüzdesi ve müşteri kuralı bu listeden hesaplanır, sıralama aynı kalır.
Fiyatın okunacağı ülke tek kuraldan gelir: yerin ülkesi; yer yoksa Almanca arayüzde DE, öteki dillerde genel; gel-alda deponun
ülkesi.

**KDV.** `product.vat_rate` satıcının ülkesinin (FR) oranıdır. `product_vat_rate (product_id, country, vat_rate)` öteki ülkelerin
oranını tutar. KDV kararı çıkış deposunun fiziksel ülkesini, varış ülkesini, kanalı, vergi numarasını ve eşik durumunu alır;
`treatment` ve oranın hangi ülkeden okunacağını döner. Yeni türler: `intra_eu_distance_origin` (eşik altı, FR oranı) ve
`intra_eu_distance_oss` (eşik üstü, varış oranı). Çıkış ülkesi FR değilse karar reddeder. Alman oranı eksik ürün Almanya'daki
tüketiciye satılmaz: vitrin bugünkü "satışa kapalı" yolunu kullanır, checkout ve personel siparişi aynı kararla reddeder.

**Eşik.** Toplam, iptal edilmemiş uzaktan satış siparişlerinin KDV hariç ücretlenen tutarıdır, iade düşülür; aktarımın tutarıyla
aynı kaynaktan türer. Karar sipariş yazılırken verilir. Eşiğe aynı anda düşen iki siparişin ikisi de Fransız oranıyla yazılabilir;
bilinen sınırdır. Günlük iş %80 ve %95'te yönetime ve muhasebeye yılda birer kez bildirir; Pano'da satır durur.

**Kasa ve muhasebe.** Kalem oranı kasaya bugünkü yoldan gider; Hiboutik'te %7 ve %19 tanımlı olmalı. Muhasebe dökümüne OSS özeti
eklenir (çeyrek × varış ülkesi × oran). Pennylane'in Hiboutik eşlemesinde Alman KDV'sinin hesabı muhasebeciyle kurulur.

**Ekranlar.** Operasyon: Depolar (gönderim ülkeleri, teslim noktası), Ürünler kırılımı ve Fiyatlar › Kanallar (ülke fiyatı), ürün
formu (Almanya oranı), ürün listesinde "Almanya oranı eksik" süzgeci, Ayarlar (eşik), Pano satırı, eşik ve OSS kartı. Müşteri:
yeni görsel öğe yok; fiyat ülkeyle okunur, "Almanya'da satılmıyor" bugünkü kapalı hâlin metnidir. Native müşteri uygulaması ülkeyi
yerle birlikte gönderir.

## 5. Yol haritası

| Aşama | İş | Kim |
|---|---|---|
| 0 | Bu dosya; Faz 4 satış faturası şeridiyle ortak dosyaların sırası | Y |
| 1 | Şema (0005, 0012, 0013, 0031), tipler, domain-core kararları (depo, fiyat, KDV, eşik, fiyat ülkesi) ve birim testleri; şemanın zorunlu kıldığı servis uyarlamaları, Fransa davranışı değişmeden | A |
| 1 | Bugünkü ekranların görüntüsü; Claude Design'da kareler (Ürünler kırılımı, Fiyatlar › Kanallar, Depolar kartı, eşik ve OSS kartı) | B |
| 1 | İnceleme ve commit; kullanıcıdan `db:refresh`; karelerin kullanıcıya sunumu ve onay | Y |
| 2 | Servisler, uygulama katmanı, mobile-api, eşik işi, kargo göndereni, entegrasyon testleri; Hiboutik ve Sendcloud ölçümü | A |
| 2 | Onaylı ekranlar, diyaloglar, müşteri web ve native ülke akışı, operasyon mobil; UI testleri | B |
| 3 | `DOMAIN.md` §5 ve §17, veri modeli (`pnpm docs:sync`), INTEGRATIONS, GELECEK K.37, KALAN K.27; runbook (Hiboutik %7 ve %19, Pennylane OSS hesabı, Sendcloud teslim adresi); simülatör turu; Oppo'da çevrim içi deneme | Y |

## 6. Testler

- Depo: iki ülkeye kargo yapan depo Almanya adresine çözülür; ikinci depo aynı ülkeyi alamaz; araç ve QUALITE ülke alamaz.
- Fiyat: ülke satırı genel satırı ezer (tüketici ve işletme); ülke satırı yoksa genel; grup yüzdesi ülke listesine uygulanır;
  müşteri fiyatı ülkeden bağımsız kazanır. Fiyat ülkesi: yer DE → DE; yer yok ve Almanca → DE; yer yok ve öteki dil → genel.
- KDV: FR yurt içi; DE tüketici eşik altı ve üstü; DE işletme geçerli ve geçersiz numara; çıkış FR değilse ret; Alman oranı eksik
  ürün DE tüketiciye satılmaz.
- Eşik: aşan sipariş Alman oranı alır; önceki yıl aşıldıysa yılbaşından; açılış ayarı ve iade toplamı değiştirir.
- Uygulama: Almanya adresli checkout'ta fiyat, oran ve tür; gel-al FR; kargo göndereni teslim noktası; kasa kalemi %7.
- Ekran: depo diyaloğu ülke çakışmasını reddeder; fiyat hücresi ülke fiyatını yazar ve kaldırır; ürün formu Alman oranını kaydeder.

## 7. Açık ve ölçülecek

- Hiboutik: kalemde %7 ve %19'un vergi tanımı olmadan kabul edilip edilmediği, vergi oranının API'den açılıp açılamadığı (demo hesap).
- Sendcloud: Kehl çıkışlı teklif (ücretsiz); Almanya çıkışlı etiket ücretliyse önce kullanıcıya sorulur.
- Revolut ödeme sayfasının satırları kalem oranını taşıyor mu.
- AB içi işletme satışının fatura ibaresi bugün "Autoliquidation"; BOFiP mal tesliminde "Exonération TVA, art. 262 ter-I du CGI"
  ya da eşdeğerini istiyor. Dosya (`domain-core/accounting/export.ts`) Faz 4 satış faturası şeridinde açık; düzeltme o commit'ten
  sonra, kullanıcı onayıyla.

## 8. Kaynaklar

- [Fiducial — ventes à distance depuis le 1er juillet 2021](https://www.fiducial.fr/Relations-commerciales/Prix-de-vente-facturation/E-commerce-Evolution-de-la-TVA-sur-les-ventes-a-distance-au-1er-juillet-2021)
- [Eurex — nouveau guichet unique OSS](https://www.eurex.fr/wp-content/uploads/2021/05/Eurex_Point_sur_TVA_nouveau_guichet_unique_27.05.21.pdf)
- [Assemblée nationale — confiserie au taux normal](https://questions.assemblee-nationale.fr/dyn/15/questions/QANR5L15QE22788.pdf)
- [Bundestag — Zuckerwaren 7 %, Mineralwasser 19 %](https://epetitionen.bundestag.de/petitionen/_2018/_05/_24/Petition_80061.abschlussbegruendungpdf.pdf)
- [BOFiP — mentions obligatoires, exonération art. 262 ter-I](https://bofip.impots.gouv.fr/bofip/1531-PGP.html/identifiant=BOI-TVA-DECLA-30-20-20-30-20250108)
