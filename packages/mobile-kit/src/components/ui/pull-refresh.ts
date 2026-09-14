/*
  AŞAĞI ÇEKİP YENİLEME HALKASININ RENGİ — tek karar, tek yer (21.29d).

  ── NEDEN VAR: İKİ PLATFORM İKİ AYRI PROP İSTİYOR ───────────────────────────
  `RefreshControl` halkanın rengini iOS'ta `tintColor` (tek renk), Android'de `colors` (renk
  DİZİSİ) ile alır. Yalnız `tintColor` verilen bir ekran iOS'ta markanın yeşilini, Android'de
  sistemin varsayılan SİYAHINI gösterir — ve bu sessizdir, hiçbir uyarı çıkmaz.

  Ölçüldü (kullanıcı bulgusu 10.08 · doğrulama 11.08): altı ekranın hepsinde `tintColor` vardı,
  `colors` YALNIZ katalogda. Yani Android'de katalog yeşil, ötekiler siyah dönüyordu — tam olarak
  kullanıcının gördüğü tutarsızlık.

  ── NEDEN KOMPONENT DEĞİL, YAYILAN PROPLAR ──────────────────────────────────
  `ScrollView`/`FlatList` `refreshControl` elementini `cloneElement` ile klonluyor; araya kendi
  sarmalayıcımızı koymak, klonlanan propların yanlış komponente gitmesi demekti. Bu yüzden ortak
  olan şey KOMPONENT değil KARAR: iki prop tek yerden türer, çağıran onu yayar.

  Renk çağırandan gelir çünkü tema bir HOOK'tan okunuyor (`useUnistyles`) ve bu dosya modül
  düzeyinde; hook çağıramaz. Ham renk yazmak da yasak (CLAUDE §3) — token ekranın elinde.
*/

/** Halkanın iki platformdaki rengi. Çağıran: `<RefreshControl … {...pullRefreshColors(theme.colors.olive)} />` */
export function pullRefreshColors(color: string): { tintColor: string; colors: string[] } {
  return { tintColor: color, colors: [color] };
}
