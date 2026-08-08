import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import type { OperationsSection } from '@/lib/operations/sections';
import { operationsTheme } from '@/theme/unistyles';
import { fillCopy, operationsCopy } from './copy';
import { useOperationsNotifications } from './use-notifications.hook';

/*
  BÖLÜM KÖKÜ — dört bölüm (Kurye · Depo · Yönetim · Para) tek komponentten çizilir, çünkü v2'de
  dördünün de TEPESİ aynı: üstbaşlık + Lora başlık + sağ eylem. Ayrıştıkları yer GÖVDEDİR ve gövde
  bu dilimde YOK.

  BU DİLİM KABUKTUR, İÇERİK DEĞİL: v2'nin gövdeleri (depo iş karoları, karar kutusu, tahsilat
  dökümü) kendi dilimlerine ait ve oraya BİREBİR yazılacak. Buraya yer tutucu bir gövde de konmadı:
  `ScreenPlaceholder` ikinci bir `header` rolü basar (başlık zaten var) ve olmayan bir tasarım
  kararını ekranda varmış gibi gösterirdi.
  BEKLEYEN(21.11): depo hub gövdesi (iş karoları · çevrimdışı kilidi).
  BEKLEYEN(21.12): yönetim karar kutusu + para dökümü gövdeleri ve Para'nın "Gün sonu →" eylemi.

  KURYE ARTIK BURADAN ÇİZİLMİYOR (21.10): gövdesi geldi ve kendi ekranına taşındı
  (`screens/courier/courier-day-screen.tsx`). Başlık üçlüsü yine ortak komponentten, yani ayrışan
  yalnız gövde — kabuk kararı bozulmadı, kanıtlandı.

  ÜSTBAŞLIK VERİSİZ HÂLİYLE (kalan üç bölüm için): v2 depoda "DEPO · STRASBOURG (SABİT)" yazıyor ve
  kuyruğu VERİDİR (personelin sabit deposu). Kabukta o veri yok ve uydurulmadı; kuyruğu kendi
  dilimiyle gelecek (yukarıdaki BEKLEYEN'in parçası). Kuryenin kuyruğu (gün + ad) 21.10'da bağlandı.
  Yönetim ve Para'nın üstbaşlıkları tasarımda zaten tamamen statiktir, birebir yazıldı.

  ZİL PARA'DA YOK — tasarımın kararı (v2:719 sağ yuvada "Gün sonu →" metin eylemi var, zil değil).
  Sonuç: yalnız muhasebe rolü taşıyan kullanıcı bildirim ekranına kabuktan ULAŞAMAZ. Bu bir eksik
  değil tasarımın hâli; gerçek push geldiğinde (21.13) bildirime dokunuş da bir kapıdır ve o gün
  yeniden değerlendirilir. Sessizce bir zil eklemek, tasarımın vermediği kararı vermek olurdu.
*/

const t = operationsCopy;

interface OperationsSectionScreenProps {
  section: OperationsSection;
}

export function OperationsSectionScreen({ section }: OperationsSectionScreenProps) {
  const router = useRouter();
  /* Sayaç SÜZÜLMÜŞ listenin sayısıdır (hook zaten süzüyor): kullanıcı açamayacağı bir işin
     rozetini taşımaz — ve rozet ile bildirim ekranı aynı listeyi sayar. */
  const unread = useOperationsNotifications().length;
  const copy = t.sections[section];

  return (
    <View style={styles.screen} testID={`operations-section-${section}`}>
      <OperationsSectionHeader
        section={section}
        eyebrow={copy.eyebrow}
        title={copy.title}
        right={
          section === 'money' ? undefined : (
            <NotificationBell
              onPress={() => router.navigate('/notifications')}
              accessibilityLabel={
                unread === 0 ? t.bell.label : fillCopy(t.bell.labelWithCount, { n: String(unread) })
              }
              count={unread}
              testID="operations-bell"
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
});
