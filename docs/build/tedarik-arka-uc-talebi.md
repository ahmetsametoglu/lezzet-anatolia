# Tedarik ekranı — arka uç talebi (09.14, operasyon yüzeyi şeridinden · 02.08)

> Tek madde. Ekranın geri kalanı (öneri · PO taslağı · durum · tedarikçi kartları · kod eşlemesi)
> mevcut servislerle iniyor; yalnız **"+ Stok girişi" diyaloğunun kaydet yolu** bu kapıyı bekliyor.
> UI tam yazılacak, düğme kapı gelince bağlanır — kodda `BEKLEYEN(09.14)` işareti duracak.

## `receiveGoods` admin yolu: satır maliyeti taşıyamıyor

**Bugün:** `IntakeFormLine`'da `unitCost` alanı YOK — bilinçli ve doğru (depocu fiyat görmez,
sınır tipte; `lib/stock/intake.ts:104`). Maliyet sunucuda PO kalemlerinden eşleşir (`unitCostsOf`).
Sonuç: **PO'suz doğrudan alımda parti maliyetsiz doğar** (`unitCost: null`).

**Ekran ihtiyacı:** Admin'in "Stok girişi (satın alma kaydı)" diyaloğu FİYATLIDIR — tasarım parti
satırında "Birim" kolonunu çiziyor, sayfa dokümanı "birim alış fiyatı" alanını bağlayıcı sayıyor
(`admin-satin-alma.md §2`), ve "toptan alıp paketleme" hesabı birim maliyeti ekranda üretir
(toplam ÷ paket sayısı). Yani admin yolu:

1. **PO'suz doğrudan alım** — birim maliyet elle girilir (bugün hiç taşınamıyor; asıl açık bu),
2. **PO'lu kabul** — fiyat PO'dakinden farklı geldiyse düzeltilebilmeli (son alış fiyatı ve
   yenileme maliyeti tabanı — auto_price bu tabana bakıyor — gerçek fiyatı izlesin).

**İstenen:** satır maliyetini taşıyan ayrı bir admin giriş yolu; `IntakeFormLine`'ın kendisi
maliyet almasın ki depocu sınırı tipte kalsın. Biçim size kalmış — örnek: `receiveGoods` girişine
`costs?: Record<variantId, cents>` haritası ya da ayrı bir `receivePurchase` kapısı. Öncelik
kuralı: satır maliyeti > PO eşlemesi > null. Depocu yolu ve mevcut testler (serileştirilmiş
çıktıda fiyat aranmaması) değişmez.

**Aciliyet:** ekranın diğer üç sekmesini bloklamıyor; diyalog UI'ı stub kaydetle iner.
