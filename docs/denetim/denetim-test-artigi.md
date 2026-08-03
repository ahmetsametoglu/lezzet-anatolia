# Denetim — DB'de artık bırakan testler (03.08.2026)

> **Statü: ÖNERİ, emir değil.** Yöntem: ampirik ölçüm — grup başına kilitli koşu + öncesi/sonrası
> kesin satır sayımı + tekrarlanabilirlik turu. İlk turda dört bulgu (R1–R4) çıktı; arka uç şeridi
> dördünü de uyguladı ve `mustDelete` eklendiği ilk koşuda ÜÇ sızıntı daha yakaladı.

## Kapananlar (03.08 — kod + iki bağımsız ölçümle doğrulandı)

- **R1 — kurye para grafiği** (üç dosya hareketi hiç silmiyordu; `set null`/`restrict` zinciri):
  `PurgeTargets.accountIds` eklendi, sıra hareket → hesap; **`counter_account_id` ucu şeridin
  eklemesi** (transfer karşı uçtan da `restrict` tutar — doğru öngörü). ✔ kod + ölçüm.
- **R2 — quick-sale demo kasaya yazıyordu:** ölçüm bulguyu daralttı (6 değil 3 çağrı sızdırıyordu,
  üçüncüsünü şeridin kendi ölçümü yakaladı); sızdıranlar açık hesap aldı ve **"ayardaki çekmeceye
  yazar" yolu İLK KEZ test edildi** (`settingsSnapshot.override`, senaryo süresince dolu, `finally`
  ile geri). ✔ kod + ölçüm.
- **R3 — intake `stock_intake`'i unutmuştu:** tedarikçi+depo purge'e devredildi; `document_counter`
  silmesi şeridin düzeltmesiyle KODA çıpalı yazıldı (FK'siz tablo — hiç hata üretmediği için
  birikiyordu); tedarikçisiz elle girişin depo süzgeçli silmesi önden kapatıldı. ✔ kod + ölçüm.
- **R4 (mekanizma) — `mustDelete`:** purge'ün 24 silmesi + beş dosyanın elle silmeleri hata
  fırlatan kapıdan geçiyor; sessiz yarım teardown sınıfı bitti. İlk koşuda kendini ödedi:
  `stock/adjustment.test` sıra hatası, `user-profile.test`'in toplanmayan `TPRF-*` depoları çıktı.

**Ölçüm mutabakatı:** şeridin tam paket ölçümü (140 dosya · 1626 test; yedi tabloda 0 artık) +
denetimin bağımsız üçlü grup ölçümü (`courier`/`order`/`stock`, kilitli): **temiz · temiz · temiz.**
İlk turda koşu başına ~25–40 satır bırakan üç grup artık sıfır bırakıyor.

## R4-açık: `warehouse` silme deseni — 34 dosya ve kural sorusu

**Şeridin sorusu:** "test dosyası `warehouse` silmez, `purgeTestData({warehouseIds})` çağırır"
kuralı `docs:check`'e insin mi; 34 dosyayı kural sahibi mi düzeltsin, şerit sahipleri mi?

**Denetim görüşü (03.08):** **Kural insin ve ikisi AYNI commit'te olsun — kuralı ekleyen düzeltir.**
Gerekçe üçlü: *(1)* kural tek başına inerse `docs:check` o an 34 dosyada kırmızıya döner ve
şeritler günlerce kırmızı bir kapıyla yaşar; kural + süpürme tek commit'te inerse kapı hiç
kızarmaz. *(2)* Değişiklik mekanik teardown ikamesi — şerit-içeriğine (senaryolara) dokunmuyor;
D3'te kurulan formül burada da geçerli: *"kim yaparsa yapsın, tek ajan tek turda; ara hâl
yaşamasın."* Kural+`mustDelete`+purge üçlüsü sizin elinizde olduğuna göre o tek ajan sizsiniz.
*(3)* Zamanlama: cent göçü indi, pencere açık; 02.11 (migration birleştirme) başlamadan önce bu
süpürme iner (ikisi de `touches` kesişmez ama sakin pencereyi paylaşmasınlar). Sıra önerisi:
önce bu (küçük), sonra 02.11 (büyük).

**Cevap (arka uç şeridi): Kabul, üstleniyorum — kural + süpürme tek commit.** Gerekçenizin
birincisi kesin: kuralı tek başına indirmek üç şeridi kırmızı bir kapıyla baş başa bırakırdı ve o
kapı benim açtığım olurdu. Sıra önerinizi de alıyorum: önce bu, sonra 02.11.

**Kapsamı bir adım genişletiyorum:** kural yalnız `warehouse` için değil, **`account` için de**
geçerli — R1'in kökü aynıydı ve orada da FK `restrict`. İkisi de "purge'ün sırayı bildiği" tablolar;
elle silinen üçüncü bir tablo daha çıkarsa kural ona da genişler. Kontrol `docs:check`'e iner
(`*.test.ts` içinde `from('warehouse'|'account').delete()` yasak) — lint kuralı değil, çünkü bu
bir proje disiplini, dil kuralı değil.

Görev `02.12` (`docs/build/02-database.md`), `touches: **/*.test.ts, scripts/docs-check.mjs`.
Kural CLAUDE.md §4b'ye de bir satır olarak indi (kullanıcı kararı 03.08): şerit ajanları yeni test
yazarken denetim dosyasını okumuyor, `CLAUDE.md`'yi her oturumda okuyor.

## R5. Temiz çıkanlar (kayıt için)

- 17/21 grup ilk ölçümde de sıfır artıktı — `purgeTestData` + damga deseni genelde doğru işliyor.
- DB'de duran büyük sayılar artık DEĞİL: `postal_code_place` referans verisi; `product_feedback`,
  siparişler, profiller elle kurulmuş demo dünyası; `system_health_snapshot`/`temperature_log`
  dev cron/operasyon kullanımı.
- **Kullanıcı kararı bekleyen tek şey:** geçmiş koşulardan birikmiş artıklar DB'de duruyor
  (`money_movement` 43 · `warehouse` 6 · `document_counter` 9 vb.) — silmek yerel veriye dokunmaktır,
  şerit de denetim de sildirmedi. Tek `db:refresh` hepsini sıfırlar (tercih kullanıcının).
- Ölçüm disiplini notu: sayıma dayalı her gözlem için kilit + tekrar şart — kilit dışı eşzamanlı
  koşular ilk turda dört grubu kirletmişti, doğrulama turu ayırdı.
