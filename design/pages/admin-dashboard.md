# Admin — Genel Bakış (Dashboard)

> **17.08 güncellemesi:** `Operasyon - Dashboard.dc.html` geldi ve brief'in ötesine geçti (üst uyarı
> şeridi · gün akışı · bugünün teslimatları · depo nabzı · asistan önerileri · bekleyen transfer).
> Bu dosya o altı bölümü kapsayacak şekilde genişletildi ve **veri gerçekliğiyle** bağlandı: yedi
> kalem budandı ya da içeriği değişti, gerekçeleri `design/KARARLAR.md` › *Panel (17.08)*'de.
> Ertelenen üç kalem `design/BACKLOG.md §1`'de.

## 1. Amaç ve kullanıcı

Yöneticinin güne başlarken "bugün ne var, ne bekliyor, nerede sorun var" sorularını tek bakışta
cevapladığı giriş ekranı. Kullanıcı: yalnız admin rolü.

**Ölçüt — bu ekranın kabul kuralı:** *karar tetikler, analiz etmez.* Bir kalem bir karara
götürmüyorsa, verisi olsa da bu ekranda işi yok. Budama turu (17.08) tam bu ölçütle yapıldı ve
budananların çoğu zaten bu kurala aykırı olanlardı.

## 2. İçerik envanteri — ne var, neden

### 2.1 Üst uyarı şeridi — günün TEK en yakın eşiği

Şerit günün **tek** en yakın eşiğini söyler ve oraya götürür; ikinci düğme bekleyen işler kuyruğuna
iner. **Cümle saat + kuyruk durumundan üretilir, elle yazılmaz.** Sakin günde şerit kutlar, uyarmaz.

### 2.2 Gün akışı — eşik saatleri

**Dört eşik:** sipariş kesimi · depo hazırlık kapanışı · rota çıkışı · kurye kapanışı. Şu anki saat
hangi adımı "şimdi" yapıyorsa o vurgulanır; geçmiş adımlar **sonuçlarıyla** durur ("24 sipariş girdi
· 3 depo"), gelecek adımlar bekler.

- Saatler **ayardan** gelir, koda gömülmez. Bugün yalnız `order_cutoff_time` var; kalan üçü ayar
  olarak eklenecek (depo kapsamlı — depolar farklı şehirlerde, kesim saatleri ayrışır).
- **"Gün sonu mutabakat" ÇIKARILDI** (17.08): para ekranının işi, panelde karar tetiklemiyor.

### 2.3 Kritik göstergeler — beş kart

Günün nabzı; her kart kendi karar ekranına köprü verir. Sayı, 7 günlük seyir ve depo kırılımı
(`STR · COL · KEHL`) birlikte okunur.

1. **Bugünkü sipariş** — sayı + dünle fark + depo kırılımı
2. **Bugünkü ciro** — tutar + yüzde fark + depo kırılımı
3. **Bekleyen tahsilat** — **kapıda ödenecek ↔ vadesi gelen açık bakiye AYRI** (toplanmaz); gecikmiş
   vade varsa ayrıca işaretlenir
4. **Bugün teslim edilemeyen** — kapıya gidilip teslim edilemeyen sipariş sayısı. *(Eski tasarımdaki
   "zamanında teslim %94" bunun yerine geçti: yüzde analizdi, karar tetiklemiyordu ve teslim
   penceresi kavramı sistemde yok.)*
5. **Marj-altı fiyatlı ürün** — listeye fiyatı maliyetine göre hedef marjın altında kalan ürün
   sayısı; kararı tetikler: fiyatı düzelt. *(Tasarım "marj-altı satış" diyordu; satış düzeyi ölçüm
   bir doğruluk artışıdır, yeni bir karar değil — `design/BACKLOG.md §1`.)*

### 2.4 Bekleyen işler — admin kararı bekleyen her şey tek yerde

Her satır **sayısıyla** gelir, üç aciliyet kümesinden birine düşer (**şimdi karar ver · bugün içinde
· bu hafta**) ve **var olan** bir karar ekranına götürür. Form/karar bu ekranda değil hedefte.

- **Gecikmiş vadeli sipariş** — vade süresini aşmış ödenmemiş sipariş; tahsilat takibi buradan başlar
- **Yaklaşan tarihli parti** — kalan raf ömrü eşiğin altına inen partiler; kaç depoda ve **kaç €
  risk** taşıdığı görünür, indirimli teklif kararı bekliyor
- **Uyuşmayan kurye kapanışı** — dünkü kapanışta beklenen ile sayılan arasında fark (fark aynı gün
  görünmeli kuralı)
- **Limit aşan vadeli sipariş** — limit içindeki vadeli sipariş otomatik onaylanır; limiti aşan
  admin'e düşer
- **Açık talep** — cevap bekleyen müşteri talebi/şikâyeti; en eskisinin bekleme süresi görünür
- **B2B başvurusu** — onay bekleyen self-servis kayıt (karar insanın)
- **Yoldaki transfer** — sevk edilmiş, karşı depoda **kabul bekleyen** transfer. *(Tasarım "sevk
  onayı bekliyor" diyordu; öyle bir adım yok — sevk anı ilk kalıcı andır, `app-depo.md` D5.)*
- **Asistan önerileri** — onay kuyruğunda bekleyen öneri sayısı; tek tıkla uygulanabilir olanlar
  ayrıca anılır. Kuyruğa köprü verir, karar orada

### 2.5 Bugünün teslimatları

Günün rotası ve durakları; kurye + rota adı + depo başlıkta, ilerleme (`3 / 8 teslim`) üstte.

- **Sıra: duruma göre gruplanır** — teslim edilenler → yolda → bekleyenler. *(Tasarım 1…6 numaralı
  rota sırası çiziyordu; o sıra sistemde yok ve numara olmayan bir kesinlik ima ediyor —
  `architecture/BACKLOG §8`.)*
- **Saat: yalnız OLMUŞ olanda.** Teslim edilmiş durak gerçek teslim saatini gösterir (durum
  kaydından türer); gelecek durak için saat/ETA **yok ve olmayacak** (`app-kurye.md` aynı reddi
  taşıyor).
- Durak satırı: müşteri adı · **kalem sayısı** · B2B/B2C ayrımı · kapıda ödenecek tutar (varsa) ·
  durum. *(Tasarım "4 koli / 2 paket" yazıyordu; koli sayısı kutu kavramıyla gelecek —
  `23-barkod-kutu`.)*

### 2.6 Depo nabzı

Depo başına hazırlık ilerlemesi (`10/12 hazır`) + kesime kalan süre + risk etiketi.

- **Yalnız hazırlık ilerlemesidir — çalışan/verim ÖLÇMEZ.** Kesime yetişmeyecek depoyu erken gösterir
  ve Depo Hazırlık'a köprü verir.
- Alt cümle **ölçülen** olgudur ("kesime 20 dk · 4 sipariş hazırlanmadı"), yorum değil. *(Tasarımdaki
  "tek kişi vardiyada · hazırlık yavaş" budandı: vardiya verisi yok, ve bu satır tasarımın kendi
  "verim ölçmez" kuralını ihlal ediyordu.)*

## 3. Aksiyonlar

- Her bekleyen iş kaleminden ilgili ekrana geçme (başvuru → B2B onay, talep → talepler, parti → stok,
  limit aşan sipariş → sipariş, gecikmiş vade → tahsilat, kapanış farkı → para, transfer → transfer,
  öneri → asistan kuyruğu)
- Üst şeritten günün en yakın eşiğinin ekranına geçme
- Göstergelerden ilgili derin ekrana geçme (siparişler · raporlar · para · rotalar · fiyatlar)
- Bugünün siparişlerinden/duraklarından sipariş detaya geçme
- Bu sayfada iş **bitirilmez** — karar ekranlarına dağıtır; kendi başına form/karar taşımaz

## 4. Durumlar ve varyasyonlar

- **Sakin gün** — bekleyen iş yoksa bu açıkça "temiz masa"dır; boş kuyruk iyi haberdir, boşluk gibi
  durmaz. Gün akışı ve depo nabzı sakin günde de görünür. *(Tasarımın "Yoğun/Sakin" düğmesi bir
  önizleme anahtarıdır — kodda UI durumu olarak taşınmaz, iki hâl veriden doğar.)*
- **Yoğun gün** — birden çok kuyrukta birikme; hangi işin acil olduğu aciliyet kümesinden ayrışır
- **Teslimat günü olmayan gün** — bugüne rota siparişi yoksa yalnız kargo + bekleyen işler kalır;
  teslimat ve depo nabzı bölümleri bunu söyler
- **Kesim riski** — bir depo kesime yetişmiyorsa üst şerit onu öne çıkarır
- Göstergeler gün içinde değişir; ekran güncel veriyle çalışır

## 5. Akış bağlantıları

Gelinen: admin girişi — açılış ekranıdır; her yerden geri dönülen merkezdir.
Gidilen: siparişler, B2B onay, talepler, stok, para/kurye kapanışı, transfer, asistan kuyruğu,
depo hazırlık, müşteriler (gecikmiş vade üzerinden).

## 6. Yapmaması gerekenler

- Bu ekran **yalnız admin rolüne** açılır; depo ve kurye kendi ekranlarını kullanır — ciro, marj,
  vade bilgisi onların yüzeyine taşınmaz
- Detaylı rapor/analitik burada tekrarlanmaz — dashboard karar tetikler, analiz etmez; aynı bilgiyi
  iki yerde yaşatmak tutarsızlık üretir
- **Sahte kesinlik gösterilmez:** ölçülmeyen bir yüzde, tahmin edilmiş bir saat, türetilmemiş bir
  sıra numarası — hiçbiri "yaklaşık olsun" diye konmaz. Bilinmeyen alan boş kalır ya da bölüm
  ölçülebilen soruyu sorar
- Rezervasyon satırları, TTL/cron mekaniği, "ayrılmış stok" gibi iç işleyiş görünmez — bekleyen işler
  sonuç diliyle konuşur
- Müşteri-yüzü metinlerle iç terimler karışmaz: burada "parti", "vade", "marj" serbesttir ama
  müşteriye giden hiçbir metin bu ekrandan üretilmez

## 7. Web / mobil notları (yalnız işlevsel)

- Telefon önceliklidir: patron güne çoğunlukla telefondan bakar — sabah kahvesinde tek elle
  taranabilmeli, bekleyen işlerin sayıları ilk ekranda kavranmalı
- Gün içinde sık sık kısa kısa açılır (araçta, depoda); her açılışta güncel durum hızla yüklenmeli


## Sefer güncellemesi (18.08 — `docs/feature/sefer.md`)

§2.5'in rota kartlarının KİMLİĞİ artık sefer: başlık "rota adı · SF kodu", kurye adı seferin
kuryesi (eskiden kart kurye GRUBUydu ve rota adı hiç yazılamıyordu). Sefere bağlanmamış duraklar
"Sefer açılmadı" kartında görünür kalır. §2.2'nin gün akışındaki "çıkış" saati hâlâ PLANI gösterir;
gerçekleşen çıkış/dönüş artık kayıtta durur (`delivery_run`) ve ileride planın yanına yazılabilir.
