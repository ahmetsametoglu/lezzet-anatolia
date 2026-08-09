import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { notificationScopeOf, type OperationsSection } from '@/lib/operations/sections';
import { operationsTheme } from '@/theme/unistyles';
import { fillCopy, operationsCopy } from './copy';
import type { NotificationDot } from './notifications-fixture';
import { useOperationsSections } from './sections-context';
import { useOperationsNotifications } from './use-notifications.hook';

/*
  BİLDİRİMLER (v2:782) — kabuğun tek "gerçek" ekranı: boş durum, rol süzmesi ve kural notu
  bugünden çalışıyor; LİSTE VERİSİ fixture (push altyapısı 21.13).

  SAYFALAMA YOK ve bu bilinçli (CLAUDE §1'in ölçütü): bildirim akışı veriyle sınırsız büyüyen bir
  küme DEĞİL, son işlerin kısa bir seçkisidir — "hızlandırıcıdır, tek kapı değil" (zemin brief
  kuralı). Kuyruğu olan bir akış gerekirse imleç 21.13'ün sözleşmesiyle gelir.

  VERİ KAYNAĞI TEK HOOK'TA (`use-notifications.hook.ts`): zil sayacı da aynı listeyi okur, yoksa
  rozet ile satır sayısı ayrışırdı. Fixture → uç geçişi orada, tek dosyada olacak.

  SATIRA BASINCA BÖLÜM KÖKÜNE gidilir. Tasarım kurye satırında tam olarak bunu yapıyor
  (v2:1071 — sekmeyi değiştirir); depo/yönetim/para satırları ise henüz OLMAYAN alt ekranlara
  (`dt`, `yi`, `yt`, `mg`) gidiyor. Var olmayan bir adrese gitmek yerine hepsi ORTAK ve doğru olan
  davranışa bağlandı: bildirimin bölümü açılır. Derin bağlar kendi dilimlerinde (21.10-21.12)
  satır satır bağlanacak.
  BEKLEYEN(21.11): depo/yönetim/para satırlarının alt ekran derin bağları.
*/

/** Nokta rengi — fixture token ADI taşır, çeviri burada (tek yer). */
const DOT_COLOR = {
  courier: operationsTheme.colors.olive,
  warehouse: operationsTheme.colors.warehouse,
  attention: operationsTheme.colors.terracotta,
  alert: operationsTheme.colors.error,
  quiet: operationsTheme.colors.muted,
} as const satisfies Record<NotificationDot, string>;

const t = operationsCopy;

/** Kapsam künyesi — kararı saf fonksiyon verir, cümleyi sözlük kurar. */
function scopeLabel(sections: OperationsSection[]): string {
  const scope = notificationScopeOf(sections);
  if (scope.kind === 'all') return t.notifications.scopeAll;
  const names = scope.sections.map((section) => t.sections[section].tab).join(' · ');
  return fillCopy(t.notifications.scopeFiltered, { sections: names });
}

export function OperationsNotificationsScreen() {
  const router = useRouter();
  const sections = useOperationsSections();
  const items = useOperationsNotifications();

  return (
    <View style={styles.screen}>
      <OperationsStackHeader
        title={t.notifications.title}
        subtitle={scopeLabel(sections)}
        onBack={() => router.back()}
        backLabel={t.notifications.back}
        testID="operations-notifications-header"
      />
      <ScrollView contentContainerStyle={styles.list} testID="operations-notifications-list">
        {items.length === 0 ? (
          <OperationsNoticeBlock
            variant="empty"
            title={t.notifications.empty.title}
            description={t.notifications.empty.body}
            testID="operations-notifications-empty"
          />
        ) : (
          items.map((item) => (
            <PressableSurface
              key={item.id}
              onPress={() => router.navigate(`/${item.section}`)}
              feedback="scale"
              style={styles.row}
              accessibilityLabel={item.title}
              testID={`operations-notification-${item.id}`}
            >
              <View style={[styles.dot, { backgroundColor: DOT_COLOR[item.dot] }]} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>{`${t.sections[item.section].tab} · ${item.ago}`}</Text>
              </View>
            </PressableSurface>
          ))
        )}
        {/* Kural notu HER İKİ hâlde de çizilir (v2: `sc-if` dışında duruyor) — liste boşken de
            kullanıcının neden az şey gördüğünü açıklayan tek cümle odur. */}
        <Text style={styles.rule}>{t.notifications.rule}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['6xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    // v2'nin `#ddd6c4` kesikli ayracı — eşikte `sand-300`e bağlandı (Δ5/2/7).
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  dot: {
    width: operationsTheme.space.lg,
    height: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.pill,
    // Nokta ilk satırın ortasına denk gelsin (v2: `margin-top:5px`).
    marginTop: operationsTheme.space.sm,
  },
  rowText: {
    flex: 1,
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    // v2: `700 13.5px` — kontrol kademesi (satır başlığı).
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  rule: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space['2xl'],
  },
});
