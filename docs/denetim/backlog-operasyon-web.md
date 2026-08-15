# Web Uygulaması — OPERASYON Yüzeyi Backlog'u

> **Bu dosya KAPSAM tutar, ilerleme tutmaz.** Durumun tek sahibi ilgili görev/bölüm satırıdır.
> Kimlikler bu dosyaya özeldir (`OB-nn`).
>
> **Kaynak:** Kullanıcı tarafından 14.08.2026 tarihindeki arayüz testleri sırasında bildirilen ve doğrulanan operasyon web arayüzü bulguları.

---

## 1. Bloke Edici Bulgular / Hatalar

- [ ] **OB-01 · Yeni Rota tanımlanırken depo seçilemiyor ve kaydetme işlemi bloke oluyor**
  - **Bulgu:** Operasyon sayfasında (`/operations/deliveries?tab=routes`) "Yeni Rota" tanımlanmaya çalışıldığında; rota adı girilip, teslim günleri ve posta kodları seçildikten sonra "Kaydet" butonuna basıldığında arayüzde şu hata mesajı beliriyor:
    > *"Bu rotanın hangi depodan çıkacağı belli değil — Depolar sayfasından depoyu seçip "Rota ekle" ile gelin."*
    Arayüz üzerinde (form ekranında) depo seçimi yapmaya izin veren herhangi bir kontrol/alan (dropdown vb.) bulunmamaktadır. Dolayısıyla kullanıcı bu sayfadayken rotayı kaydetmeyi başaramamaktadır.
  - **Kök Neden:** [`routes-client.tsx`](file:///Users/ahmet/dev/lezzet-anatolia/apps/web/app/(operations)/operations/deliveries/routes-client.tsx#L129-L133) dosyasındaki kayıt mantığı, hedef depoyu sırasıyla şunlardan çözümlemeye çalışmaktadır:
    1. Seçili rotanın kendi deposu (`selected?.warehouseId`)
    2. URL parametresinden gelen depo ID'si (`warehouseId`)
    3. Sistemde yalnızca tek bir depo kayıtlıysa o depo (`data.warehouses.length === 1`)
    
    Birden fazla deponun olduğu sistemde, kullanıcı doğrudan rotalar sekmesine girdiğinde (URL'de `depo` parametresi olmadan) yeni rota oluşturmak isterse yukarıdaki üç koşul da sağlanamamakta ve `targetWarehouse` bulunamadığı için hata fırlatılmaktadır. Ancak arayüzün masaüstü formu ([`routes.desktop.tsx`](file:///Users/ahmet/dev/lezzet-anatolia/apps/web/app/(operations)/operations/deliveries/routes.desktop.tsx)) üzerinde bir depo seçici bileşeni yer almamaktadır.
  - **Çözüm Önerisi:** 
    - [`routes.desktop.tsx`](file:///Users/ahmet/dev/lezzet-anatolia/apps/web/app/(operations)/operations/deliveries/routes.desktop.tsx) üzerindeki taslak formuna (örneğin "Rota adı" alanının hemen üstüne veya altına), sistemdeki depoların listelendiği (`data.warehouses`) bir depo seçim alanı (`FieldShell` + `Select`/`Dropdown` bileşeni) eklenmelidir.
    - Taslak veri modeli (`Draft` interface'i) `warehouseId` değerini de tutacak şekilde güncellenmeli ve [`routes-client.tsx`](file:///Users/ahmet/dev/lezzet-anatolia/apps/web/app/(operations)/operations/deliveries/routes-client.tsx#L129) altındaki depo çözümleme sırasına dahil edilmelidir.

- [ ] **OB-08 · Sipariş tamamlandıktan sonra bile finansal bölümde "mal maliyeti tahmini" ve "kar sipariş kapandığında hesaplanır" uyarısı kalması**
  - **Bulgu:** Sipariş detay sayfasındaki sağ finansal panelde, sipariş adımları takip edilip sipariş tamamen kapatıldıktan (completed/delivered) sonra bile "mal maliyeti tahmini" başlığı değişmemekte ve altında "kar sipariş kapandığında hesaplanır" açıklaması gösterilmeye devam etmektedir.
  - **İnceleme Talebi:** Sipariş kapandıktan (nihai duruma ulaştıktan) sonra maliyet bilgisinin "tahmini" olmaktan çıkıp netleştirilmesi ve kar tutarının hesaplanarak gösterilmesi gerekir. Sipariş durumuna göre bu alanın metinlerinin and hesaplamalarının güncellenmesi gerekmektedir.

- [ ] **OB-09 · Aynı üründen çoklu adet içeren siparişlerde İade (Return) ve İmha (Disposal/Waste) işlemlerinin veritabanında tutarsızlığa yol açması**
  - **Bulgu:** Aynı siparişte tek bir üründen birden fazla adet sipariş edildiği durumlarda (ör. 2 adet "Dark Chocolate Profiterole Cake, 175g"); ürünlerden biri için "İade" (Return) diğeri için "İmha" (Disposal/Waste) işlemi yapıldığında veritabanındaki stok, satış veya iade verilerinde tutarsızlık oluşmaktadır.
  - **İnceleme Talebi:** 
    - Parçalı iade ve imha akışlarının veritabanı düzeyindeki ve uygulama mantığındaki yansımalarının (stok durumları, sipariş kalemi durum logları) gözden geçirilmesi.
    - Aynı sipariş satırı içindeki çoklu adetlerde bu tip farklı operasyonel işlemlerin atomik olarak nasıl yönetildiğinin ve oluşan veri tutarsızlığının kök nedeninin araştırılması.

---

## 2. Geliştirme ve İyileştirme Talepleri

- [ ] **OB-02 · Harita üzerinde Shift + Sürükle ile çoklu posta kodu seçimi (alan seçimi)**
  - **Talep:** Harita üzerinde yoğunlaşmış çok sayıda posta kodunu tek tek tıklayarak seçmek zor olmaktadır. Shift tuşuna basılı tutularak fareyle dikdörtgen bir alan çizildiğinde, o alanın içinde kalan tüm boşta/eklenebilir posta kodlarının topluca seçilmesi istenmektedir.
  - **Detaylar:**
    - Yanlışlıkla yapılan büyük alan seçimlerinin doğrudan kaydedilmemesi için, seçim tamamlandığında bir **onay diyaloğu (confirm modal)** açılmalıdır.
    - Bu diyalogda seçilen posta kodlarının sayısı ve listesi listelenmeli, *"Aşağıdaki X adet posta kodunu bu rotaya eklemek istiyor musunuz?"* şeklinde onay istenmelidir.
  - **Teknik Detay (Leaflet):**
    - Harita bileşenindeki ([`zone-map-leaflet.tsx`](file:///Users/ahmet/dev/lezzet-anatolia/apps/web/components/operation/ui/zone-map-leaflet.tsx)) varsayılan `boxZoom` davranışı (`boxZoom: false` ile) devre dışı bırakılıp `mousedown`/`mousemove`/`mouseup` olayları Shift tuşu basılıyken dinlenerek `L.Rectangle` ile görsel bir seçim kutusu çizilmelidir.
    - Çizilen alanın `LatLngBounds` koordinatları içindeki noktalar süzülmeli ve form bileşenine toplu seçim olarak iletilmelidir.

- [ ] **OB-03 · Posta kodu arama kutusunda yerleşim/şehir adına göre arama yapılabilmesi**
  - **Talep:** Rota düzenleme ekranındaki posta kodu ekleme alanında (`PostalCodePicker` bileşeni) şu an sadece sayısal kod ile arama yapılabilmektedir. Operatörün posta kodunu bilmediği durumlarda şehir/yerleşim adı arayarak da (ör. "Strasbourg" veya "Kehl") o yerleşime ait posta kodunu/kodlarını getirebilmesi ve seçebilmesi istenmektedir.

- [ ] **OB-04 · Harita hover etiketlerinde (Tooltip) posta koduna bağlı tüm şehir isimlerinin listelenmesi**
  - **Talep:** Haritadaki noktaların üzerine gelindiğinde (hover/tooltip) posta kodu ve ait olduğu yerleşim adı gösterilmektedir. Ancak bir posta kodu birden fazla şehre/yerleşime hizmet ediyorsa (örneğin Fransa'da kırsal kesimdeki bir posta kodunun birden fazla kasaba veya köyü kapsaması durumunda) etiket üzerinde bu yerleşimlerin tamamı gösterilmemektedir. Hover durumunda bu posta koduna bağlı tüm şehir isimlerinin virgülle ayrılarak veya tek tek etiket üzerinde listelenmesi istenmektedir.

- [ ] **OB-05 · Siparişler sayfasında detayların diyalog (Modal) yerine sağ panelde açılması**
  - **Talep:** Ürünler sayfasındaki tasarıma benzer şekilde; Siparişler sayfasında bir siparişe tıklandığında, sipariş detaylarının ekranı kaplayan bir diyalog penceresi (modal) yerine ekranın sağ tarafında açılan bir yan panelde (right pane/drawer) gösterilmesi istenmektedir.
  - **Detaylar:**
    - Mevcut diyalog bileşeni yapısı (`dialog.tsx`) bozulmamalı ve korunmalıdır (çünkü sistemde diyalog yapısını kullanan başka ekranlar mevcuttur).
    - Açılacak olan bu sağ panelde, siparişle ilgili operasyonel açıdan gerekli olan tüm bilgiler and aksiyonlar yer almalıdır.

- [ ] **OB-06 · Sipariş detay panelinde müşteri güvenilirlik geçmişi ve güven puanı gösterimi**
  - **Talep:** Sipariş detaylarının gösterildiği yan panelde, siparişi veren müşterinin güvenilirliğini analiz etmek amacıyla bazı ek göstergeler yer almalıdır:
    - Müşterinin daha önce yapmış olduğu geçmiş siparişlerin listesi ve özet bilgileri (geçmiş alışveriş davranışını hızlıca görebilmek için).
    - Müşterinin sistemdeki hareketlerine/hareket geçmişine göre hesaplanan veya belirlenen bir **"Müşteri Güven Puanı" (Trust Score)**.
  - **Gerekçe:** Operasyon ekibinin suistimal veya art niyetli (fraud/malicious) müşterileri sipariş hazırlama ve teslimat aşamasından önce kolayca tespit edebilmesini sağlamak.

- [ ] **OB-07 · Operasyon panelindeki küçük yazı tipleri (Font Size) ve token yapısı uyumluluğu**
  - **Talep:** Operasyon panelindeki bazı metinler (özellikle sipariş detay sayfasındaki "bağlar" bölümündeki metinler) çok küçük kalmaktadır. Operasyon genelindeki font boyutlarının iyileştirilmesi istenmektedir.
  - **Detaylar:**
    - Operasyon tarafındaki genel yazı boyutlarının (font size) bir kademe (bir tık) büyütülmesi.
    - Bazi sayfaların/bileşenlerin CSS token yapısına uymaması sebebiyle mi küçük göründüğünün araştırılması.
    - Gelecekte kolaylık sağlaması açısından, ayarlara font boyutunu değiştirecek parametrik bir kontrol ekleme seçeneğinin değerlendirilmesi.

- [ ] **OB-10 · İade başlatıldığında açılan talebin (Request) iade tamamlandıktan sonra açık kalması**
  - **Talep:** Sipariş detay sayfasında operatör "İade Başlat" butonuna bastığında, sipariş zaman çizelgesinde (timeline) otomatik olarak "Talep Açıldı" kaydı düşmektedir. Fakat iade işlemi tamamlandıktan sonra bile bu talep otomatik olarak kapatılmamakta ve açık kalmaya devam etmektedir.
  - **Detaylar:**
    - Operatör kendi eliyle iade başlattığında (ortada harici bir müşteri talebi yokken) "Talep Açıldı" kaydının oluşmasının doğruluğunun sorgulanması.
    - Otomatik talep açılıyorsa, iade işlemi tamamlandığında bu talebin de otomatik olarak "Kapatıldı" (Closed/Resolved) durumuna geçmesinin sağlanması.
    - Operatörün bu talebi sipariş sayfasından çıkıp "Talepler" sayfasına gitmek zorunda kalmadan doğrudan sipariş detayından kapatabilmesi seçeneğinin eklenmesi.

- [ ] **OB-11 · Talepler sayfasında mesaj yazıldıktan sonra klavye kısayolu ile (Enter veya Shift+Enter) gönderim yapılması**
  - **Talep:** Talepler (destek) sayfasındaki mesajlaşma alanında, operatör mesajı yazdıktan sonra farenin gönder butonuna tıklamasına gerek kalmadan `Enter` ya da `Shift + Enter` tuşlarından birini kullanarak mesajın anında gönderilmesi istenmektedir.

- [ ] **OB-12 · Talepler sayfasında Yapay Zeka destekli (AI-assisted) mesaj cevaplama özelliği**
  - **Talep:** Talepler sayfasında operatörün gelen destek taleplerini yapay zeka yardımıyla/önerileriyle cevaplayabileceği bir yapay zeka asistanı desteğinin bulunması.
  - **Detaylar:**
    - Mevcut tasarım dokümanlarının/arayüz taslaklarının incelenerek yapay zeka desteğinin tasarımda bulunup bulunmadığının (veya sonradan dahil edilip edilmediğinin) tespiti.
    - Yapay zeka motorunun talepler sayfasına cevap önerisi getirecek şekilde entegre edilmesi.

- [ ] **OB-16 · Müşteri GRUBU bazlı genel yüzde indirimi (iskonto)**
  - **Talep (daraltıldı 15.08):** Maddenin müşteri BAŞINA kısmı zaten mevcut: `user_profile.discount_percent` Müşteriler sayfasının kontrol kartından girilir, Fiyatlar → Müşteriye özel sekmesi "genel indirimli müşteriler" listesinde gösterir. Açık kalan tek parça müşteri GRUBUNA (segment) oran tanımlamak — segment varlığı yok, ayrı bir veri modeli işi; kapsam kararı bekliyor.
