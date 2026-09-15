# Tasarım dosyaları

Giriş noktası `Harita.dc.html` — tüm ekranların tıklanabilir dizini. Her `.dc.html` tek dosyalık, kendine
yeterli bir tasarım komponentidir (HTML şablonu + aynı dosyada `Component` sınıfı; stil satır içi).
Yanındaki `support.js` çalışma zamanıdır, elle düzenlenmez. Bağlantılar göreli yoldur; dosya taşınmaz.

- `01-musteri/` müşteri yüzeyi — `Musteri Mobil.dc.html` native uygulama VE mobil web için TEK kaynak;
  `Musteri Web.dc.html` masaüstü.
- `02-operasyon/` operasyon yüzeyi — `AdminSidebar.dc.html` paylaşılan sol menü; `Operasyon - *.dc.html`
  masaüstü ekranlar; `Operasyon Mobil.dc.html` cihaz uygulaması.
- `03-bildirim/` e-posta ve WhatsApp şablonları · `04-belge/` yazdırılan belgeler.
- `05-envanter/` komponent envanterleri, token ve backend notları · `00-marka/`, `06-marka/`, `assets/` marka ve görseller.
- `derived/` betiklerin ürettiği ekran parçaları (`scripts/design-split.mjs` → `design-shot.mjs`).

Adlandırma `<Alan> - <Ekran>.dc.html`; geçerli sürümde sürüm numarası yoktur.

**Claude Design'dan alınan paket:** repoya yalnız `.dc.html`, `support.js` ve `assets/` girer. Sayfa brief'leri
(`pages/`), yüklemeler (`uploads/`), dışa aktarımlar (`08-export/`), ekran görüntüleri (`screenshots/`), keşif
panoları (`07-kesif/`) ve eski sürümler (`09-arsiv/`) `.gitignore`dadır; yanlışlıkla eklenemez. Görsel karar
bu dosyalarda verilidir, kod birebir uygular (`CLAUDE.md §3`); tasarım açıkları `docs/KALAN.md`'de.
