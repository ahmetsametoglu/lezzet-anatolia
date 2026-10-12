# Değerlendirme — alım sonrası akış ve ürün sayfasındaki yorumlar

> **Statü:** alım sonrası akış ve ürün sayfasının yorum bölümü tamamlandı (12.10.2026). Kararlar 12.10.2026'da kullanıcıyla Claude
> Design keşif panosu üzerinden verildi (16e-3, 16e-4, 17a, 17t, 18a kareleri).

## 1. Kararlar (12.10.2026)

1. **Tek ekran, ürün başına satır.** Siparişin ürünleri tek listededir; her satırda beğen/beğenme ve isteğe bağlı "Yorum ekle".
   Yorum siparişe değil ÜRÜNE yazılır; hangi ürüne ait olduğu satırdan bellidir.
2. **Puan kuralı tek satırda söylenir:** "Her ürün için oy +5 · yorum +20 puan". Toplam puan satırı ve kelime sayacı yazılmaz;
   düğme tamamlama primini taşır ("Değerlendirmeyi tamamla · +5 puan"). Puan ürün çeşidi başınadır, adet başına değil. Sipariş
   detayındaki davet kartı da aynı kuralı söyler.
3. **Yorumun puanı rozetle gösterilir:** alanın altında sağda "+20 puan"; yorum alt sınırı geçince zeytin rengi "✓ +20 puan".
4. **Yorumun alt sınırı 2 kelimedir** (`review_min_words`, operasyon ayarlarından değişir). Kelime en az iki harf ve iki farklı harf
   taşır; boşluk, noktalama, tek harf ve "aaa" sayılmaz. Uyarı ("En az 2 kelime") yalnız "tamamla"ya basınca ve yalnız kısa kalan
   satırda çıkar.
5. **Yorum puanı yazımda verilir,** onay beklenmez.
6. **Telefonda "Yorum yaz" yoktur;** yorum alım sonrası akıştan gelir. Masaüstü ürün sayfasındaki form kalır ve 4. kararın alt
   sınırını uygular.
7. **Ürün sayfası:** puan ürün başlığının üst satırındadır ("TATLI · ★ 4,4 (5 DEĞERLENDİRME)"); kartların altında yalnız
   "N yorumun tümü →"; özet kartı kalkar; "Tüm yorumlar" ekranında dağılım çubukları ve yıldız çipleri. Yorum kartında tarih
   yoktur, yazar adı kısaltılır ("Hugo B."), yıldızsız beğeni "♥ Beğendi" yazar.
8. **Yorum alanı 85 px:** panodaki ~70 ile kitin standart çok satırlı alanı (native 110, web 96) arasında; standart alan öteki
   formlarda aynen kalır.

## 2. Yol haritası

Şimdi yapılmayacak; sırası gelince kullanıcıya sorulur.

- **Yapay zekâ ile otomatik onay:** temiz yorum kuyruğu beklemeden yayına çıkar, kuşkulu metin operatöre kalır.
- **Anlamsız metin ve tekrar süzgeci:** klavye dizisi ("asdf qwer") ve aynı metnin ürünler arasında kopyalanması.
- **Küfür süzgeci,** üç dilde.
- **Günlük yorum sınırı:** günlük puan tavanı puanı sınırlar, yorum sayısını sınırlamaz.
- **Reddedilen yorumun puanı:** bugün moderasyonun reddi puanı geri almaz; geri alınıp alınmayacağı karar bekliyor.
