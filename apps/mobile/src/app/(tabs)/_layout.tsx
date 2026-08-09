import { Tabs, useRouter } from 'expo-router';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomTabBar, type BottomTabItem } from '@/components/ui/bottom-tab-bar';
import type { IconName } from '@/components/ui/icon-paths';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { useWholesale } from '@/screens/customer-kit/use-me.hook';
// `typeof messages` için DEĞER bağı gerek (Messages tipi JSON'dan türer) — `import type` olmaz.
import messages from './messages.json';

/*
  SEKME KABUĞU — dört sekme: Vitrin · Katalog · Paketler|Siparişler · Hesap. Sepet SEKME DEĞİL;
  ona FAB ve yapışkan barlardan gidilir.

  ── ÜÇÜNCÜ SEKME PERSONAYA GÖRE ÇATALLANIR (v3:1883) ────────────────────────
  Tasarımın satırı tek cümlede söylüyor:
      [isB2B() ? 'orders' : 'pkgs',  isB2B() ? 'Siparişler' : 'Paketler']
  Yani perakende müşteri PAKETLER'i, onaylı toptancı SİPARİŞLER'i görür. Gerekçe veride yazılı:
  paket listesi B2B'de zaten BOŞ döner (v3 `pv2.rows` toptancıda boşaltılıyor) — toptancıya boş
  bir sekme, perakendeciye dördüncü bir sipariş kapısı vermek olurdu. Bir önceki kurgudaki
  "Fikirler" sekmesi tasarımda YOKTU ve söküldü (ekranı iki ayrı ekrana bölündü: bu sekme
  Paketler, tarifler ise vitrinden açılan `/recipes`).

  ── ÇATALIN ROTA KARŞILIĞI (bilinçli sapma) ─────────────────────────────────
  Prototipte sekmeler tek bir `tab` durumudur, yani `orders` hem sekme hem yığın sayfası olabilir.
  expo-router'da bir rota TEK yerde yaşar ve `/orders` bir YIĞIN ekranıdır (`app/orders.tsx` —
  hesap menüsü, vitrinin takip bandı ve sipariş onayı hep oraya gider). Bu yüzden toptancının
  üçüncü yuvası sekme değil, `/orders`ı AÇAN bir yuvadır: rota aynı, kabuk aynı, tek fark
  ekranın sekme çubuğuyla değil yığında açılması. Alternatifi `/orders`ı sekme grubuna taşıyıp
  perakendecide gizlemekti — o zaman da perakendecinin hesap menüsünden açtığı siparişler ekranı
  "hiçbir sekme seçili değil" hâlinde çizilirdi.

  ÇUBUĞUN KENDİSİ KİTTE (`BottomTabBar`), bağlama burada: router'ın durumu (hangi rota seçili) →
  kitin anladığı düz liste. Böylece kit navigasyon kütüphanesinin şeklini bilmez ve testi
  router'sız koşar.

  METİN KOLOKASYONU: sekme etiketleri bu klasördeki `messages.json`da (CLAUDE §2 — global JSON
  yok, tip `LocalizedCopy`den türer). JSON dosyası expo-router için ROTA DEĞİLDİR: yönlendirici
  yalnız `.js/.jsx/.ts/.tsx` uzantılarını tarar, o yüzden metin dosyası kullanıldığı yerin
  yanında durabiliyor.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * Sekme sırası TASARIMIN sırasıdır; rota adları İngilizce (CLAUDE §2 — iç yol İngilizce).
 *
 * İKON EŞLEMESİ BURADA çünkü "hangi rota hangi ikonu taşır" navigasyonun bilgisidir — kit yalnız
 * çizer. Şablonun `IC` sözlüğü (v3:1881) ile aynı eşleme; tek fark ana rotanın adıdır: dosya adı
 * `index` (expo-router'ın kök rotası), tasarımın ikonu `home`.
 */
const TABS = {
  index: 'home',
  catalog: 'catalog',
  packages: 'packages',
  account: 'account',
} as const satisfies Record<string, IconName>;
type TabName = keyof typeof TABS;

const TAB_ORDER = Object.keys(TABS) as TabName[];

const isTabName = (name: string): name is TabName => TAB_ORDER.some((tab) => tab === name);

export default function TabsLayout() {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const router = useRouter();
  /* Ölçüt tek yerde (`useWholesale`): vitrinin TOPTAN rozetiyle aynı soruyu sorar. Oturum
     okunana dek `false` — yani çubuk PERAKENDE hâliyle açılır ve profil gelince toptancıda
     üçüncü yuva Siparişler'e döner. Tersi (önce Siparişler) daha kötü olurdu: müşterilerin
     ezici çoğunluğu perakende ve her açılışta bir kere yanlış sekme görürlerdi. */
  const wholesale = useWholesale();

  return (
    <Tabs
      // Başlık çubuğunu ekranlar KENDİ çiziyor (tasarımda yapışkan, kendi içeriğiyle) — yerel
      // başlık ikinci bir çubuk olurdu.
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <BottomTabBar
          testID="bottom-tabs"
          items={state.routes.map((route, index): BottomTabItem => {
            /* TOPTANCININ ÜÇÜNCÜ YUVASI: paket sekmesinin yerini siparişler alır. Yuva hiçbir
               zaman "seçili" olmaz çünkü `/orders` bu ağacın dışında, yığında açılıyor (künye) —
               açıldığı an sekme çubuğu zaten ekranda değildir, yani seçili bir sekme aramak da
               yanlış olurdu. */
            if (wholesale && route.name === 'packages') {
              return {
                key: 'orders',
                label: t.tabs.orders,
                icon: 'orders',
                selected: false,
                onPress: () => router.push('/orders'),
              };
            }

            return {
              key: route.name,
              // Tanınmayan rota adı SESSİZCE gizlenmez, ham adıyla görünür: sekme eklenip sözlüğe
              // yazılmadığında eksiklik ekranda fark edilsin (boş bir etiketten iyidir).
              label: isTabName(route.name) ? t.tabs[route.name] : route.name,
              /* Tanınmayan rotanın ikonu ne olacak sorusunun DÜRÜST cevabı yok — bir ikon uydurmak
                 (ör. hep `home`) yanlış bir yere gidiyormuş izlenimi verirdi. Katalog dört kare
                 çizer ve "listelenmemiş" demenin en yakın karşılığıdır; etiket zaten ham adı
                 gösterdiği için eksiklik ekranda görünür kalıyor. */
              icon: isTabName(route.name) ? TABS[route.name] : ('catalog' as const),
              selected: state.index === index,
              onPress: () => {
                /* React Navigation sözleşmesi: dokunuş önce OLAY olarak duyurulur; bir dinleyici
                   (ör. "seçili sekmeye tekrar basınca listeyi başa sar") onu iptal edebilir.
                   Doğrudan `navigate` çağırmak o kapıyı baştan kapatırdı. */
                const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (state.index !== index && !event.defaultPrevented) navigation.navigate(route.name);
              },
            };
          })}
        />
      )}
    >
      {/* Sıra DOSYA adına göre değil, bu bildirime göre: alfabetik sıra "account" ile başlardı. */}
      {TAB_ORDER.map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}
