# Ürün — Bir Sayfada

## Ne

Donuk (dondurulmuş) gıda ve ilgili ürünlerin (zeytinyağı, çiğ köfte gibi donuk olmayan kalemler dahil) satışını, siparişini, deposunu ve dağıtımını tek çatı altında yöneten bir satış ve işletme sistemi.

## Kim için

- **İşletme:** Strasbourg (Fransa) merkezli bir gıda tedarik ve satış işi.
- **Müşteriler:** Fransa ve Almanya'da yaşayan son tüketiciler ve işletmeler. Kitle ağırlıklı olarak Türkçe, Fransızca ve Almanca konuşur.
- **Diller:** Türkçe, Fransızca, Almanca. Operasyon merkezi Fransa; hukuki çerçeve GDPR.

## Kanallar

Sistem üzerinden satılan her sipariş **tek bir mantıkla** işlenir. Müşteri tipine göre teknik ayrım yapılır ama iş modeli açısından fark yoktur:

- **B2B** — sipariş veren bir şirkettir (fatura, özel fiyat, toptan hacim).
- **B2C** — sipariş veren son tüketicidir.

Sistem, sipariş verenin şirket olup olmadığına göre kanalı **otomatik** belirler. Ürün her iki kanalda da aynıdır; yalnızca fiyat ve bazı süreç detayları farklılaşır.

## İş modeli (özet)

Sistem, iki taraflı bir ortaklığın operasyonel omurgasıdır:

- **Yazılımcı taraf** sistemi kurar ve dijital tarafı yürütür.
- **Ticari taraf** malı, müşteriyi, depoyu, aracı ve saha operasyonunu getirir.

**Temel kural:** Bu platform üzerinden geçen her satış, müşteri tipinden bağımsız olarak ortaklığın paylaşım yapısına dahildir. Platform dışında (eski usul, sistemsiz) yapılan satışlar bu yapının dışındadır. Ayrıntı `DOMAIN.md`'de.

## Ne değil

- Resmî muhasebe/e-fatura sistemi değildir — ön muhasebe yapar, resmî işi dış muhasebe yazılımına devreder. Ama **resmî muhasebe sorduğunda her hareket izah edilebilir** (kullanıcı kararı 13.09): hareket ya bir işe bağlıdır, ya belgeye (fatura, fiş, bordro), ya etiketlidir.
- Bordro HESABI, personel yönetimi ve resmî beyan işleri kapsam dışıdır; maaş ve kesinti ödemesi etiketle izlenir, bordronun kendisi hesaplanmaz. Ortaklar arası hesap da bir varlık değil, etiket ve cari hesaptır.
- Sistem tek başına müşteri getirmez; müşteri edinimini (reklam, saha) ölçer ve yönetir, ama trafiği yaratmak ortaklığın işidir.

## Cihaz ve deneyim

- Müşteri tarafı: web uygulaması, mobilde "mobil uygulama hissi" veren bir deneyim.
- Yönetim tarafı: telefon öncelikli (depo, araç, yol — masaüstünde değil sahada kullanılır).
- İleride ayrı bir mobil uygulama (push bildirim vb.) öngörülür — bkz. `SCOPE.md`.
