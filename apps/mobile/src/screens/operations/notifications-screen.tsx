import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsChoiceChip } from '@/components/operations/choice-chip';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { OPERATIONS_SECTIONS, type OperationsSection } from '@/lib/operations/sections';
import { dayGroupLabelOf, timeOf, turkishUpper } from '@/lib/operations/stamp';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { operationsCopy } from './copy';
import type { NotificationDestination, OperationsNotification } from './notification-map';
import { useOperationsSections } from './sections-context';
import { useOperationsNotifications } from './use-notifications.hook';

/*
  BİLDİRİMLER (v3:3099-3167) — 05.09'da tasarımın GÜNCEL hâline çekildi.

  Ekran 30.08'de v3'e geçirilmişti ama kaynak dosyanın O GÜNKÜ hâline göre: bildirim bloğu 31.08'de
  baştan yazıldı (iki örnek karttan → süzgeç çipleri + gün grupları + renkli ray + bölüm rozeti +
  okunmadı noktası + alt satır + hedef satırı + iki boş hâl + dipnot kutusu) ve ekran o güncellemeyi
  hiç görmedi. Dosyanın eski künyesindeki "şablon yalnız İKİ kart varyantı çiziyor" cümlesi bu
  yüzden bayattı.

  ── BÖLÜM ARTIK SÜZGEÇ ÇİPİ, GÖRÜNÜRLÜK KAPISI DEĞİL (kullanıcı kararı 05.09) ─
  Kitleyi yalnız sunucu belirler; bölüm rengi/rozeti/çipi verir. Gerekçe ve ölçüm
  `lib/operations/sections.ts` künyesinde. Çip kullanıcının kendi eliyle açtığı bir daraltmadır —
  açmadığı sürece hiçbir satır düşmez.

  ÇİPLER İKİ KAYNAĞIN BİRLEŞİMİ: kullanıcının bölümleri ∪ akışta GERÇEKTEN bulunan bölümler.
  Yalnız rollerden türetilseydi, kullanıcının bölümü olmayan bir bölüme düşen satır ("tümü"nde
  görünen ama hiçbir çiple daraltılamayan satır) erişilemez bir kuyruk olurdu; yalnız akıştan
  türetilseydi "Bu bölümde bildirim yok" hâli hiç doğmazdı. Tasarımın kendi koşulu (`bldSuzgecBos`)
  satır sayısına değil rol iznine baktığı için YAPISI GEREĞİ ölüydü — burada satır sayısına bakıyor.

  ── SATIRIN DAMGASI SAAT, GÖRELİ SÜRE DEĞİL ────────────────────────────────
  Gün grupları gelince "DÜN" başlığının altında "19 sa" yazmak aynı bilgiyi iki kez ve ikincisini
  daha kötü söylüyordu. `agoOf` silinmedi, evi değişti (`lib/operations/stamp.ts`) — yönetim
  hub'ının künyesi onu okumaya devam ediyor.

  ── KART İKİ VARYANT, ÜÇ TON (kasıtlı ve raporlu) ──────────────────────────
  Şablon yalnız acil/normal çiziyor; sözleşmenin tonu üç değerli. `alert` kırmızı karta, `attention`
  ve `quiet` nötr karta düşüyor. `attention` için ortak sette bir amber kart ailesi VAR
  (`warning-bg`/`warning-line`) ama bu ekranda kullanılmıyor: tasarımın vermediği bir kararı
  uydurmak olurdu (CLAUDE §3). Ton bilgisi kaybolmuyor — aciliyet kartın kenarında, BÖLÜM ise
  rayında ve rozetinde; iki eksen ayrı okunuyor.
*/

const t = operationsCopy;

/** Bölümün kimlik rengi — ray, rozet yazısı, okunmadı noktası ve hedef satırı bu rengi taşır. */
const RAIL: Record<OperationsSection, string> = {
  warehouse: operationsTheme.colors.olive,
  courier: operationsTheme.colors.ink,
  management: operationsTheme.colors.terracotta,
  money: operationsTheme.colors.body,
};

/** Rozetin zemini — ray renginin açık eşi; ailesi `olive-bg`/`terracotta-bg`/`neutral-bg`. */
const BADGE_BG: Record<OperationsSection, string> = {
  warehouse: operationsTheme.colors['olive-bg'],
  courier: operationsTheme.colors['courier-bg'],
  management: operationsTheme.colors['terracotta-bg'],
  money: operationsTheme.colors['neutral-bg'],
};

/** Süzgecin "tümü" çipi bir bölüm DEĞİL — ayrı bir değer, yoksa dört bölümden birine karışırdı. */
type FilterValue = 'all' | OperationsSection;

/** Bir gün başlığı ve o güne düşen satırlar (v3 `bldGruplar`). */
interface DayGroup {
  key: string;
  title: string;
  rows: OperationsNotification[];
}

/**
 * İskelet kutusunun yüksekliği KARTIN KENDİ ÖLÇÜSÜNDEN türer, elle yazılmaz: iki dikey dolgu +
 * rozet satırı + üç iç aralık + başlık + alt satır + hedef satırı. Sabit bir sayı yazılsaydı kartın
 * dolgusu değiştiği gün iskelet yanlış yeri tutmaya devam ederdi ve yükleme→liste geçişinde sayfa
 * zıplardı — bu deseni halka yerine seçmenin tek sebebi zaten o zıplamaydı.
 */
const SKELETON_ROW_HEIGHT =
  operationsTheme.space['2xl'] * 2 +
  operationsTheme.text['badge-xs'] * operationsTheme.text['lead--line-height'] +
  operationsTheme.space.sm * 3 +
  operationsTheme.text.control * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.micro * operationsTheme.text['lead--line-height'] * 2;

export function OperationsNotificationsScreen() {
  const router = useRouter();
  const sections = useOperationsSections();
  const feed = useOperationsNotifications();
  const [filter, setFilter] = useState<FilterValue>('all');

  /* ÇIKARKEN "GÖRDÜM" (05.09): açılışta değil ODAK KAYBINDA işaretlenir — noktalar ziyaret boyunca
     ekranda durur. Ref taze kopyayı taşır; effect yalnız SÖKÜLÜRKEN koşsun diye bağımlılık boş. */
  const markSeenRef = useRef(feed.markSeen);
  markSeenRef.current = feed.markSeen;
  useEffect(() => () => markSeenRef.current(), []);

  const rows = feed.state.status === 'ready' ? feed.state.rows : [];

  /* Çipler: kullanıcının bölümleri ∪ akıştaki bölümler — sıra DAİMA tasarımın sırası (künye). */
  const chips = useMemo<FilterValue[]>(() => {
    const feedSections = new Set(rows.map((row) => row.section));
    const görünen = OPERATIONS_SECTIONS.filter((s) => sections.includes(s) || feedSections.has(s));
    return görünen.length > 1 ? ['all', ...görünen] : [];
  }, [rows, sections]);

  /* Süzgeçte kalmayan bir çip (rol değişti, akış tazelendi) seçili kalırsa liste sessizce boşalır. */
  useEffect(() => {
    if (filter !== 'all' && chips.length > 0 && !chips.includes(filter)) setFilter('all');
  }, [chips, filter]);

  const filtered = useMemo(
    () => (filter === 'all' ? rows : rows.filter((row) => row.section === filter)),
    [rows, filter],
  );

  const groups = useMemo(() => groupByDay(filtered), [filtered]);

  /* HEDEF ARGÜMANLA GELİR, satırdan yeniden okunmaz: "gidilebilir mi" kararı kartın kendisinde
     veriliyor (hedef var mı + kullanıcı o bölümü açabiliyor mu) ve aynı kararı burada ikinci kez
     kurmak, ikisinin bir gün ayrışmasına açık kapı bırakırdı — test tam bunu yakaladı. */
  const openRow = useCallback(
    (id: string, destination: NotificationDestination) => {
      feed.markRead(id);
      router.navigate(destination.href as never);
    },
    [feed, router],
  );

  return (
    <View style={styles.screen}>
      <OperationsStackHeader
        title={t.notifications.title}
        subtitle={t.notifications.subtitle}
        onBack={() => router.back()}
        backLabel={t.notifications.back}
        testID="operations-notifications-header"
      />
      <ScrollView contentContainerStyle={styles.list} testID="operations-notifications-list">
        {feed.state.status === 'loading' ? (
          /* İlk yük — boş hâlle KARIŞMAZ: yüklemeyi "sakin" gibi okutmak yanlış boştu (26.08). */
          <OperationsSkeletonList
            heights={[SKELETON_ROW_HEIGHT, SKELETON_ROW_HEIGHT, SKELETON_ROW_HEIGHT]}
            label={t.notifications.loading}
            testID="operations-notifications-loading"
          />
        ) : feed.state.status === 'error' ? (
          /* HATA DALI 05.09'DA AÇILDI: eskiden ilk çekim düşünce ekran SONSUZA KADAR iskelet
             çiziyordu — çevrimdışı açılışta kurtuluş yolu, hatta bir açıklama bile yoktu. */
          <OperationsNoticeBlock
            variant="error"
            title={t.notifications.error.title}
            description={t.notifications.error.body}
            retry={{ label: t.notifications.error.retry, onPress: feed.retry }}
            testID="operations-notifications-error"
          />
        ) : rows.length === 0 ? (
          <OperationsNoticeBlock
            variant="empty"
            title={t.notifications.empty.title}
            description={t.notifications.empty.body}
            testID="operations-notifications-empty"
          />
        ) : (
          <>
            {chips.length > 0 ? (
              /* Şerit kenar boşluğunu DELER (`chipBleed`) — çipler sayfanın kenarından başlayıp
                 kaydırmayla devam eder; hizalanmış bir şerit "hepsi bu kadar" der. */
              <View style={styles.chipBleed}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {chips.map((value) => (
                    <OperationsChoiceChip
                      key={value}
                      label={value === 'all' ? t.notifications.filterAll : t.sections[value].tab}
                      selected={filter === value}
                      tone="filter"
                      onPress={() => setFilter(value)}
                      testID={`operations-notification-filter-${value}`}
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {groups.map((group) => (
              <View key={group.key} style={styles.group}>
                <Text style={styles.groupTitle}>{group.title}</Text>
                {group.rows.map((row) => (
                  <NotificationCard key={row.id} row={row} canOpen={sections.includes(row.section)} onOpen={openRow} />
                ))}
              </View>
            ))}

            {filtered.length === 0 ? (
              <OperationsNoticeBlock
                variant="empty"
                title={t.notifications.filteredEmpty.title}
                description={t.notifications.filteredEmpty.body}
                retry={{ label: t.notifications.clearFilter, onPress: () => setFilter('all') }}
                testID="operations-notifications-filtered-empty"
              />
            ) : null}

            {/* SAYFALAYAN OKUMANIN TÜKETENİ VAR (CLAUDE §1): imleç üretilip atılırsa listenin
                kuyruğu sessizce yutulur — eski hâlde 30 satırın arkası hiç görülemiyordu. */}
            {feed.loadMore !== null ? (
              <PressableSurface
                onPress={feed.loadMore}
                feedback="scale"
                style={styles.more}
                accessibilityLabel={t.notifications.more}
                testID="operations-notifications-more"
              >
                <Text style={styles.moreLabel}>{t.notifications.more}</Text>
              </PressableSurface>
            ) : null}
            {feed.tailFailed ? <Text style={styles.tailFailed}>{t.notifications.tailFailed}</Text> : null}

            {/* Kural kutusu — ekranın renk sistemini ve push'un yokluğunu açıklayan tek yer. */}
            <View style={styles.rule}>
              <Text style={styles.ruleTitle}>{t.notifications.rule.title}</Text>
              <Text style={styles.ruleBody}>{t.notifications.rule.body}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

interface NotificationCardProps {
  row: OperationsNotification;
  /** Kullanıcı hedefin bölümünü açabiliyor mu — açamıyorsa satır tıklanmaz (ölü dokunuş yerine). */
  canOpen: boolean;
  /* ADI `onPress` DEĞİL ve olamaz: RNTL'in `fireEvent.press`i işleyici ararken host ağacından
     yukarı çıkarken KOMPOZİT elemanların proplarına da bakıyor. Prop `onPress` diye adlandırılsaydı
     basılamaz kartın kendisi basılamaz olduğu hâlde test yeşil geçerdi — testin ölçtüğü şeyin tam
     tersi. (Ölçüldü 05.09: basılamaz karta basınca işleyici gerçek bir basma olmadan çağrıldı.) */
  onOpen: (id: string, destination: NotificationDestination) => void;
}

function NotificationCard({ row, canOpen, onOpen }: NotificationCardProps) {
  const alarm = row.tone === 'alert';
  const rail = RAIL[row.section];
  /* HEDEF SATIRI YALNIZ GİDİLEBİLİYORSA (tasarımın `sc-if bn.hedef`i): hedefi olmayan tür ve
     kullanıcının açamadığı bölüm aynı sonuca çıkar — satır haber verir, tıklanmaz. Açılamayan bir
     ekrana götürmek, ölü dokunuştan daha kötüdür: expo-router kullanıcıyı SESSİZCE başka bir
     bölüme indirir (`_layout.tsx` `redirect`) ve o savrulma fark edilmez. */
  const target = canOpen ? (row.destination ?? null) : null;
  const body = (
    <>
      <View style={[styles.rail, { backgroundColor: rail }]} />
      <View style={styles.cardBody}>
        <View style={styles.cardHead}>
          <Text style={[styles.badge, { color: rail, backgroundColor: BADGE_BG[row.section] }]}>
            {turkishUpper(t.sections[row.section].tab)}
          </Text>
          <Text style={styles.time}>{timeOf(row.createdAt)}</Text>
          {/* 8 px nokta = OKUNMAMIŞ. Ziyaret boyunca durur; "gördüm" beyanı çıkışta yazılır. */}
          {row.readAt === null ? (
            <View style={[styles.dot, { backgroundColor: rail }]} testID={`operations-notification-${row.id}-dot`} />
          ) : null}
        </View>
        <Text style={[styles.title, alarm ? styles.titleAlert : undefined]}>{row.title}</Text>
        {row.sub !== null ? <Text style={styles.sub}>{row.sub}</Text> : null}
        {target !== null ? <Text style={[styles.target, { color: rail }]}>{target.label} →</Text> : null}
      </View>
    </>
  );

  if (target === null) {
    return (
      <View style={[styles.card, alarm ? styles.cardAlert : undefined]} testID={`operations-notification-${row.id}`}>
        {body}
      </View>
    );
  }
  return (
    <PressableSurface
      onPress={() => onOpen(row.id, target)}
      feedback="scale"
      style={[styles.card, alarm ? styles.cardAlert : undefined]}
      accessibilityLabel={row.title}
      testID={`operations-notification-${row.id}`}
    >
      {body}
    </PressableSurface>
  );
}

/**
 * Satırları GÜNE göre gruplar. Sıra veriden gelir (liste `created_at desc`), takvimden değil —
 * boş grup hiç doğmaz ve "DÜN (0)" gibi bir başlık oluşamaz.
 *
 * Gün anahtarı CİHAZIN yerel takviminden kesilir, `toISOString`den değil: Fransa'da yaz saatiyle
 * 22:00'den sonra UTC kesimi günü kaydırır ve gece vardiyasındaki personel "bugün"ü dünde görürdü.
 */
function groupByDay(rows: readonly OperationsNotification[]): DayGroup[] {
  const now = new Date();
  const out: DayGroup[] = [];
  for (const row of rows) {
    const d = new Date(row.createdAt);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    const last = out[out.length - 1];
    if (last !== undefined && last.key === key) last.rows.push(row);
    else out.push({ key, title: dayGroupLabelOf(row.createdAt, now), rows: [row] });
  }
  return out;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  list: {
    // v3 sayfa kenarı 20 (`padding:0 20px 24px`).
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space['6xl'],
  },
  /* Şerit sayfa dolgusunu deler: çip kenardan başlar, kaydırma kenarda biter (batch-picker deseni). */
  chipBleed: {
    marginHorizontal: -operationsTheme.space['5xl'],
  },
  chipRow: {
    flexDirection: 'row',
    // v3 `gap:7px` — ölçekte yok, ±1 kuralıyla `sm`e (8) çekildi.
    gap: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space.sm,
  },
  group: {
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.xl,
  },
  /* v3: `800 9.5px` + `.18em` — harf aralıklı küçük üstbaşlık. 9,5 → 10 (`eyebrow`) meşru:
     BAŞLIK kademeleri yuvarlanır, kontrol kademeleri yuvarlanmaz (`customer.ts` §0.4b). */
  groupTitle: {
    fontFamily: operationsTheme.font.body[800],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  card: {
    flexDirection: 'row',
    // v3 `gap:12px` — ray ile gövde arası.
    gap: operationsTheme.space.xl,
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
    // v3 `13px 15px` — ikisi de ±1 ile en yakın basamağa.
    paddingVertical: operationsTheme.space['2xl'],
    paddingHorizontal: operationsTheme.space['3xl'],
  },
  /* Alarm kartı: zemin de kenar da değişir (v3 `#fdf6f4` + `#e0b9b2`). 30.08'de yalnız kenar
     alınmıştı çünkü o gün ölçülen zemin `panel`e Δ2/4/0 idi; operasyon seti `error-bg`i sonra
     kendi değerine (#fdf6f4) çekti ve fark artık ekranda ayırt ediliyor. */
  cardAlert: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors['error-line'],
  },
  /* v3: `width:5px; align-self:stretch; border-radius:3px` — kartın tam boyunca dikey şerit. */
  rail: {
    width: operationsTheme.space.xs,
    alignSelf: 'stretch',
    borderRadius: operationsTheme.radius.pill,
  },
  cardBody: {
    flex: 1,
    // Uzun başlık kartı taşırmasın (v3 `min-width:0`ın RN karşılığı).
    minWidth: 0,
    gap: operationsTheme.space.sm,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.sm,
  },
  /* v3: `800 8.5px` + `.12em` + `radius:7px` + `padding:3px 6px`. Punto kendi durağında
     (`badge-xs`) — rozet bir KONTROL öğesi, 10'a yuvarlanamaz (token künyesi). */
  badge: {
    fontFamily: operationsTheme.font.body[800],
    fontSize: operationsTheme.text['badge-xs'],
    letterSpacing: emToDp(operationsTheme.text['badge-xs--letter-spacing'], operationsTheme.text['badge-xs']),
    borderRadius: operationsTheme.radius.tight,
    paddingHorizontal: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space['2xs'],
    overflow: 'hidden',
  },
  /* Saat kalan boşluğu yutup sağa dayanır (v3 `flex:1; text-align:right`). */
  time: {
    flex: 1,
    textAlign: 'right',
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['tab-inactive'],
  },
  /* v3: `8×8` daire. `md` (8) birebir; yarıçap kutunun yarısında kırpıldığı için `pill` yeterli. */
  dot: {
    width: operationsTheme.space.md,
    height: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.pill,
  },
  title: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    // v3 `700 13.5px/1.3` — `control` durağı birebir.
    fontSize: operationsTheme.text.control,
    /* v3 `1.3` için durak AÇILMADI (şablonda 3 kullanım) — RN'in kendi varsayılanı ona yakın ve
       yanlış bir oran yazmak, hiç yazmamaktan kötüdür (token künyesi). */
    color: operationsTheme.colors.ink,
  },
  titleAlert: { color: operationsTheme.colors.error },
  sub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['snug--line-height'],
    color: operationsTheme.colors.muted,
  },
  /* Hedef satırı bölüm rengini taşır (v3 `700 11.5px` + `bn.c.rail`) — rengi satır içi verilir. */
  target: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.micro,
  },
  more: {
    alignItems: 'center',
    marginTop: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['2xl'],
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  moreLabel: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  tailFailed: {
    marginTop: operationsTheme.space.md,
    textAlign: 'center',
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.error,
  },
  /* v3: dolu kum zemin, KENARLIK YOK, `radius:16px`, `padding:12px 14px`. */
  rule: {
    marginTop: operationsTheme.space['2xl'],
    gap: operationsTheme.space['2xs'],
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  ruleTitle: {
    fontFamily: operationsTheme.font.body[700],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  ruleBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
});
