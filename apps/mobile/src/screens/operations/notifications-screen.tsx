import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { notificationScopeOf, type OperationsSection } from '@/lib/operations/sections';
import { operationsTheme } from '@/theme/unistyles';
import { fillCopy, operationsCopy } from './copy';
import { useOperationsSections } from './sections-context';
import { useOperationsNotifications } from './use-notifications.hook';

/*
  BİLDİRİMLER (v3:2388) — kabuğun tek "gerçek" ekranı: boş durum, rol süzmesi ve kural notu
  bugünden çalışıyor.

  SAYFALAMA YOK ve bu bilinçli (CLAUDE §1'in ölçütü): bildirim akışı veriyle sınırsız büyüyen bir
  küme DEĞİL, son işlerin kısa bir seçkisidir — "hızlandırıcıdır, tek kapı değil" (zemin brief
  kuralı). Kuyruğu olan bir akış gerekirse imleç 21.13'ün sözleşmesiyle gelir.

  VERİ KAYNAĞI TEK HOOK'TA (`use-notifications.hook.ts`): zil sayacı da aynı listeyi okur, yoksa
  rozet ile satır sayısı ayrışırdı.

  SATIRA BASINCA BÖLÜM KÖKÜNE gidilir. Tasarım kurye satırında tam olarak bunu yapıyor
  (sekmeyi değiştirir); depo/yönetim/para satırları ise henüz OLMAYAN alt ekranlara gidiyor. Var
  olmayan bir adrese gitmek yerine hepsi ORTAK ve doğru olan davranışa bağlandı: bildirimin bölümü
  açılır. Derin bağlar kendi dilimlerinde (21.10-21.12) satır satır bağlanacak.
  BEKLEYEN(21.11): depo/yönetim/para satırlarının alt ekran derin bağları.

  ── v3: SATIR ARTIK BİR KART, NOKTA YOK (ölçüldü 30.08) ────────────────────
  v2 satırı "renkli nokta + kesikli alt çizgi"ydi; nokta beş tonu (kurye · depo · dikkat · alarm ·
  sessiz) taşıyordu. v3 o anatomiyi tamamen değiştirdi (`v3:2404-2411`): satırlar 8 px aralıklı
  KARTLAR — `1.5px` kenarlık + kart yarıçapı + `14/15` dolgu — ve nokta hiç yok. Tonu artık kartın
  KENDİSİ söylüyor:
      alarm  `#fdf6f4` zemin + `#e0b9b2` kenar + `#a44a3f` başlık   ("SKT geçti")
      nötr   `#fbfaf4` zemin + `#ddd6c4` kenar + mürekkep başlık     ("Musa K. rotayı kapattı")
  Zemin `panel`de kaldı — ölçülen kırmızı zemin ona Δ2/4/0, ekranda ayırt edilemez (token
  künyesi); kartı alarm yapan KENARI ve başlığının rengidir.

  UYUŞMAZLIK — KASITLI VE RAPORLU: şablon yalnız İKİ kart varyantı çiziyor, ama sözleşmenin tonu
  BEŞ değerli. `alert` kırmızı karta düşüyor, kalan dördü (`courier` · `warehouse` · `attention` ·
  `quiet`) nötr karta. `attention` için 00-ortak'ta bir turuncu kart ailesi VAR (`#fdf8f3`/
  `#d9a97f`, 9 kullanım) ama BU ekranda kullanılmıyor; onu buraya taşımak tasarımın vermediği bir
  kararı uydurmak olurdu (CLAUDE §3). Bölüm bilgisi kaybolmuyor: satırın alt künyesi zaten
  "tür · bölüm · süre" yazıyor.
*/

const t = operationsCopy;

/**
 * İskelet kutusunun yüksekliği — KARTIN KENDİ ÖLÇÜSÜNDEN türer, elle yazılmaz: iki dikey dolgu +
 * başlık satırı + iç aralık + künye satırı. Sabit bir sayı yazılsaydı kartın dolgusu değiştiği
 * gün iskelet yanlış yeri tutmaya devam ederdi ve yükleme→liste geçişinde sayfa zıplardı — bu
 * deseni halka yerine seçmenin tek sebebi zaten o zıplamaydı.
 */
const SKELETON_ROW_HEIGHT =
  operationsTheme.space['2xl'] * 2 +
  operationsTheme.text.note * operationsTheme.text['lead--line-height'] +
  operationsTheme.space['2xs'] +
  operationsTheme.text.micro * operationsTheme.text['lead--line-height'];

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
  const feed = useOperationsNotifications();
  const items = feed.rows;

  /* EKRANI AÇMAK = GÖRDÜM (14.13): akış okundu sayılır, hub'lardaki rozet söner — satırlar
     listede kalır (akış ≠ gelen kutusu). Ayrı bir "okundu" dokunuşu yok; tasarımın satırında
     öyle bir hedef hiç olmadı ve v2'nin sayacı da "yeni" sayacıydı. */
  /* Yalnız AÇILIŞTA — bağımlılık bilerek boş: her odak tazelemesinde yeniden işaretlemek, ekran
     açıkken düşen yeni bildirimi kullanıcı görmeden "gördü" saymak olurdu. Ref, kancanın taze
     kopyasını taşır (stale-closure değil, tek-seferlik tetik). */
  const markAllSeenRef = useRef(feed.markAllSeen);
  markAllSeenRef.current = feed.markAllSeen;
  useEffect(() => {
    markAllSeenRef.current();
  }, []);

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
        {feed.loading ? (
          /* İlk yük — boş hâlle KARIŞMAZ: yüklemeyi "sakin" gibi okutmak yanlış boştu (26.08).
             v3'ün ilk-yük dili halka değil İSKELET: gelecek kartların ölçüsü tutulur, gösterge
             söndüğünde sayfa zıplamaz (`OperationsSkeletonList` künyesi). Üç kutu, satır
             yüksekliğinde — kartın kendi dolgusu + iki metin satırı. */
          <OperationsSkeletonList
            heights={[SKELETON_ROW_HEIGHT, SKELETON_ROW_HEIGHT, SKELETON_ROW_HEIGHT]}
            label={t.notifications.loading}
            testID="operations-notifications-loading"
          />
        ) : items.length === 0 ? (
          <OperationsNoticeBlock
            variant="empty"
            title={t.notifications.empty.title}
            description={t.notifications.empty.body}
            testID="operations-notifications-empty"
          />
        ) : (
          <View style={styles.rows}>
            {items.map((item) => (
              <PressableSurface
                key={item.id}
                onPress={() => router.navigate(`/${item.section}`)}
                feedback="scale"
                style={[styles.row, item.dot === 'alert' ? styles.rowAlert : undefined]}
                accessibilityLabel={item.title}
                testID={`operations-notification-${item.id}`}
              >
                <Text style={[styles.rowTitle, item.dot === 'alert' ? styles.rowTitleAlert : undefined]}>
                  {item.title}
                </Text>
                {/* Tür şapkası başta (26.08): operatör satırın NE olduğunu bölümden önce okur. */}
                <Text style={styles.rowMeta}>{`${item.label} · ${t.sections[item.section].tab} · ${item.ago}`}</Text>
              </PressableSurface>
            ))}
          </View>
        )}
        {/* Kural notu HER İKİ hâlde de çizilir (şablonda `sc-if` dışında duruyor) — liste boşken
            de kullanıcının neden az şey gördüğünü açıklayan tek cümle odur. */}
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
    // v3 sayfa kenarı 20 (`padding:0 20px 24px`) — v2'nin 22'sinden bir basamak dar.
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space['6xl'],
  },
  /** Kartlar arası nefes (v3: `gap:8px`) — ayraç çizgisinin yerini boşluk aldı. */
  rows: {
    gap: operationsTheme.space.md,
  },
  row: {
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    // v3 yarıçapı 18; resmî sette 16 ile 20 eşit uzaklıkta ve satır bir KART, o yüzden `card`.
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['2xl'],
    // v3 `15px` — ölçekte yok, ±1 kuralıyla `3xl`e çekildi (`metrics.ts` yuvarlama kuralı).
    paddingHorizontal: operationsTheme.space['3xl'],
    gap: operationsTheme.space['2xs'],
  },
  /** Alarm kartı: zemin aynı, KENAR kırmızı (gerekçe dosya künyesinde). */
  rowAlert: {
    borderColor: operationsTheme.colors['error-line'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[700],
    // v3: `700 13px` — `note` kademesi (v2 13,5/`control` idi).
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  rowTitleAlert: {
    color: operationsTheme.colors.error,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  /** Kural notu DİPNOT grisinde (v3 `#a8a191`) — listenin içeriği değil, kuralı. */
  rule: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['tab-inactive'],
    paddingVertical: operationsTheme.space['2xl'],
  },
});
