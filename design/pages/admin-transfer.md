# Operasyon · Transfer (Stok sekmesi: `/operations/stock?tab=transfer`) — 19.6

> **Süreç notu (19.08, kullanıcı):** *"Design'dan koptuk, kendi formlarımız üzerinden gidiyoruz."*
> `Operasyon - Transfer.dc.html` bu ekranın YERLEŞİM ve KURAL referansıdır; görsel dil operasyon
> form kitinden (Dialog · Table · Badge · Select · Combobox · Input). Bu dosya ekranın SÖZLEŞMESİNİ
> tutar — hangi bilgi, hangi amaçla.
>
> **Ev kararı (19.08, kullanıcı):** ayrı sayfa DEĞİL, **Stok'un sekmesi** — 22.26'nın "mal girer,
> durur, çıkar" deseni; rampadaki iş mal kabulle aynı iş. dc'nin "tek ekran" kurgusu sekmeye indi:
> dc'deki Yoldakiler/Geçmiş sekmeleri burada iki BÖLÜM (sekme-içinde-sekme olmaz); sayfa başlığı
> Stok'un başlığıdır, omurga cümle sekmenin altyazısında; "Yoldakiler · N" sayacı sekme rozetinde.
>
> **Depocu incelemesi (19.08, kullanıcı — ikinci tur):** *"hangi ürün, kaç adet gönderilmiş belli
> değil; ne geldiğini bilmeden kabul ediyor; fazladan yazılmamış ürün gönderilmiş mi?"* → içerik
> penceresi doğdu (aşağıda), kalem hücreleri kapı oldu, sevk penceresinin görsel kırığı
> (`Input.fullWidth` sözleşmesi) onarıldı, form alt barları `DialogFooter` desenine geçti.

## Omurga

- **Tek ekran, rolüne göre daralır.** Yoldaki sevkiyat aynı anda iki deponun gerçeğidir — iki ayrı
  ekran aynı kaydı iki kez anlatırdı.
- **Sevk kaydı malın çıktığı andır**: "planlanmış transfer" hâli yoktur, ekran da çizmez.
- **Yoldaki mal hiçbir deponun stoğunda değildir** — yoldakiler listesi TAMDIR, sanal "transit
  depo" yoktur. Boş liste iyi haberdir ve "bir şey eksik" tonunda gösterilmez.

## İki sekme

- **Yoldakiler** (fiziksel küme, sayfalanmaz): belge no (mono) · kaynak→hedef kod hapları · sevk
  anı + sevk eden · kalem/adet · yaş rozeti (`ok` süre içinde · `warn` bir gün taştı · `late`
  belirgin aştı — eşik `transfer_transit_days` ayarı) · "Kabul et". Gecikmiş varsa üstte amber
  sayaç + altta tek uyarı bandı ("mal iki depoda da satılamaz hâlde bekliyor").
- **Geçmiş** (olay kaydı, keyset — imleç URL'e yazılmaz): kayıt düzeltilmez/silinmez; dört sonuç
  rozeti — Tam kabul (olive) · Kısmi −N (amber) · Sıfır kabul (red) · Sevk geri alındı (neutral).
  Kısmi satırda iki sayı birden okunur ("30 → 28").
- **"N kalem · M ad." hücresi her iki listede KAPIDIR** (19.08 depocu incelemesi: *"hangi ürün,
  kaç adet gönderilmiş belli değil"*): noktalı alt çizgiyle çizilir, tıklayınca içerik penceresi
  açılır. Kapsam dışı personel de tıklar — görüş alanı satırı gösteriyorsa içeriğini de gösterir.

## Roller ve sınırlar

- Kapsam SÜZGEÇ değil GÖRÜŞ ALANIDIR: depocu yalnız kendi depolarının dahil olduğu hareketi görür;
  depo-üstü bakış (yönetici) hepsini. Üst bardaki depo seçicisi bu sayfayı DARALTMAZ.
- **Kabulü hedef yapar** (dört göz: malı sayan, gönderenden başkası) — düğme yalnız hedefi
  kapsamında olana çizilir; ötekiler "hedef kabul eder" okur.
- **Kaynak sorulmaz** — çalışılan depodur. Depo-üstü bakışta pencereden seçilir; son sözü yine
  sunucu söyler (kalemler kaynağa karşı doğrulanır).
- Hedef seçici kapsam süzgeci DEĞİLDİR: kapsam dışı depoya sevk edilebilir (kamyon oraya gidiyor).
- Tedarikçi/irsaliye/fiyat alanı yoktur — parti buraya dışarıdan girmez; karar tedarikse Satın Alma.

## Sevk penceresi

- Kaynak → hedef; belge numarası kaynağın kodunu taşır (`TRF-STR-26-…` önizlemesi), kâğıt nüsha o
  depoda dosyalanır; ulaşım süresi ayardan yazılır.
- Varyant araması stok girişiyle AYNI kapı; kart başına: kullanılabilir/ayrılmış özeti, "istenen"
  alanı, parti satırları (lot · tarih · kalan gün · fiili · adet kutusu).
- **FEFO önerilir, zorlanmaz** (`transferDecision`): kısa ömürlü parti "ömrü yolda yanabilir"
  uyarısıyla işaretlenir — hedefte hızlı tüketilecekse bilerek gönderilir. Öneri KULLANILABİLİR
  üzerinden: söz verilmiş mal başka şehre gitmez ("en çok N sevk edilebilir; ayrılmış M müşteriye
  söz verilmiştir — bu bir sınır, tercih değil").
- **Süresi geçmiş parti KIRMIZI okunur** (19.08): motor önermez ama listede durur — telefonda
  "ordan ver" denirse yanlışlıkla seçilmesin. Engel çizilen düğmenin yanında SEBEBİYLE yazılır
  (`DialogFooter.blockedReason`: kaynak → hedef → kalem → miktar sırasıyla tek mesaj).

## İçerik penceresi — kabul bunun bir YÜZÜdür (19.08)

- **Tek pencere, iki yüz.** `canReceive` (kayıt yolda VE hedef bakanın kapsamında) ise KABUL FORMU;
  değilse SALT-OKUNUR içerik. Eskiden içeriği görmenin tek yolu "Kabul et" düğmesiydi ve geçmişe
  hiç kapı yoktu — depocu *"ne geldiğini bilmeden kabul ediyor"* hissiyle mahkûmdu.
- Satır künyesi ad + LOT + tarih: rampada kutuyla eşleşme lottan yapılır. Kolonlar her iki yüzde
  aynı: **Kalem · Sevk edilen · Gelen · Fark** — geçmişte "hangi kalem eksik geldi" satır satır
  buradan okunur; başlıkta sonuç rozeti (geçmiş rozetiyle aynı dil).
- Kabul yüzü: **boş satır kabulü kilitler** ("N satır boş — kabul tamamlanmaz", sebep düğmenin
  yanında yazılır — `DialogFooter.blockedReason`); **"0" ayrı bir beyandır** (kutu geldi ama boş /
  kayboldu); vazgeçme düğmesi "Sonra" der ("İptal", sevkiyatı geri almakla karışırdı).
- **Listede olmayan mal buradan GİREMEZ** (*"fazladan yazılmamış ürün gönderilmiş mi?"* sorusunun
  cevabı): o mal kaynağın stoğundan düşülmemiştir — buradan kabul etmek yoktan stok yaratmak olur.
  Kaynak depo fazlası için ayrı sevk keser; pencere bunu not olarak söyler.
- Kabul edilen mal hedefte YENİ parti olarak doğar; tarih/lot kaynaktan kopyalanır, birleşmez —
  geri çağırma izi ve gerçek maliyet transferden etkilenmez. Fark kalıcı kayıttır, sessizce
  eşitlenmez.

## v1'de bilinçli yok

- Geri alma düğmesi (application kapısı + RPC hazır; geçmiş rozeti hâli gösteriyor — ihtiyaç
  doğarsa yoldaki satıra menüyle bağlanır. Web action'ı bilerek YAZILI DEĞİL: knip kullanılmayan
  ihracata izin vermez, düğme doğduğu gün `dispatchTransferAction` deseniyle açılır).
- Hedefin stok görünümü / "orada az kalmış" ipucu (dc de depocuya vermiyor; karşılaştırma
  yöneticinin işi — eşik-altı ekranı zaten transferi işaret ediyor).
