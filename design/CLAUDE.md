# Proje notları

- Ekran görüntüsü ve indirme paketi **yalnızca kullanıcı açıkça istediğinde** üretilir. Kendiliğinden ekran görüntüsü alma, klasör hazırlama veya indirme kartı sunma.

## Ekran görüntüsü kuralları (istendiğinde)

- Sadece **telefon çerçevesinin** olduğu alan alınır — çevresindeki boş tuval, masaüstü zemini ya da yatay kırpma olmaz. Kare/dikey oran korunur.
- Sayfa kaydırma gerektiriyorsa görüntü **tam içerikle** alınır: kaydırılabilir kap geçici olarak `height: scrollHeight`, `overflow: visible` yapılır, sonra tek kare çekilir. Yarısı kesilmiş ekran teslim edilmez.
- Dosya adları hiyerarşik: `screenshots/<Bölüm>/<Alt akış>/<sıra>-<Ekran>.png`.
