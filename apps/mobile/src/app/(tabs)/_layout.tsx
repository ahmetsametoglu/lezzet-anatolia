import { Tabs } from 'expo-router';
import type { LocalizedCopy } from '@lezzet/i18n';

import { BottomTabBar } from '@/components/ui/bottom-tab-bar';
import { deviceLocale } from '@/lib/i18n/locale';
// `typeof messages` için DEĞER bağı gerek (Messages tipi JSON'dan türer) — `import type` olmaz.
import messages from './messages.json';

/*
  SEKME KABUĞU — dört sekme (envanter §4): Vitrin · Katalog · Siparişler · Hesap. Sepet SEKME
  DEĞİL; ona FAB ve yapışkan barlardan gidilir. Bugün yalnız KATALOG gerçek bir ekran, ötekiler
  yer tutucu — ama kabuk baştan dörtlü kuruluyor ki sekme sırası ve dil sözlüğü ekran ekran
  yeniden karar konusu olmasın.

  ÇUBUĞUN KENDİSİ KİTTE (`BottomTabBar`), bağlama burada: router'ın durumu (hangi rota seçili) →
  kitin anladığı düz liste. Böylece kit navigasyon kütüphanesinin şeklini bilmez ve testi
  router'sız koşar.

  METİN KOLOKASYONU: sekme etiketleri bu klasördeki `messages.json`da (CLAUDE §2 — global JSON
  yok, tip `LocalizedCopy`den türer). JSON dosyası expo-router için ROTA DEĞİLDİR: yönlendirici
  yalnız `.js/.jsx/.ts/.tsx` uzantılarını tarar, o yüzden metin dosyası kullanıldığı yerin
  yanında durabiliyor.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Sekme sırası TASARIMIN sırasıdır; rota adları İngilizce (CLAUDE §2 — iç yol İngilizce). */
const TABS = ['index', 'catalog', 'orders', 'account'] as const;
type TabName = (typeof TABS)[number];

const isTabName = (name: string): name is TabName => TABS.some((tab) => tab === name);

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
      {TABS.map((name) => (
        <Tabs.Screen key={name} name={name} />
      ))}
    </Tabs>
  );
}
