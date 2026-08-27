# Katalog kaynakları — ağdan yeniden üretilemeyen veri

Bu klasördeki dört dosya **elle çıkarılmış kaynaklardır**: biri basılı katalogdan, ikisi üreticinin
`.docx` spesifikasyon belgelerinden, biri iki fiyat belgesinden. `pnpm lezza:catalog` ilk üçünü okur,
WooCommerce API'sinden gelen omurgayla birleştirir ve `../lezza-catalog.json`'u üretir; dördüncüsünü
(`prices-supplier-2025-12.json`) besleme doğrudan okur (`scripts/seed/pricing.ts`).

**Neden repoda dururlar:** kaynakları üç PDF ve altı Word belgesi. Ağdan çekilemezler, silinirlerse
geri getirilemezler — üretecin `db:refresh` sırasında internetsiz de çalışabilmesi buna bağlı.
**Elle düzenlenebilirler** (üretilmiş dosya değiller), ama düzenleyen `_reliability` künyesini de
güncellemek zorundadır: aşağıdaki çelişki listesi verinin hangi kısmına güvenildiğinin tek kaydı.

## catalog-pdf.json — Lezza EU 2026 basılı kataloğu

164 SKU. Taşıdığı benzersiz bilgi **lojistiktir**: koli içi adet, kolinin paket sayısı, paletteki
paket. API bu alanların hiçbirini vermiyor.

Ayrıca **API'nin listelemediği 9 SKU** burada var. İkisi (`200410`, `700703`) API'de SKU'suz duran
varyantların kimliğini tamamlıyor; kalan yedisi perakende `mono` paketleri ile tabaklı künefeler —
üreteç onları ürün olarak kataloğa alıyor, seed sahnesine almıyor (gerekçe `catalog-lezza.ts`'te).

Katalogdaki yazım hataları düzeltilerek yazıldı (`Chocalate` → `Chocolate`); orijinal ad gerekirse
PDF'e bakılmalı. **Fiyat yok** — basılı katalog fiyat taşımıyor.

## specs-docx.json — üretici spesifikasyonları (6 ürün)

Yayın tarihi 14.12.2025, `REV1`. Yasal beyanın **tek gerçek kaynağı**: içindekiler (AB biçiminde),
alerjen, iz, 100 g başına besin değeri, saklama, raf ömrü. Kataloğun kalan ürünlerinde bu alanlar
`null` kalır ve seed onları fikstürle doldurur — ikisi karıştırılmamalı.

**Belgelerin kendi içindeki çelişkiler `_reliability` künyesinde yazılı ve süzme ORADA yapıldı:**
alerjen TABLOLARI hiç alınmadı (iki belgede metinle çelişiyorlar — simit tablosunda "susam: yok"
yazarken içerik %10 susam), koli/ağırlık blokları alınmadı (kendi içlerinde tutarsızlar; lojistik
için basılı katalog kullanılıyor). Üreteç bu süzmeyi tekrar etmez — süzgeci iki yerde tutmak, bir
gün ikisinin ayrışması demektir.

## specs-operational.json — operasyonel spekler (6 SKU)

Aynı altı belgenin **müşteriye görünmeyen** kısmı: organoleptik tanım, analitik hedefler (nem, pH,
yağ, protein, tuz — hedef/alt/üst), mikrobiyoloji limitleri (ISO metotlarıyla), ambalaj ve palet
künyesi, mevzuat uyumu.

**Bugün hiçbir şey tüketmiyor** ve bu bilinçli: veritabanında karşılığı olan bir tablo yok. Kalite
kontrol ve tedarikçi yönetimi bu veriyi isteyecek; o gün gelene kadar kaynak burada bekliyor, çünkü
tek kopyası buydu.

## prices-supplier-2025-12.json — alış teklifi + kendi toptan listemiz

**İki belge, iki yön.** `purchase` = LEZZA FOODS BV'nin QUALITE SAS'a verdiği 22.12.2025 tarihli
fiyat teklifi (34 SKU). `salesB2bHt` = bizim kendi toptan satış listemiz (`CATALOGUE QUALITE.pdf`).
İkisi de **KDV hariç (HT)**: teklif AB içi mal teslimi, satış listesi de toptan listesidir.

Beslemede fiyat **bu dosyadan türüyor** (`scripts/seed/pricing.ts`) — daha önce uydurma bir kilo
tabanından (`14,50 €/kg + 1,20 €`) hesaplanıyordu.

**Satış listesinden yalnız 6 satır alındı.** GTIN sütunu kullanılamaz: SKU'larımızla hiç örtüşmüyor
ve kendi içinde de bozuk (beş `S-011xx` kodu dört sayfada farklı ürünlerde tekrar ediyor).
Eşleştirme ad+gramajla ELLE yapıldı; otomatik ad eşleştirmesi denendi ve güvenilmez çıktı (ürün
adlarımız İngilizce, listedeki adlar Türkçe/Fransızca, gramajlar tutmuyor). Emin olunmayan 29 satır
**bilerek dışarıda** — yanlış eşleşmiş bir fiyat, fiyatsızlıktan pahalıdır.

ℹ **Teklifin lojistik sütunları (PCS/BOX · BOX/PLT) OKUNMUYOR** (kullanıcı kararı 28.08 · `05.22`).
Kaynak dosyalar onları taşımaya devam ediyor — bu klasör basılı belgelerin aynasıdır, bizim neyi
kullandığımızın değil — ama üreteç artık `lezza-catalog.json`'a `logistics` bloğu yazmıyor ve
`piecesPerBox` de hiçbir kolona akmıyor. Sebep iki katmanlı: alan zaten okunmuyordu, ve sorduğu
soru başka bir eksende çözüldü — "bu koliyi okutunca kaç adet sayılır" `variant_barcode.qty_per_code`
(`0047`, `kind='case'`), yani çarpan varyantta değil KODUN üstünde durur ve mal kabulde öğrenilir.
Palet ekseni kapsam dışı bırakıldı.

*(Kayıt için: bu sütunlar bizim eski alan adlarımızla bir sütun kaymıştı — PCS/BOX `boxesPerParcel`e,
BOX/PLT `parcelsPerPallet`a denk geliyordu, 33/34 ve 28/34 tutuyordu. Alanlar kalktığı için
karışma riski de kalktı.)*

## Tedarikçiye sorulacaklar

Belgeleri okurken çıkan ve **bizim çözemeyeceğimiz** tutarsızlıklar. Hepsi ilgili dosyanın
`_reliability.tedarikciye_bildirilecek` alanında da duruyor:

| Belge | Soru |
| --- | --- |
| KYS-010 (Simit) | Alerjen tablosu "susam: yok" diyor, içerik %10 susam ve metin "contains sesame". Tablo hatalı. |
| KYS-010 (Simit) | Ad `4x105g`, ürün bilgisi `4x100g` (=400 g), katalog 420 g. Hangisi doğru? |
| KYS-088 (Vegan Kibbeh) | Organoleptik bölümde "spiced meat filling" — ürün vegan. Ayrıca ceviz bileşenken tabloda "sert kabuklu: yok". |
| KYS-088 (Vegan Kibbeh) | Spek SKU `200302A` 75 g, katalog SKU `200302` 70 g. Gramaj farkı. |
| KYS-085 (Vegan Çiğköfte) | Metin "traces of walnut" derken tabloda "sert kabuklu: yok". |
| KYS-089 (Yufka) | `8x125g` (=1000 g) ama ürün bilgisi "koli 340 g / adet 340 g". |
| Künefe / Yufka | Tuz değeri besin tablosu ile analitik bölümde çelişiyor (0,23 ↔ 0,58 · 0,548 ↔ 1,39). Besin tablosundaki alındı. |
| CATALOGUE QUALITE | GTIN sütunu bozuk: beş `S-011xx` kodu dört ayrı sayfada farklı ürünlerde tekrar ediyor. |
| CATALOGUE QUALITE | Listede bizde olmayan dört tedarikçi var (Edelweiss, Bread House, Turquaz, Sweet Things) — kataloğa girecekler mi? |
| CATALOGUE QUALITE | Aynı listede Lezza simiti 5,14 €/kg, Bread House simiti 3,75 €/kg. Biri yanlış fiyatlanmış görünüyor. |
| Katalog (genel) | Beş bütün pasta/cheesecake (`901804 901809 900105 900901 900201`) hiçbir belgede GRAMAJSIZ — yalnız "12 dilim" yazıyor. |
| Fiyat teklifi | `200302` Vegan Kibbeh: teklif 70 g, spek (KYS-088) 75 g. |
