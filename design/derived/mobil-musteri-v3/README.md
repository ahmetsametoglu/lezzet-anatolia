# TÜRETİLMİŞTİR — elle düzenlenmez

Bu klasördeki dosyalar `design/project/Mobil - Musteri v3.dc.html` dosyasından üretilir. Kaynak, tasarım aracının
senkron çıktısıdır ve her senkronda EZİLİR; buradaki dosyalara yazılan düzenleme kaynağa
geri gitmez ve ilk yeniden üretimde silinir.

- Kaynak: `design/project/Mobil - Musteri v3.dc.html`
- Kaynak boyutu: 246293 bayt · 2229 satır
- Ekran sayısı: 23
- Yeniden üretim: `pnpm design:split` (her senkrondan sonra koşulur)
- Dizin: [index.md](index.md)

Her parçanın başındaki `<!-- kaynak: satır a-b -->` yorumu **kaynak dosyanın** satır
numaralarıdır — kod künyelerindeki `v3:238` biçimli referanslar bunlarla eşleşir.
