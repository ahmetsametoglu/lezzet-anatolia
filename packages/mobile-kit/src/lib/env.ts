import Constants from 'expo-constants';

/*
  EXPO_PUBLIC_* değişkenleri Metro tarafından DERLEME anında gömülür — bu yüzden okuma
  `process.env.EXPO_PUBLIC_X` biçiminde STATİK olmak zorunda (dinamik `process.env[name]`
  gömülmez, üretimde sessizce undefined olur). Getter'lar çağrı anında değerlendirilir:
  test ortamı değişkeni koşudan önce atayabilir, üretimde ise Metro değeri satır içine yazar.

  Eksik değişken SESSİZ undefined dönerdi — tek kapı + gürültülü hata bunun panzehiri
  (CLAUDE §1 "ölçülemeyen değer sıfır değildir" ile aynı sınıf kural: yokluk, boş değer değildir).

  ── YEREL SUNUCUNUN HOST'U TAHMİN EDİLMEZ, CİHAZA SORULUR (30.08) ───────────
  Gömülü değer TEK'tir ama hedefler ÜÇ ve üçünün "yerel makine" tarifi ayrı:

    · iOS simülatörü   → makinenin ağ yığınını paylaşır, `localhost` doğrudan çalışır
    · Android fiziksel → `adb reverse` köprüsü telefondaki `localhost`u makineye taşır
    · iOS fiziksel     → KÖPRÜSÜ YOK; `localhost` telefonun KENDİSİDİR

  Üçüncüsü uzun süre kapsanmıyordu (ölçüldü 30.08: ürünler gelmiyor, "bağlantı yok" deniyor —
  oysa her şey ayakta; telefon kendi 3002'sine bakıyordu).

  **İki eski çare de yetmiyordu:**
  `localhost` yazmak iOS fiziksel cihazı dışarıda bırakıyor. Makinenin LAN IP'sini yazmak
  üçünü de kapsıyor ama SABİT bir sayıdır ve router onu değiştirdiği gün uygulama SESSİZCE
  kopar (ölçüldü 27.08: `192.168.1.161` → `.130`; dev-client sunucuyu bulamadı). Bu yüzden
  27.08'de `localhost`a dönülmüştü — arıza takas edilmişti, çözülmemişti.

  **Doğru cevap üçüncü bir yerde:** host'u BİZ seçmiyoruz. Cihaz Metro'ya zaten bir adresten
  bağlandı ve Expo o adresi `hostUri` ile söylüyor. Yani her hedef kendi doğru host'unu
  kendisi getiriyor — simülatör `localhost`, iOS fiziksel makinenin o anki LAN adresi,
  `adb reverse`li Android yine `localhost` (köprü BOZULMAZ). Sabit sayı olmadığı için IP
  değişimi de bir şeyi kırmıyor: bağlantı değişince okunan değer de değişir.

  ── ÜRETİMDE HİÇ ÇALIŞMAZ, VE BU ŞART ───────────────────────────────────────
  `hostUri` yalnız geliştirme sunucusuna bağlıyken dolu. Yayınlanmış derlemede boştur ve
  değişkenin kendi değeri (gerçek alan adı) aynen kullanılır. Tersi olsaydı — üretimde bir
  şekilde dolu gelen `hostUri` — uygulama müşterinin telefonundan bizim geliştirme makinemizi
  arardı. Kapı bu yüzden `__DEV__` ile de çevrili: yayınlanmış bir derlemede bu kod hiç koşmaz.
*/

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} tanımsız — apps/mobile/.env dosyasını .env.example'dan oluşturun`);
  }
  return value;
}

/**
 * Cihazın Metro'ya ulaştığı host (`192.168.1.161` · `localhost`), portsuz. Geliştirme
 * sunucusuna bağlı DEĞİLSE `null` — yayınlanmış derlemenin normal hâli.
 *
 * IPv6 adresi köşeli parantezli gelebilir (`[::1]:8081`); son iki nokta üst üsteden bölmek
 * adresin içindekileri korur.
 */
function devServerHost(): string | null {
  if (!__DEV__) return null;

  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;

  const portAyraci = hostUri.lastIndexOf(':');
  const host = portAyraci === -1 ? hostUri : hostUri.slice(0, portAyraci);
  return host.length > 0 ? host : null;
}

/**
 * Yerel bir adresin host'unu cihazın gerçekten ulaşabildiğiyle DEĞİŞTİRİR; portu ve şemayı
 * olduğu gibi bırakır.
 *
 * **Yalnız yerel adreslere dokunur.** Değişken gerçek bir alan adı gösteriyorsa (sahne ya da
 * üretim ortamına bakan bir geliştirme derlemesi) dokunmak, geliştiricinin bilerek yazdığı
 * hedefi sessizce makinenin kendisine çevirmek olurdu — ölçtüğü şey artık ölçmek istediği şey
 * olmazdı.
 */
function withDevHost(url: string): string {
  const host = devServerHost();
  if (!host) return url;

  /*
    `URL` KULLANILMIYOR ve bu ölçülmüş bir karar (30.08). React Native'in `URL`i eksik bir
    polyfill: `hostname` ataması sessizce işlemiyor — testte yakalandı, cihazda da işlemezdi ve
    düzeltme "yazıldı ama çalışmıyor" hâlinde kalırdı. Eşleşme dar tutuldu: yalnız şema + yerel
    host + isteğe bağlı port; gerisine (yol, sorgu) dokunulmuyor.
  */
  return url.replace(/^(https?:\/\/)(?:localhost|127\.0\.0\.1)(?=[:/?#]|$)/i, `$1${host}`);
}

export const env = {
  /** `/api/v1` taban adresi (apps/mobile-api — yerelde http://localhost:3002). */
  get apiUrl(): string {
    return withDevHost(required(process.env.EXPO_PUBLIC_API_URL, 'EXPO_PUBLIC_API_URL'));
  },
  get supabaseUrl(): string {
    return withDevHost(required(process.env.EXPO_PUBLIC_SUPABASE_URL, 'EXPO_PUBLIC_SUPABASE_URL'));
  },
  /** Anon (publishable) anahtar — SECRET anahtar HİÇBİR koşulda mobil bundle'a giremez (02-mimari §4). */
  get supabaseKey(): string {
    return required(process.env.EXPO_PUBLIC_SUPABASE_KEY, 'EXPO_PUBLIC_SUPABASE_KEY');
  },
};
