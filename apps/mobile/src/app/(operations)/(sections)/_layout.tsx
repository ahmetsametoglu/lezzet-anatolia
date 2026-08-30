import { Tabs } from 'expo-router';

import { OperationsTabBarSlide } from '@/components/operations/tab-bar-slide';
import { BottomTabBar } from '@/components/ui/bottom-tab-bar';
import type { IconName } from '@/components/ui/icon-paths';
import { OPERATIONS_SECTIONS, showsSectionTabs, type OperationsSection } from '@/lib/operations/sections';
import { operationsCopy } from '@/screens/operations/copy';
import { useOperationsSections } from '@/screens/operations/sections-context';

/*
  BÖLÜM SEKMELERİ — kabuğun ikinci katı. Kapı (`(operations)/_layout.tsx`) yetkiyi çözdü; burada
  yalnız "hangi bölümler çizilecek" sorusu var.

  ROL SÜZMESİ İKİ YERDEN DEĞİL TEK YERDEN: sekme çubuğu `state.routes`u okuyor ve o liste
  `redirect` ile zaten süzülmüş oluyor — yani "çizilen sekmeler" ile "girilebilen rotalar" AYNI
  kaynaktan çıkıyor. Çubuğu ayrıca süzseydik, derin bağla (`/money`) girilen bir bölüm çubukta
  görünmeden açılabilirdi.

  `redirect` expo-router'ın kendi sözleşmesi: ekran navigatörden ÇIKARILIR ve adres en yakın
  kardeşe düşer. Muhasebe rolü olmayan birinin `/money` derin bağı böylece sessizce reddedilmez,
  girebildiği ilk bölüme iner.

  ÇUBUK TEK BÖLÜMDE GİZLİ (v2:1097): `tabBar` `null` döner ama `Tabs` navigatörü yerinde kalır —
  navigatörü kaldırmak rota adreslerini de değiştirirdi ve tek rollü kullanıcının derin bağı
  bozulurdu. Tasarımın söylediği şey "çubuğu çizme", "navigasyonu kaldır" değil.

  METİNLER tek dilli sözlükten (`screens/operations/copy.ts` — kararın gerekçesi orada). Müşteri
  kabuğunun `useAppLocale()` çağrısı burada YOK; operasyon yüzeyi uygulamanın dilinden bağımsız
  Türkçedir.
*/

/** Bölüm → ikon. "Hangi rota hangi ikonu taşır" navigasyonun bilgisidir, kitin değil (müşteri emsali). */
const SECTION_ICONS = {
  courier: 'courier',
  warehouse: 'warehouse',
  management: 'management',
  money: 'money',
} as const satisfies Record<OperationsSection, IconName>;

export default function OperationsSectionsLayout() {
  const sections = useOperationsSections();
  const tabsVisible = showsSectionTabs(sections);

  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) =>
        tabsVisible ? (
          /* Çubuk aşağı kaydırmada kayar (M1c); kararı kabuğun kaydırma durumu verir. Sarmalayıcı
             yalnız çizimi taşır — görünürlük kuralı (`tabsVisible`) olduğu gibi duruyor. */
          <OperationsTabBarSlide>
            <BottomTabBar
              tone="operations"
              testID="operations-tabs"
              /* Liste TASARIMIN sırasından yürür, navigatörünkinden değil: `flatMap` her bölüm için
               rotayı arar, `redirect` ile çıkarılmış olanı BULAMAZ ve o sekme hiç doğmaz. Ters
               yönde (rotaları gezip bölüme çevirerek) yazılsaydı, her rota adı için bir daraltma
               iddiası (`as`) gerekirdi — burada tip zaten bölümden geliyor. */
              items={OPERATIONS_SECTIONS.flatMap((section) => {
                const route = state.routes.find((candidate) => candidate.name === section);
                if (route === undefined) return [];
                return [
                  {
                    key: section,
                    label: operationsCopy.sections[section].tab,
                    icon: SECTION_ICONS[section],
                    /* Seçililik ROTA ADI üstünden okunur, dizin üstünden değil: süzülmüş listede
                     `state.index` bizim sıramızla aynı yeri göstermez. */
                    selected: state.routes[state.index]?.name === section,
                    onPress: () => {
                      /* React Navigation sözleşmesi: dokunuş önce OLAY olarak duyurulur, bir
                       dinleyici onu iptal edebilir (müşteri kabuğuyla aynı gerekçe). */
                      const event = navigation.emit({
                        type: 'tabPress',
                        target: route.key,
                        canPreventDefault: true,
                      });
                      if (state.routes[state.index]?.name !== section && !event.defaultPrevented) {
                        navigation.navigate(section);
                      }
                    },
                  },
                ];
              })}
            />
          </OperationsTabBarSlide>
        ) : null
      }
    >
      {/* Sıra DOSYA adına göre değil bu bildirime göre — tasarımın sırası (v2:1079). */}
      {OPERATIONS_SECTIONS.map((name) => (
        <Tabs.Screen key={name} name={name} redirect={!sections.includes(name)} />
      ))}
    </Tabs>
  );
}
