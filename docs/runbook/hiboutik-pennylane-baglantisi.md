# Runbook — Hiboutik → Pennylane satış bağlantısı

> **Ne zaman okunur:** canlı Pennylane şirketinde Hiboutik satış bağlantısını kurarken ya da değiştirirken. Seçimler
> 07.10'da test şirketinde yapılan kurulumun gerekçeli hâlidir; hesap numaraları test şirketinin hesap planından,
> canlı planda aynı adla aranır.

## Nasıl çalışır

- Pennylane'in Hiboutik bağlantısı her sabah 06:00'da Hiboutik'in **kapanmış** günlerini okur ve günü satış kaydı olarak
  yazar. Kapanmamış günde "POS still open for date … in location N" der, hiçbir şey yazmaz (test şirketinde ölçüldü:
  demo kasa günü kapatmıyor, bu yüzden akış testte görülemez).
- Gün kapanışını bizim gece işimiz yapar (00:15, yalnız `HIBOUTIK_MODE=live`); 06:00'daki okuma ondan sonradır.
- B2C satış Pennylane'e yalnız bu bağlantıdan girer. Banka hareketi bankadan, alış faturası bizden gider.

## Önce

1. Hiboutik üretim kipinde olmalı ve backend'de `HIBOUTIK_MODE=live` tanımlı olmalı.
2. Canlı Pennylane'de satış günlüğü aç (Pennylane ekranından; API günlüğün türünü seçtirmiyor): kod **VTC**, ad
   **Ventes caisse Hiboutik**, tür satış.
3. Bizde Ayarlar › Kurulum › Hiboutik kartında tesisi mağazaya eşle. Eşleme Hiboutik'te **Livraison** kategorisini de
   açar (dış referans `livraison`); Hiboutik › Catégories'de göründüğünü kontrol et.
4. Ayarlar › Para › Kart ödemeleri aktarım hesabı = **Revolut Current EUR** (testte LA-TEST hesabıydı; Revolut aktarımı
   Merchant'tan Business hesabına gider).

## Sihirbaz (Pennylane › Marketplace › Hiboutik)

1. **Pennylane** ve **Hiboutik**: bağla.
2. **Journal** → VTC · Ventes caisse Hiboutik.
3. **Méthodes de paiement**:

   | Hiboutik | Hesap |
   |---|---|
   | VIR | 41106013 Clients - virements |
   | WEB | 41106001 Clients - CB |
   | CB | 41106001 Clients - CB |
   | ESP | 41106002 Clients - espèces (çekmeceyi kendi hesabında izlemek isterse muhasebeci 530 Caisse seçer) |
   | CHE | boş; izin vermezse 41106014 Clients - chèques |

4. **Comptes comptables de ventes** → "Ventiler les ventes par catégorie" sekmesi:
   - Other → **707 Ventes de marchandises**
   - Livraison → **7085 Ports et frais accessoires facturés**
   - "Ventiler les ventes par taux de TVA" sekmesi boş kalır.
5. **Valeurs par défaut** (yukarıdan aşağı; "Appliquer à tout"a basılmaz):
   1. 4261 Service au pourcentage réparti
   2. 6431 Service réparti
   3. 7068 Service au pourcentage revenant au personnel
   4. 758 Indemnités et autres produits
   5. 658 Pénalités et autres charges
6. **Comptes comptables offerts** → Non.
7. **Rabais, remises et ristournes** → Non.
8. **Configuration**:
   - Date de début de synchronisation → Hiboutik'in canlıya geçtiği gün.
   - Montant d'écart maximum → **0.05**.
   - Activer l'intégration.

"Mapping IA" alanları kendisi doldurur; kullanılırsa sonuç bu listeyle karşılaştırılır.

## Sonra

- Ertesi sabah 06:00'dan sonra: Mes intégrations › Export des ventes vers Pennylane › Historique d'exécution › Voir les
  détails. "POS still open" yazmamalı, Problèmes (0) olmalı.
- Pennylane'de VTC günlüğünde günün kaydı: ürün 707'de, kargo 7085'te, ödeme türleri borçta "Clients - …" hesaplarında;
  toplam Hiboutik'in günlük Z'siyle aynı.
- Bizde Kurulum › Hiboutik kartında gün sonu "kapandı" der.

## Gerekçe

- **Kargo 707'ye gitmez:** PCG'ye göre kayıt adı niteliğine uyan hesaba yazılır (Art. 1011-5); faturalanan kargo
  708 "Produits des activités annexes" altındadır, 7085 onun isteğe bağlı alt hesabıdır (PCG, 1 Ocak 2026). Bu yüzden
  kargo ürünü Hiboutik'te ayrı kategoridedir. Ücretsiz kargo fişe yazılmaz; maliyeti taşıyıcının faturasıyla gider olur.
- **Ürün 707:** PCG ticari malı olduğu gibi yeniden satılacak stok diye tanımlar; 701 kendi üretimin içindir.
- **İndirim ayrı hesaba gitmez:** 709 yalnız fatura dışı ya da bir satışa bağlanamayan indirim içindir (Art. 1222-70);
  fişe indirim düşülmüş tutar yazılır.
- **İkram yok:** hediye sipariş kasaya yazılmaz, ödemesiz kapanır.
- **Ödeme türü banka hesabına bağlanmaz:** banka akışı aynı parayı bankaya ayrıca yazar; satış "Clients - …" bekleme
  hesabına borç yazılır, para gelince banka satırı onu kapatır. CB ve WEB aynı hesapta, çünkü Revolut ikisini tek
  aktarımla gönderir.
- **0.05 sınırı:** fişte kalem ve ödeme toplamı kuruşu kuruşuna tutar; daha büyük fark gerçek eksik ya da fazla
  ödemedir ve yuvarlama (658/758) sayılmamalı, bağlantının kayıtlarında hata olarak görünmeli.

İki tarafta elle yapılmayacaklar: `muhasebe-duzeni.md`.
