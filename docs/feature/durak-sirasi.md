# Etüt: Durak sırası + navigasyon (11.8 · 11.9)

> Kardeşleri: `sefer.md` (seferin kendisi), `cok-gunluk-sefer.md` (turun ölçeği).
> Kararlar burada; görev durumu `docs/build/11-kurye-rota.md`'de (CLAUDE §5).

## 1. Ölçüm — sıra bugün nereden geliyor

**Hiçbir yerden.** `OrderService.listByCourier` (`packages/database/src/services/order.service.ts:838-846`)
sabit `orderBy: 'createdAt'` kullanıyor: kuryenin gördüğü sıra **siparişin verilme sırası**. Bu sıra
`listCourierDay` → `/courier/day` → mobil/web ekranlarına hiç dokunulmadan taşınıyor ve `index + 1`
olarak **rota sırasıymış gibi** gösteriliyor (`courier-day-screen.tsx:405-417`,
`deliveries-sections.tsx:57,69`).

Sistem kendiyle çelişiyordu: sevkiyat masası aynı sayıyı yazmayı **reddediyor**
(`dispatch-read.ts:348-349`, `design/pages/admin-teslimat.md:69` — *"sistem sırayı bilmiyor"*), kurye
ekranı ise yazıyor. Uydurulmuş bir ölçüm (CLAUDE §1).

**Koordinat zemini:** `postal_code_place.lat/lng` var (16.878 satır, `0033`/`0034`) — kod başına **tek
merkez**, adres değil. `address` ve `warehouse` tablolarında koordinat **yok**. Ama BAN istemcisi zaten
yazılı (`packages/address-fr`) ve `AddressSuggestion.latitude/longitude` (`address.ts:37-38`) bugün
**çöpe atılıyor**. Mesafe motoru da yazılı: `domain-core/delivery/distance.ts` (`distanceKm`, haversine).

## 2. Problemin kalbi — kullanıcının U senaryosu

Kullanıcının cümlesi (30.08): *"bir hatta giderken bir kısmı o hattın paralelindeki başka yoldan geri
dönerek teslim edilir — U yaparsın, dolayısıyla depona en yakınlardan birini en SON teslim edersin ama
en mantıklı rota da bu oluyor."*

Bu bir uç durum değil, **problemin tanımı**:

- **Yanlış model — en yakın komşu (NN):** "sıradaki durak, bulunduğum yere en yakın olan." Her adımda
  haklı görünür, sonda yalnız bırakır: NN yalnız bir sonraki bacağı görür, **dönüş bacağını hiç
  görmez**. İki paralel hat geometrisinde zikzak çizip sonunda uzun bir dönüş öder.
- **Doğru model:** turun TAMAMININ maliyeti (depodan çık, depoya dön — **kapalı tur**). Depoya en
  yakın durağın en sona düşmesi bir anomali değil, optimal turun **doğal sonucu**: onu erken teslim
  etmek dönüş bacağını iki katına çıkarır.
- Adı: tek araçta **TSP**, çok araç + kapasite + zaman penceresi girince **VRP**.

**Karar: U bir kural olarak yazılmaz, doğru amaç fonksiyonundan çıkar.** 2-opt turun tamamını
değerlendirip kesişmeleri söker; kesişmesiz kapalı tur bu geometride zorunlu olarak git-dön şeklidir.
Or-opt ayrıca gerekli — 2-opt yalnız segment tersler, yanlış kola düşmüş **tek** durağı taşıyamaz.

## 3. Kullanıcı kararları (31.08)

1. **Çözünürlük karışık** — bazı posta kodlarında çok durak, bazılarında tek. → Hem adres koordinatı
   hem posta kodu merkezi gerekli; hangisinin kullanıldığı **veride ve ekranda adlandırılır**
   (`stop_order_precision`: `address` | `postal_centroid` | `mixed`). Merkez `address` satırına
   **kopyalanmaz** — türetilmiş değeri kalıcılaştırmak olurdu ve `lat is null` süzgeci yalan söylerdi.
2. **Elle sıra düzeltme yok** — ne kurye ne operatör. Önce motor izlenir. Kapı açık bırakılır
   (`stop_order_source` alanı `'manual'` değerini taşır), etkileşim yazılmaz. Bu, tasarımın mevcut
   kararıyla da uyumlu: `design/pages/app-kurye.md:83` *"rota sırasını değiştirme (plan operatörün)"*.
3. **Kuş uçuşu ilk sürümde; OSRM ikinci fazda.** Matris portu tasarlanır, adaptörü sonra yazılır.

## 4. Kuş uçuşunun yazılı sınırı

U'yu **yaratan** şey yol ağıdır: gidiş yolu ile paralel dönüş yolu arasındaki bariyer — nehir (Ill),
demiryolu, otoyol, çift şeritli yolda sola dönüş yasağı, tek yön. Haversine bariyerin iki yakasını
"200 m" sayar, araç 4 km sürer.

Sonuç: kuş uçuşu **makro** şekli (git-dön) doğru kurar, **mikro** sırayı (caddenin hangi yakası önce,
kanalın hangi tarafı) yanlış kurabilir ve kâğıt üstünde kusursuz görünen, bariyer atlayan bir tur
üretir. `createdAt`e göre devrim, gerçek yola göre yaklaşım. Bu **kabul edilmiş ve yazılı** bir
eksikliktir — gizlenmez: sonuç `stop_order_metric` alanında `haversine` diye durur.

## 5. Maliyet — ücretli servisler bize ne katar (30.08 araştırması)

**Hepsi-bir-arada SaaS uymaz** (Routific ~$150/ay 1.000 sipariş, Spoke Dispatch $125/ay 1.000 durak):
sattıkları paketin içinde dispatcher paneli, sürücü uygulaması, müşteri takip sayfası, teslim kanıtı,
kapanış raporu var — **hepsi bizde yazılı** (`delivery_run`, kurye gün ekranı, `wa.me` "yoldayım",
sefer kapanışı). Paketin %80'i için ikinci kez ödeyip karşılığında sipariş senkronu (duplication,
CLAUDE §1) ve müşteri adreslerinin üçüncü tarafa gitmesi (GDPR) alırdık.

**Katman API'leri işe yarar** — tek fonksiyon satarlar, veri bizde kalır:

| Servis | Model | Fiyat (30.08) |
|---|---|---|
| Google Routes — Compute Routes | istek | Basic $5/1.000 · Advanced $10/1.000 |
| Google Route Matrix | **element** (kaynak×hedef) | ~$5/1.000 element |
| Google Route Optimization | gönderi birimi | ücretsiz kota **1.000/ay**; birim fiyat doğrulanmadı |
| Mapbox Matrix/Optimization | element/istek, hacim indirimli | kademeli |
| Self-host OSRM + VROOM | VPS | ~€5–20/ay |

**Üç tuzak:** (1) matris **karesel** büyür — 60 durak = 3.721 element, durak sayısı 2× olunca maliyet
4×; (2) rota günde bir kez değil 3–5 kez hesaplanır (yeni sipariş, atlanan durak); (3) ücretsiz kotalar
SKU başına ve Route Optimization en dar kotada.

**Bunun tasarıma yansıması:** maliyet bir **port** meselesidir. `RouteMatrixProvider` arkasında ne
durduğu (kendi haversine'imiz, self-host OSRM, ticari API) değiştirilebilir bir uygulama detayı olur;
ekranlar ve iş kuralları hiç değişmez. Ve `stop_order` saklanır — ticari matriste damga/önbellek bir
hız işi değil, **para** işidir.

**Navigasyon masadan kalkar:** kuryeyi uygulama içinde turn-by-turn navige etmek (Mapbox Navigation
SDK, MAU bazlı) en pahalı kalemdir ve gereksiz — kurye zaten Waze/Google Maps kullanıyor, trafik
verisi bizde yok. Deep-link bedava (11.8).

## 6. Fazlar

| Faz | İş | `db:refresh` |
|---|---|---|
| **A0 (11.8)** | Navigasyon devri — `maps/dir`, saf üreteç, yutulan `openURL` reddi | ✗ |
| **A1 (11.9)** | Koordinat temeli + sıra motoru + saklama | ✅ (üç migration, tek pencere) |
| **A2 (11.9)** | Yüzeylerde sıra (`stopSeq`), sırasız gün hâli | ✗ |
| **A3 (09.x)** | Sevkiyat masasında rota önizleme haritası — motorun denetim gözü | ✗ |
| **A4** | OSRM matris adaptörü (port A1'de tasarlandı) | ✗ |

**A1 ve A2 ayrılmıyor** çünkü koordinat ve motor birbirsiz değer üretmez (kullanıcının "karışık"
cevabı): koordinatsız motor yoğun kodlarda değersiz sıra üretir, motorsuz koordinat hiç görünmez.
İkisi de migration istiyor → CLAUDE §4 gereği tek pencerede kümeleniyor.

## 7. Sıra nerede durur — dizi, kolon değil

`delivery_run.stop_order uuid[]`, `order.stop_seq int` değil.

**Gerekçe:** sıra bir **turun** özelliğidir, siparişin değil. `stop_seq = 3` paydasız bir sayıdır ve
sipariş başka güne/rotaya taşınınca sessizce yalana döner. Emsal proje içinde:
`delivery_run_close.delivered_orders uuid[]` (`0046:118-120`) — kimlik dizisi seferde durur.

**Kritik incelik: dizi SIRALAMADIR, ÜYELİK DEĞİL.** Üyelik `order.delivery_run_id`de kalır; okuma
dizideki yere göre dizer ve **dizide olmayan durak düşmez**, `seq: null` ile sona gider. Bayat bir dizi
hiçbir durağı gizleyemez — `uuid[]`in FK'sizliği kabul edilmiş bedeldir, zararı yapısal olarak sınırlı.

**Reddedilen dördüncü seçenek** — ayrı `delivery_run_stop` tablosu: durak kendi niteliklerini kazandığı
gün (tahmini varış, zaman penceresi, servis süresi) doğru model odur; bugün o niteliklerin hiçbiri yok.
Dizi → tablo terfisi mekaniktir (tek `insert ... select unnest`).

## 8. Açık kalanlar

- **Gerçekleşen sıra bugün zaten ölçülebiliyor** — `order_status_log` teslim damgaları o seferin fiilî
  sırasını verir ve `listCourierDay` o satırları **zaten okuyor**. "Plan vs gerçek" karşılaştırması bu
  yüzden bedava; ama bugün **hiçbir ortalama alınmaz, hiçbir eşik yerel veriden seçilmez** (yerel veri
  sahtedir). Öğrenilmiş matris ileride yalnız **başka bir `RouteMatrixProvider` uygulamasıdır**.
- **Almanya'nın koordinatı yok** — BAN yalnız Fransa. `unsupported_country`, nokta `null`, o duraklar
  "sırasız" görünür. Dürüst, ve uydurmadan iyi. İkinci sağlayıcı takıldığında çağıran hiç değişmez.
- **Mobil harita** ertelendi (`BACKLOG §(b)`); paket **hâlâ seçilmedi** ve ayrı `STACK §2` beyanı ister.
