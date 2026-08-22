# Tasarım isteği — Barkod/QR: kutu döngüsü + tarama anları (native uygulama)

> Kaynak brief'ler: `app-depo.md` ("Barkod güncellemesi 21.08" bölümü) + `app-kurye.md` (aynı).
> Kararların tamamı `docs/feature/barkod-okuyucu.md §1` (13 karar, bağlayıcı). Bütün kareler
> **native uygulama** (telefon) — operasyon web yüzeyinde tarama YOK ve çizilmeyecek.

## İstenen kareler

### A · Depo — mal kabul taraması (D2 güncellemesi)
1. **Tarama anı:** vizör açık, koli okutuldu → kabul satırı bulundu; koli koduysa adet çarpan
   kadar önerilmiş, depocu düzeltebilir hâlde.
2. **"Bu kod hangi ürün?":** okutulan kod tanınmıyor → formdaki satırlardan seçim alt sayfası;
   seçilince kod öğrenildi onayı ("bir daha sormayacağım" hissi, ama o cümleyle değil).

### B · Depo — toplama kutu döngüsü (D1 güncellemesi)
3. **Kutu açık, okutma sürüyor:** başlıkta "Kutu 1 · <sipariş>", vizör + kalem listesi
   (istenen/konan sayaçları, satırda ALAN adı — liste raf sırasında).
4. **Yanlış ürün reddi:** sipariş kaleminde olmayan ürün okutuldu → anında, net durdurma.
5. **Kutu kapanışı:** içerik özeti → "Kutuyu kapat ve etiketi bas" → basım durumu; kapanan kutu
   salt-okunur, sipariş bitmediyse "Yeni kutu aç".
6. **Eksik kalemli kapanış:** kutular kapandı ama sipariş eksik — eksik bildirimi mevcut akışa
   düşer, ekran durumu nasıl gösterir.

### C · Kurye — yükleme (K1 güncellemesi)
7. **Yükleme sayacı:** sefer bağlamında kutu okutma; "5/8 bindi · 3 kaldı"; kutusuz siparişlerin
   (okutmasız eski yol) aynı listedeki hâli.
8. **Yanlış kutu reddi:** rotaya ait olmayan kutu → ret cümlesi (hangi rotanın malı olduğunu söyler).

### D · Kurye — kapıda teslim (K3 güncellemesi)
9. **Okutmayla teslim:** kapıda QR okutuldu → teslim kaydı düştü (form yok); çok kutuluda "1/2
   kutu okutuldu — kalan: …" hâli.

### E · 4×6 termal ETİKET şablonu (Brother QL-1110NWB)
10. İçerik: ürün+adet dökümü · müşteri/sipariş kimliği · rota/gün · tahsilat YÖNTEMİ · kutu QR'ı.
    **Fiyat/tutar ASLA yok.** Tek şablon; sunucu üretir, telefon basar. Baskı alanı 102×152 mm,
    tek renk (termal) — kontrast ve tipografi ona göre.

## Bağlayıcı kurallar (çizime yansır)

- Depo ekranları PARA GÖRMEZ; kurye yalnız tahsil edeceği tutarı görür (okutunca, kendi ekranında).
- Rol varsayılmaz: toplayan kimi gün depocu, kimi gün kuryenin kendisi (21.08).
- Tek kutu = döngünün özel hâli; ayrı akış yok. Kutusuz sipariş eski yoldan gider (geçiş dönemi).
- İç terim yok ("rezervasyon", "RPC", "absolüt yazım" vb. ekrana sızmaz).
