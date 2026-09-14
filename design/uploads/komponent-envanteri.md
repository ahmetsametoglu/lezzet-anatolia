# Komponent Envanteri — Beklenen Biçim (META)

> Bu bir sayfa tasarım girdisi **değildir**; 7 başlıklı şablona tabi değildir. Bu doküman, Claude Design'ın tasarımla birlikte üreteceği **komponent envanteri sayfasının** beklenen biçimini tanımlar. Envanterin kendisini Claude Design yazar; burası "nasıl bir envanter bekliyoruz" sorusunun cevabıdır.

## Neden var

Biz **önce komponentleri kodlayacağız, sayfaları bu kodlanmış parçalardan inşa edeceğiz.** Envanter bu yüzden süs değil, yapım planının kendisidir: envanterde net tanımlanmayan bir komponent kodlanamaz; envanterde olmayan bir parçayla kurulan sayfa inşa edilemez. Admin/operasyon tarafında bu disiplin kesindir; müşteri tarafında da form/liste/kart gibi parçalar ortak kalır (sayfaya özgü serbest bölgeler olabilir).

## İki stil evreni — iki ayrı envanter

Envanter **stil evreni başına ayrı** tutulur:

1. **Müşteri evreni** — vitrin (marka/iştah/güven dili)
2. **Operasyon evreni** — admin + depo + kurye (hız/netlik dili; telefon öncelikli, saha koşulları)

İki evren ayrı komponent setleri olabilir; bir evrenin komponenti diğerinde "aynı sayılmaz". Ortaklaştırma yapılacaksa açıkça yazılır ("bu komponent iki evrende ortak, tek koddan gelir").

## Her komponent kaydında olması gerekenler

Envanterdeki her komponent şu bilgileri taşır:

- **Ad** — kısa, tekil, tutarlı (ör. "Birincil Buton", "Sipariş Kartı", "Durum Rozeti"). Ad bir kez konur, her sayfada aynı adla anılır
- **Amaç** — tek cümle: bu parça ne işe yarar, hangi ihtiyaçtan doğdu
- **Varyantlar** — görsel/işlevsel çeşitleri (ör. buton: birincil / ikincil / tehlike; rozet: durum türlerine göre). Varyant listesi kapalı uçludur — "vb." ile bırakılmaz
- **Durumlar** — asgari şu beşi düşünülmüş olmalı: **normal / devre dışı / yükleniyor / hata / boş** (komponent için anlamlı olanlar; ör. bir listenin "boş" hali, bir butonun "yükleniyor" hali). Etkileşimli komponentlerde dokunma/odak halleri de tanımlanır
- **Kullanıldığı sayfalar** — bu komponenti kullanan sayfaların listesi. Bu alan çift yönlü sözleşmedir: bir komponent değişirse hangi sayfaların etkileneceği buradan okunur

## Envanter nasıl büyür

- Envanter **tek seferde yazılmaz; onaylı sayfalardan adım adım büyür.** Her evrenin ilk temsilî sayfası onaylandığında o sayfanın komponentleri envanterin çekirdeği olur
- Yeni bir sayfa tasarlanırken **önce mevcut envantere bakılır**: mümkün olan her yerde onaylanmış komponent yeniden kullanılır. Yeni komponent gerekiyorsa bu **açıkça belirtilir** ("bu sayfa envantere şu 2 yeni komponenti ekliyor") ve envantere işlenir
- Bir geri bildirim mevcut bir komponenti değiştirirse, o komponenti kullanan **önceki sayfalara etkisi açıkça yazılır** — sessiz tutarsızlık bırakılmaz
- Envanter her sayfa onayından sonra günceldir; "tasarım bitti, envanter sonra" diye bir aşama yoktur

## Biçim beklentisi

- Envanter **tek, kendine yeterli bir sayfadır** (evren başına bir bölüm veya evren başına bir sayfa — Claude Design'ın kararı); okuyan bir geliştirici hangi parçaları hangi sırayla kodlayacağını buradan çıkarabilmeli
- Komponentler mantıklı gruplarla sunulur (ör. temel girdiler / listeler-kartlar / geri bildirim-uyarı / yerleşim) — gruplama Claude Design'ın kararıdır, beklenti yalnız "bulunabilir olması"dır
- Her komponentin durum/varyant çeşitleri envanterde **görülür** olmalı (yalnız adı sayılmış değil, hali gösterilmiş) — kodlayan kişi tahmin yürütmek zorunda kalmamalı
- Envanter dili sade Türkçedir; iç sistem terimleri (FEFO, rezervasyon, MLOR) komponent adlarında ve etiketlerinde kullanılmaz
