# docs/talep — şeritler arası talepler

Bir şeridin başka bir şeritten istediği iş burada yaşar (kullanıcı kararı 03.08). Daha önce
`docs/build/*-talebi.md` dosyalarıyla kuralsız yapılıyordu; **yeni talep oradan AÇILMAZ** — eski
dosyalar kapanana dek yaşar, yenisi buraya gelir.

## Kurallar

- **Dosya başına TEK talep.** Ad: `<kime>-<konu>.md` (ör. `arka-uc-stok-toplu-okuma.md`).
  Küçük harf, tire; şerit adları: `arka-uc` · `operasyon` · `musteri`.
- **Yapı sabittir** (aşağıdaki şablon): kimden/kime/tarih/ilgili görev başta; talep "ne + neden"
  anlatır, çözümü dayatmaz; hedef şerit **Cevap** bölümüne yazar (karşı öneri serbest).
- **Talebi AÇAN kapatır:** karşılandığını doğrulayınca DOSYAYI SİLER. Durum güncellemesi,
  arşivleme, "kapandı" notu YOK — kalıcı kayıt isteyen karar, ilgili görev satırına ya da künyeye
  iner (CLAUDE §5: durumun tek sahibi görev satırıdır).
- **Repoya gönderilmez.** Klasör `.gitignore`'da (`README` hariç); kullanıcı gerekli görürse
  `git add -f docs/talep/<dosya>` ile kendisi gönderir.
- Kalıcı olması gereken hiçbir şeyi YALNIZ buraya yazma: klasör commit'lenmediği için buradaki
  metin yedeksizdir ve silinmek üzere doğar.

## Şablon

```markdown
# Talep: <kısa başlık>

- **Kimden → Kime:** <şerit> → <şerit>
- **Tarih:** GG.AA.YYYY
- **İlgili görev:** (NN.k) — varsa; yoksa "yok" yaz
- **Aciliyet:** engelliyor | sıradaki işime lazım | fırsat bulunca

## Talep

<Ne isteniyor ve NEDEN — hangi ekran/akış bekliyor, çözümsüz kalırsa ne olur.
Çözüm önerisi yazılabilir ama karar hedef şeridindir.>

## Cevap

<Hedef şerit yazar: kabul + nasıl karşılandı (dosya/commit), ya da karşı öneri/ret gerekçesi.>
```
