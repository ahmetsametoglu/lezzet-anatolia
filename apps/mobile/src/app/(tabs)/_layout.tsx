import { Tabs } from 'expo-router';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomTabBar } from '@/components/ui/bottom-tab-bar';
import type { IconName } from '@/components/ui/icon-paths';
import { deviceLocale } from '@/lib/i18n/locale';
// `typeof messages` için DEĞER bağı gerek (Messages tipi JSON'dan türer) — `import type` olmaz.
import messages from './messages.json';

/*
  SEKME KABUĞU — dört sekme: Vitrin · Katalog · Fikirler · Hesap. Sepet SEKME DEĞİL; ona FAB ve
  yapışkan barlardan gidilir.

  ── ÜÇÜNCÜ SEKME "SİPARİŞLER" DEĞİL "FİKİRLER" (kullanıcı kararı 09.08) ─────
  Siparişler zaten Hesabım'ın alt sayfasıydı (ekranın kendi başlığı onu söylüyor) ve siparişe üç
  yoldan daha gidiliyordu: hesap menüsü, vitrinin takip bandı, sipariş onayı — yani sekme dördüncü
  bir kapıydı. Buna karşılık TARİF ve PAKETLERİN liste sayfası hiç yoktu: müşteri vitrindeki üç
  kartın ötesini göremiyordu, oysa paket hazır bir sepet, tarif ise çapraz satış. Sipariş yığına
  taşındı (`app/orders.tsx`, yol `/orders` korundu), yerine Fikirler girdi.

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
 * çizer. Şablonun `IC` sözlüğü (v3:1745) ile aynı eşleme; tek fark ana rotanın adıdır: dosya adı
 * `index` (expo-router'ın kök rotası), tasarımın ikonu `home`.
 */
const TABS = {
  index: 'home',
  catalog: 'catalog',
  /* FİKİRLER'in KENDİ İKONU YOK: sözlük v3'ün `IC` setinden birebir alınıyor (`icon-paths.ts`
     künyesi) ve o set dört sekmeyi Siparişler'le kurmuştu. Mevcutların en yakını `search` —
     "keşfet/gözat" karşılığı; tarif ve paket bölümlerini gezmek tam olarak bu. Kit sözlüğüne yeni
     bir geometri UYDURULMADI (CLAUDE §3: ikon bir tasarım kararıdır) — eksik raporlandı ve tasarım
     ampul/pusula benzeri bir ikon verdiği gün yalnız bu satır değişir. */
  ideas: 'search',
  account: 'account',
} as const satisfies Record<string, IconName>;
type TabName = keyof typeof TABS;

const TAB_ORDER = Object.keys(TABS) as TabName[];

const isTabName = (name: string): name is TabName => TAB_ORDER.some((tab) => tab === name);

export default function TabsLayout() {
  const t: Messages = messages[deviceLocale()];

  return (
    <Tabs
      // Başlık çubuğunu ekranlar KENDİ çiziyor (tasarımda yapışkan, kendi içeriğiyle) — yerel
      // başlık ikinci bir çubuk olurdu.
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <BottomTabBar
          testID="bottom-tabs"
          items={state.routes.map((route, index) => ({
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
          }))}
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
