# 12 — Para, Ön Muhasebe ve Kârlılık

## Kapsam

Tüm finans tek mantıkla: para bir hesapta durur, hareketlerle girer/çıkar. Hesaplar, para hareketleri, tedarikçi/sipariş bağları, banka import, kârlılık raporları, muhasebe export. **Sistem resmî muhasebe değildir** — resmî belge üretmez, temiz veri export eder.

## Okunacaklar

- `DOMAIN.md §9` (para hareketleri/hesaplar/satın alma), `§12` (kârlılık ürün vs şirket), `§16` (tedarikçi borcu)
- `DATA_MODEL.md` (Account/MoneyMovement/BankImportProfile/StockIntake)
- `FEATURES.md` (Ön muhasebe), `INTEGRATIONS.md` (muhasebe export hedefi)

## Bağımlılık

`02-database`, `03-domain-core` (kâr türetimi), `07-siparis` (tahsilat/iade hareketleri), `06-stok` (StockIntake/tedarik).

## Başlarken verilecek izah (örnek)

> "Paranın izlendiği katmanı kuruyoruz. Kasa, bankalar ve Stripe — hepsi birer 'hesap'; her giriş çıkış bir 'hareket' (sipariş tahsilatı, gider, tedarikçi ödemesi, transfer). Hesap bakiyesini ve kârı ayrı saklamıyoruz, hareketlerden hesaplıyoruz — tek kaynak. Banka ekstresini Excel'le alıp yapay zekâ yardımıyla eşleştiriyoruz. En sonda muhasebeciye temiz bir dosya çıkarıyoruz; fatura kesmiyoruz, o onların işi."

## Görevler

- [ ] **Hesaplar + hareketler:** `Account` (kasa/banka/Stripe) + `MoneyMovement` servisleri; elle giriş (tip/kategori/hesap); transferler (karşı hesap); bakiye **türetilir**
  - *Bitti:* hesap bakiyesi hareketlerden doğru; transfer iki hesaba simetrik yansıyor
- [ ] **Sipariş para bağları:** tahsilat/iade hareketleri (`order_payment`/`order_refund`) → `Order.amount_*` cache güncellemesi (kaynak hareketler); kurye gün kapanışı tahsilatları buraya düşer
  - *Bitti:* sipariş tahsilat toplamı hareketlerle birebir; cache tutarlı
- [ ] **Tedarik para bağları:** stok alımı → `purchase` hareketi (StockIntake bağı); tedarikçiye ödeme (`supplier_id`) → **tedarikçi borcu türetilir** (girişler − ödemeler)
  - *Bitti:* tedarikçi kartında borç doğru türeniyor
- [ ] **Banka import:** Excel yükle → AI sütun şablonu çıkar (`BankImportProfile`, hesaba özel) → satırlar hareket olarak → sipariş/gider/transfer eşleştirme (öneri + elle onay)
  - *Bitti:* ikinci import aynı bankada şablonu otomatik uyguluyor; eşleşme onaya düşüyor
- [ ] **Reklam gideri:** `category=advertising` + `meta.campaign` etiketi (13 ROI raporuna besleme)
  - *Bitti:* kampanya etiketli gider analitikte ciroyla yan yana gelebiliyor
- [ ] **Kârlılık raporları:** ürün/sipariş kârı (katkı payı: COGS/teslimat/komisyon/paketleme snapshot) + **fire düşülmüş net marj** (`StockAdjustment`); şirket kârı (genel gider bir kez düşülür); kanal bazlı
  - *Bitti:* ürün kârı snapshot'lardan; fire ayrı satır; şirket P&L genel giderle
- [ ] **Muhasebe export:** dönem seçimi + `is_gift_order` hariç + `reference_no ↔ invoice_no` eşleştirme kuyruğu; temiz veri dosyası
  - *Bitti:* hediye siparişler export dışı; export dosyası dönem toplamlarıyla tutuyor

## Netleşecekler

- **Export hedef biçimi:** muhasebecinin yazılımı (Pennylane/Sage/EBP/Tiime…) netleşince biçimlenir — iş bağımlılığı, teknik değil. Adaptör deseniyle tek hedefle başlanır.
