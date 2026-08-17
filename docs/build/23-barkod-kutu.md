# 23 — Barkod/QR ile Operasyon Takibi

## Kapsam

Malın depoya girişinden müşterinin kapısına kadar dört aşamanın **kod okutarak** takibi: mal kabul ·
sipariş hazırlama (kutu) · araca yükleme · teslim. İki ayrı kimlik vardır ve karıştırılmaz —
**ürün barkodu** (EAN/GTIN, dış dünyanın kimliği: "bu hangi mal") ve **bizim bastığımız kutu QR'ı**
(kendi kaydımızın kimliği: "bu hangi sipariş"). Tarama daima **telefon kamerasıyla** yapılır.

**Bu modül DEĞİLDİR:** müşteri yüzeyi (müşteri kod okutmaz) · satış/stok kararı (barkod kimlik
bulur, kararı yine mevcut motorlar verir — depo değişmezi aynen geçerli) · lot/parti etiketi
(bilinçle ertelendi, gerekçe etütte) · kurye haritası ve akıllı rota (`BACKLOG §8`, üç ayrı kalem;
bu modül hiçbirini beklemez) · operasyon **web** yüzeyi (tarama telefonda olduğu için web'de barkod
hiç olmayacak — masaüstü-yalnız kalır, `CLAUDE §2`).

Modül dört mevcut modülün üstünden geçtiği için (kod alanı `05`/`06`, kutu+hazırlık `10`,
yükleme+teslim `11`, kamera+basım `21`) kendi dosyasında toplandı: tek hikâye, tek yerden okunan
ilerleme (kullanıcı kararı 17.08). Öteki modüllere yalnız çapraz referans konur.

## Okunacaklar

- **`docs/feature/barkod-okuyucu.md` — §1'deki 13 karar BAĞLAYICIDIR** (kullanıcıyla sahne sahne
  alındı, 17.08). §0 bugünün kod ölçümü, §2 aşama aşama akış, §3 lot etiketinin neden ertelendiği,
  §4 veri modeli yönü, §5 fazlama.
- `design/pages/app-depo.md` (D1 toplama · D2 mal kabul) ve `app-kurye.md` (K1 rota · K3 teslim) —
  **ikisi de kutu akışını henüz TAŞIMIYOR**; brief güncellemesi bu modülün ilk işi (tasarım turu).
  `app-depo.md` YOKLAR listesi hâlâ *"Barkod/QR okuma (v2)"* diyor; o satır karar değişince düşer.
- `DOMAIN §4` (FEFO/parti/rezervasyon), `§16` (tedarik/mal kabul), `§17` (depo değişmezi),
  `ORDER_LIFECYCLE` (durum geçişleri — teslim yalnız `out_for_delivery`den olur).
- `19.28` (`0045_storage_area_vehicle.sql`) — depo içi alanlar; toplama sırasının dayanağı.

## Bağımlılık

`05-katalog` (varyant), `06-stok` (parti/intake/adjustment servisleri — hepsi hazır),
`07-siparis` (`record_preparation` · `deliver_order` · `delivery_proof` — hazır),
`10-depo` (hazırlık/mal kabul ekranları — yazılı, kutu ve tarama eklenecek),
`11-kurye` (gün/teslim ekranları — yazılı, okutma eklenecek),
`21-mobil-uygulama` (operasyon kabuğu + dört bölüm + 17 ekran — **hazır**, `(operations)` rota grubu).

**Yeni teknoloji girişi iki tanedir ve ikisi de beyan ister** (`STACK §2`): kamera taraması
(`expo-camera`) ve etiket basımı (Brother Print SDK üzerinden bir Expo modülü). İkinci sinin RN 0.86
/ New Architecture altında çalışması **ölçülmemiş tek varsayımdır** — bir günlük iğne deneyiyle
ölçülür ve kutu akışının önünde durmaz.

**Toplama sırasının zemini hazır (17.08):** `stock.location` serbest metni kalktı, yerine
`stock.storage_area_id` geldi (`19.29`) ve alan `sort_order` taşıyor (`19.28`). Yani "raf düzenine
göre sırala" isteği artık bir ekran işi — şema işi değil. Gerekçe zinciri:
`docs/feature/barkod-okuyucu.md §1.13`.

## Başlarken verilecek izah (örnek)

> "Depodaki ve yoldaki her adımı telefon kamerasıyla okutulan bir kodla bağlıyoruz. Mal gelince
> kolinin barkodu okutuluyor ve kabul satırı kendiliğinden bulunuyor — koli barkodu paketin
> barkodundan farklıdır, sistem ikisini de tanır ve kolinin kaç adet olduğunu kodun kendisinden
> bilir. Tanımadığı bir kod görürse 'bu hangi ürün?' diye sorar ve bir daha sormaz; yani kod listesi
> kullanımla kendi kendini dolduruyor, kimse oturup katalogun barkodlarını girmiyor.
>
> Sipariş hazırlanırken her siparişe bir kutu açılıyor, ürünler okutularak kutuya konuyor — sipariş
> kaleminde olmayan bir ürün okutulursa ekran anında durduruyor. Kutu kapanınca üstüne, içinde ne
> olduğunu ve QR'ını taşıyan bir etiket basılıyor. Kurye araca yüklerken o QR'ı okutuyor: rotasına
> ait olmayan kutu kabul edilmiyor, ve kaç kutu yüklendiği sürekli önünde duruyor. Kapıda aynı QR
> okutulunca teslim kaydı kendiliğinden düşüyor — kurye ayrıca bir onay ekranı doldurmuyor.
>
> Kazanç iki tarafta: depoda yanlış ürün seçimi ve satır arama süresi, yolda ise yanlış kutunun
> yanlış adrese gitmesi. Etikette fiyat yazmıyor — depo tarafı tutar görmez, kurye tahsil edeceği
> tutarı okuttuğunda ekranda görür."

## Görevler

**Görev satırları henüz AÇILMADI** (17.08). Sebep sıradadır: kararlar alındı
(`docs/feature/barkod-okuyucu.md §1`) ama kutu **yeni bir kavram** ve ekran anları henüz çizilmedi —
şemayı tasarımdan önce yazmak iki hafta sonra değişecek bir tablo açmak olur. Sıra:
**tasarım brief'i → Claude Design → görev satırları → şema → ekranlar.**

Fazlamanın kendisi etüdün §5'inde duruyor; satırlar oradan türetilecek.

## Netleşecekler

1. **Toplayan kişi kuryenin kendisi mi?** Kullanıcı paralel toplama için "her masaya bir kurye
   görevlendirilir" dedi (17.08). Öyleyse yükleme okutmasının *"bu kutu bu rotanın malı mı"* sorusu
   zayıflar (topladığı kutuyu kendi yüklüyor) ama kutu SAYIMI değerli kalır. Ekran anları buna göre
   ayrışır.
2. **Etiket dosya biçimi: PDF mi PNG mi?** Brother SDK ikisini de basıyor. Karar barkod/QR üretimi
   ve font kontrolüyle birlikte verilir — etiketin içeriğine sunucu karar verdiği için biçim de
   sunucu tarafının kararı.
3. **Hazır paket mi kendi modülümüz mü?** `expo-brother-printer-sdk` (v0.7.0, MIT) önce denenir;
   RN 0.86 altında tutmazsa `apps/mobile/modules/brother-print/` local modülü yazılır (kullanıcı
   kararı 17.08: ucuzdan başla).
4. **Kutu kodunun biçimi.** `order.reference_no` OLMAMALI — o müşteriye gösteriliyor; kutu kodu ayrı
   ve tahmin edilemez olmalı, yoksa referansı bilen biri teslim kaydı düşürebilir.
5. **Parti karışma sinyali.** Lot etiketi ertelendi ama kararın ölçütü sayısal olmalı: aynı varyantın
   aynı depoda 2+ açık partisi bulunduğu durumların sayısı (mevcut `stock` okumasından türer, yeni
   tablo yok). Bu sinyalin nereye düşeceği (depo ekranı mı, analitik mi) netleşecek.
