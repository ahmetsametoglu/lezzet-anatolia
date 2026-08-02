# Tasarım isteği — Depo Mal Kabul: eksik kareler (10.4)

> **Claude Design'a.** Mevcut canvas `Operasyon - Depo Stok Giris.dc.html` iki kare taşıyor
> (mobil kabul formu — "rampada, koli etiketi karşısında; fiyat alanı YOK" — ve günün özeti).
> İçerik sözleşmesi `design/pages/depo-stok-giris.md` (bağlayıcı, güncel). Ekranın arka ucu hazır
> (`openIntakeForm` PO'dan dolu form + `receiveGoods` depo parametreli, fark/MLOR dahil, testli);
> kod tarafı yalnız aşağıdaki karelerin çizimini bekliyor.

## Eksik kareler

1. **Bekleyen tedarik siparişinden DOLU form** — görevin bitti-kriterinin yarısı ("PO'lu kabul
   dolu formla açılıyor"). İki parça:
   - **Bekleyenler listesi/seçimi:** hangi tedarik siparişleri kabul bekliyor (tedarikçi, kalem
     sayısı, hedef depo, yaş). Depocu buradan birini seçince form o siparişin kalemleriyle dolu
     açılır — ürünleri seçmez, **gelen sayıyı doğrular** + son tarih/lot girer.
   - **Fark hâli:** beklenen ↔ gelen; eksik/fazla kalem işaretlenir ama **fark hata değildir** —
     kabul yine tamamlanır, fark kalıcı kayda geçer. Kısmi kabul de mümkün (tek satın alma iki
     depoya parça parça gelebilir — `operasyon-depo-ekseni.md §5` satın alma maddesi).
2. **Yeni tedarikçi hızlı ekleme** — listede yoksa akış kırılmadan eklenir; ad + telefon yeter
   (detay admin işi). Kamyon beklerken ayrı sayfaya gidilmez.
3. **Toptan alıp paketleme girişi** — 1 kg dökme alınıp 10×100 g paketlenen mal **10 paket**
   olarak girilir; ekran bu senaryoyu doğal karşılar (girişin birimi her zaman satılan paket).

## Mevcut kareyle aynı kalması gereken bağlayıcı kurallar

- **Fiyat/maliyet alanı YOK** — depocu para görmez; kural tipte de zorlanıyor (`IntakeFormLine`'da
  `unitCost` alanı yok, maliyet sunucuda PO'dan eşleşir).
- **Depo açık seçimdir, kapsamdan gelir; varsayılan yok** — tek kapsamlı depocuda seçici görünmez,
  deposu kimlik bilgisi olarak yazar (`operasyon-depo-ekseni.md §4`).
- **MLOR (kısa raf ömrü) uyarısı engellemez** — "yine de kabul et" yolu açık, karar insanın.
- **Telefon öncelikli** (rampada, ayakta); ardışık girişte ortak alanlar (tedarikçi vb.) korunur,
  bir irsaliyenin ikinci ürününe geçiş akıcı.
- Az önce girilen parti **anında düzeltilebilir** (yanlış adet/tarih rampada toparlanır).

## Not

Depolar sayfası canvas'ı ayrı turda ısmarlanacak; onun bölge bölümü için harita kararı
(`MapLibre GL + OpenFreeMap`, davranış kuralları) `design/pages/admin-depolar.md` §2'ye işlendi —
o tur açılırken doğrudan girdi olarak kullanılabilir.
