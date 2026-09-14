# App — Para Bölümü (M1–M2, SALT OKUMA)

> Zemin: `app-operasyon-zemin.md`. Muhasebe bölümü v1'de YALNIZ OKUR — hiçbir yazma işlemi yok;
> düzeltme/mutabakat çözümü masaüstünde. Mobildeki değeri: gün içinde ve gün sonunda paranın
> fotoğrafını cepten görmek.

## Ortak sözlük

- **Ödeme durumu:** Bekliyor · Kısmi · Ödendi · İade (sipariş durumundan AYRI eksen).
- **Hareket sebebi kümesi:** sipariş tahsilatı · müşteriye iade · stok alımı · gider ·
  hesaplar arası aktarım · sermaye girişi · diğer. Hareketin YÖNÜ (giren/çıkan) sebepten türer —
  ekran yön seçtirmez, gösterir.

## M1 · Tahsilat izleme (gün içi)

- **Veri:** bekleyen kapıda-ödemeler (sipariş · tutar · beklenen yöntem — kuryenin K4 akışıyla
  canlı) · bugünün gerçekleşen tahsilatı (yöntem kırılımıyla) · kuryenin üstündeki para (K7
  kapanışına dek biriken; yalnız nakit/kart/çek sayılır — online/havale bu dökümde HİÇ yoktur) ·
  hesap bakiyeleri (SAKLANMAZ, defterden toplanır — "bakiye düzeltme" diye bir kavram yok).
- **Tahsilat cümlesi kuralı (hazır sözlük):** "İade edildi" · "Ödendi · nakit" · "Vade 12.08" ·
  "Kalan 12,90 € · kart" · "Kapıda 45,00 € · nakit" — **tutar YALNIZ tahsil edilecekse yazılır**,
  ödenmişte rakam tekrarlanmaz.
- Salt okuma; satıra dokunmak sipariş özetini açar (yine okuma).

## M2 · Gün sonu özeti

- **Veri:** günün dökümü — tahsilat toplamı (yöntem kırılımı) · iadeler · kurye nakit teslimi
  (K7'den) · uyuşmazlık işareti (beklenen ↔ teslim edilen nakit farkı).
- **Kural:** uyuşmazlık burada YALNIZ GÖRÜNÜR; çözümü (düzeltme kaydı) masaüstünde yapılır.
  Fark İŞARETLİ gösterilir (eksi = eksik, artı = fazla); "eşleşmemiş hareket sayısı" `null`
  olabilir — o "sayaç yok" demektir, sıfır değil (ekran ikisini ayırır).

## Yapmaması gerekenler

- Hiçbir yazma/düzenleme aksiyonu çizilmez (v1 salt okuma — "düzelt" düğmesi bile yok).
- Maliyet/kâr/marj analizi yok; ciro ve tahsilat gösterilir, kârlılık masaüstü raporların işi.
- Fatura/muhasebe dışa aktarımı mobile taşınmaz.

## YOKLAR (v1)

- Gider girişi · hareket düzeltme · dışa aktarım · dönem raporları (hepsi masaüstü).
