# 10 — Depo Yüzeyi

## Kapsam

Depo sorumlusunun üç ekranı: sipariş hazırlama (FEFO önerisi + parti kaydı), mal kabul (tedarik siparişinden dolu form), imha/sayım + sıcaklık. Operasyon evreni komponentlerinden inşa edilir. **Altın kural burada çok sıkı:** depocu fiyat, kâr, maliyet, müşteri iletişimi **görmez**.

## Okunacaklar

- `design/pages/depo-hazirlik.md`, `depo-stok-giris.md`, `depo-imha-sayim.md` (içerik bağlayıcı)
- `DOMAIN.md §2` (izin ilkesi), `§4` (FEFO/parti kaydı/rezervasyon), `§16` (tedarik/mal kabul)

## Bağımlılık

`06-stok` (parti/intake/adjustment servisleri, FEFO hesabı), `07-siparis` (hazırlık → durum), `09-admin` (operasyon komponent envanteri). Tasarım onayı: operasyon evreni.

## Başlarken verilecek izah (örnek)

> "Deponun ekranlarını kuruyoruz. Hazırlık ekranında sistem her sipariş için hangi partiden alınacağını söylüyor (önce tarihi yakın olan) — depocu 'hazırlandı' deyince hangi partiden çıktığı kendiliğinden kaydediliyor, ekstra iş yok. Mal kabulde, admin bir sipariş göndermişse form hazır geliyor; depocu sayıyı, tarihi, lot numarasını doğruluyor. Bu ekranların hiçbirinde fiyat ya da kâr görünmüyor — depocunun işi mal, para değil."

## Görevler

- [ ] (10.1) **Hazırlık ekranı:** günün hazırlama listesi (FEFO sırası), sipariş kalemleri + sistem parti önerisi; "hazırlandı" onayı → `OrderItemBatch` otomatik yazılır (07 teslim akışına zemin)
  - *Bitti:* onayla parti kaydı düşüyor; ekranın hiçbir yerinde fiyat/kâr yok
- [ ] (10.2) **Öneriden sapma:** depocu farklı partiden aldıysa yalnız o satırı değiştirir; partiye kilitli teklif kalemi değiştirilemez
  - *Bitti:* sapma kaydediliyor; pinned kalem sabit kalıyor
- [ ] (10.3) **Eksik işaretleme:** karşılanamayan adet işaretlenir; sistem akıllı öneri sunar (müşteriye sor / kalanı gönder) ama karar depocuda; para hesabı depocuya görünmez
  - *Bitti:* eksik işareti 07 kısmi karşılama akışını tetikliyor; tutar görünmüyor
- [ ] (10.4) **Mal kabul:** bekleyen tedarik siparişinden dolu form (yoksa boş); ürün/varyant + adet + son tarih + lot + tedarikçi + konum; MLOR uyarısı (engelsiz); paketleme girişi; PO → `received`
  - *Bitti:* PO'lu kabul dolu formla açılıyor, eksik/fazla fark olarak işaretleniyor; alış fiyatı alanı yok
- [ ] (10.5) **İmha/sayım:** `StockAdjustment` (parti + adet + sebep: son tarih/hasar/sayım/kayıp); teslim-sonrası iade → varsayılan imha (restok admin istisnası, depocuya restok seçeneği sunulmaz)
  - *Bitti:* imha kaydı düşüyor; fire raporuna besleniyor (12)
- [ ] (10.6) **Sıcaklık kaydı:** `TemperatureLog` (dolap/araç + derece), günde 1-2 elle giriş
  - *Bitti:* kayıt tutuluyor, geçmiş görünüyor

## Netleşecekler

- Yok — kurallar netleşti. İç terimlerin (FEFO/MLOR) sade karşılıkları tasarım sırasında kesinleşir; kod terimi arayüze taşımaz.
