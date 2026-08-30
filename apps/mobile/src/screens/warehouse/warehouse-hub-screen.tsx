import { useRouter } from 'expo-router';
import { RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { OperationsSurface } from '@/components/operations/surface';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { operationsSectionRoute } from '@/screens/login/post-login-route';
import { chooseWarehouse } from '@/lib/operations/warehouse-choice';
import { captionOf } from '@/lib/operations/caption';
import {
  useOperationsIdentity,
  useOperationsSections,
  useOperationsWorkplace,
  useWarehouseOptions,
} from '@/screens/operations/sections-context';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { NEAR_EXPIRY_FIXTURE } from './near-expiry-fixture';
import { orderPickingQueue } from './warehouse-format';
import type { BoxPrinterContract, PreparationOrderContract } from '@lezzet/types';
import { useWarehouseHub } from './use-warehouse-hub.hook';
import { resetWarehouseStatus, useWarehouseStatus } from './warehouse-status';

/*
  DEPO HUB (Operasyon Mobil v3:35-174) — bölümün kökü, sekiz işin kapısı.

  ── v3 HUB'I DÜZ LİSTE DEĞİL, ÜÇ KATMAN (30.08) ─────────────────────────────
  v2 sekiz işi eşit ağırlıkta satırlara diziyordu. v3 onları işin ACİLİYETİNE göre ayırdı:

    1. ÖZET KARTI ("BUGÜN DEPODA") — üç sayı, koyu zemin. Depocunun ekrana bakıp iki saniyede
       cevaplaması gereken soru: bugün ne kadar iş var? Sayılar hiçbir yere GİTMEZ; tıklanabilir
       olsalardı üçü de zaten altta duran kartların kopyası olurdu.
    2. D1 BÜYÜK KART — toplama kuyruğu, ilk iki siparişin önizlemesiyle. Günün asıl işi budur ve
       tek başına bir katman hak ediyor: hangi siparişin yarım kaldığı, listeyi açmadan görünür.
    3. D2…D8 IZGARA — iki sütun, ikonlu kutucuklar. Hepsi "gerektiğinde açılan" işler.
    + Altta yazıcı şeridi: kurulum, günlük iş değil.

  ── SAYILAR YİNE LİSTEDEN SAYILIYOR ─────────────────────────────────────────
  Özet kartı YENİ BİR UÇ İSTEMİYOR: üç sayı da bölümün zaten okuduğu iki listeden ve devir
  sayacından çıkıyor (hook künyesi). "Yarım kutu" mühürlenmemiş kutudur (`sealedAt === null`) —
  sözleşmede zaten var, ayrıca sorulmuyor.

  ── OKUNAMADI ≠ SIFIR, ÖZET KARTINDA DA ─────────────────────────────────────
  Üç sayının her biri `null` olabilir ve o zaman "—" yazılır, "0" DEĞİL (CLAUDE §1). Koyu kartta
  büyük bir "0", depocuya "bugün iş yok" der ve o cümlenin yanlış olması pahalıdır.

  ── ÜSTBAŞLIĞIN KUYRUĞU HÂLÂ YAZILMADI ──────────────────────────────────────
  v3 "DEPO · STRASBOURG MERKEZ" diyor; o kuyruk VERİDİR — personelin sabit deposunun ADI. O adı
  veren bir kapı bugün yok: `/me` sözleşmesi `warehouseIds`i taşımıyor ve depo uçlarının hiçbiri
  deponun adını döndürmüyor. Uydurma bir şehir adı, depocuya YANLIŞ deponun ekranındaymış gibi bir
  güvence verirdi. (Kurye tarafında ad VAR — `courier-api` `warehouseName` döndürüyor; depo
  sözleşmesinde yok. Açık geçiş günlüğüne yazıldı.)

  ── BAĞLAM SATIRI GELDİ ─────────────────────────────────────────────────────
  v3 başlığın altına "Deniz Arslan · depo" koyuyor. Bu veri VAR (`useOperationsIdentity`), yazıldı.

  ── TASARIMDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **Yükleniyor hâli eklendi** (şablon veriyi yerel dizeden okur, yükleme diye bir hâli yok).
  2. **Boş durum bloğu ÇİZİLMEDİ.** Hub'ın işlerinden ikisi (D3 turu, D4 sayım) her zaman açıktır;
     bütün listeyi bir "iş yok" kutusuna çevirmek çalışan iki kapıyı kapatırdı. Boşluk kartın ALT
     METNİNDE söyleniyor.
  3. **D8 alt metni "verilen"i değil BEKLEYENİ sayıyor.** Şablon "2 kutu verildi" diyor; kodun
     ölçtüğü şey rampada taşıyıcıyı bekleyen kutudur (21.134) ve depocunun sorusu odur — "bitti
     mi?". Verilen kutu geçmiştir, bekleyen kutu iştir.
  4. **Kapsam belirsizken tam ekran blok kalıyor.** Şablon kapsam sorusunu hub'ın ÜSTÜNDE ince bir
     şerit yapıp altında dolu bir hub çiziyor; bizde o mümkün değil, çünkü kapsam çözülmeden
     uçların hiçbiri veri döndürmüyor (`warehouse_required`). Şeridi çizip altını boş bırakmak,
     "okunamadı"yı "iş yok" diye göstermek olurdu.
*/

const t = warehouseCopy;

/**
 * İlk yükün yer tutucu blokları — hub üç bloktan oluşuyor ve üçü de farklı boyda.
 *
 * Ölçüler blokların KENDİ yüksekliklerinden: özet kartı üç sayı taşıyan koyu blok, D1 kartı iki
 * önizleme satırıyla en yüksek olan, ızgara ise iki sıra `size.tile` (132) + aralarındaki
 * boşluk. Tek bir ortalama yükseklik vermek, veri gelince sayfayı yine zıplatırdı — skeletonun
 * tek işi bunu önlemek (`skeleton-list.tsx` künyesi).
 */
const HUB_SKELETON = { overview: 108, hero: 196, grid: 274 } as const;
const shell = operationsCopy;

/** Izgara kutucuğunun şekli — yedi iş de aynı iskeleti çiziyor (v3:105-161). */
interface HubTile {
  key: string;
  code: string;
  icon: 'intake' | 'near-expiry' | 'stock-count' | 'transfer' | 'courier-return' | 'sale' | 'handover';
  /** İkonun rengi — şablonda kutucuk başına AYRI ve rastgele değil: terracotta olanlar bekleyen iş. */
  tone: string;
  title: string;
  subtitle: string;
  /** Alt metin DİKKAT rengiyle mi yazılıyor (şablonun `d3Rengi`/`d6Rengi` kuralı). */
  alert: boolean;
  /**
   * Kutucuğun BEKLEYEN İŞİ var mı — yoksa çerçeve KESİKLİ çizilir (görsel ajanı ölçümü 30.08,
   * hub farkı #3). Tasarımın kuralı: dolu kart düz, boş kart kesikli.
   *
   * "Boş" ile "okunamadı" AYRI: sayı `null` iken kesikli çizmek, ölçülemeyen bir şeyi "iş yok"
   * diye göstermek olurdu (CLAUDE §1). O yüzden bayrak yalnız SAYI BİLİNİYOR ve SIFIR iken açılır.
   *
   * Sayısı olmayan kutucuklarda (mal kabul, sayım, yerinde satış) bayrak yok: onlar bir kuyruk
   * değil bir KAPI — depocu iş olmasa da oraya girer.
   */
  empty?: boolean;
  onPress: () => void;
}

export function WarehouseHubScreen() {
  const router = useRouter();
  const hub = useWarehouseHub();
  const { scope, offline } = useWarehouseStatus();
  const unread = useOperationsNotifications().unread;
  const identity = useOperationsIdentity();
  const sections = useOperationsSections();
  const workplace = useOperationsWorkplace();
  const warehouseOptions = useWarehouseOptions();
  const { width } = useWindowDimensions();

  /**
   * **Depoyu seç** — kapsam belirsizliğinin çıkış yolu (kullanıcı bulgusu 30.08).
   *
   * Üç adım ve üçü de gerekli: seçim yazılır (senkron — `chooseWarehouse` künyesi), bölümün
   * kapsam ölçümü SIFIRLANIR (yoksa ekran "ambiguous" dalında kalır ve yeniden okuma hiç
   * çizilmez), sonra hub yeniden okur. Ölçümü sıfırlamak bir varsayım değil: kapsam sorusunun
   * cevabı ancak bir sonraki cevaptan öğrenilir (`warehouse-status.ts` künyesi) ve o cevap henüz
   * gelmedi.
   */
  const pickWarehouse = (warehouseId: string) => {
    chooseWarehouse(warehouseId);
    resetWarehouseStatus();
    hub.reload();
  };

  /* IZGARANIN SÜTUN GENİŞLİĞİ HESAPLANIR, YÜZDEYLE VERİLMEZ (ölçüldü 30.08, OPPO CPH1907).
     Önce `flexBasis: '48%'` + `flexGrow` denendi: kutucuklar İÇERİĞE göre boyutlandı, uzun alt
     metinli "Mal kabul" satırı tek başına kaplayıp öbürlerini aşağı itti. Sonra `width: '48%'`
     denendi: bu kez yüzde beklenmedik bir tabana çözüldü ve kutucuklar ekranın beşte birine
     düştü, her kelime alt alta sardı. Ekran genişliğinden çıkarmak ikisini de bitiriyor —
     `discover-screen`in kart yolu hesabıyla aynı yol. */
  const tileWidth = (width - 2 * operationsTheme.space['6xl'] - operationsTheme.space.lg) / 2;

  const header = (
    <OperationsSectionHeader
      section="warehouse"
      /* "DEPO · STRASBOURG MERKEZ" (v3:37) — üstbaşlık NEREDE olduğunu söyler, künye satırı KİM
         olduğunu. Tesisin adı bu yüzden buraya geliyor, aşağıdaki bağlam satırına değil: depocu
         ekrana bakıp önce doğru tesiste olduğunu görmeli.
         Ad YOKSA üstbaşlık "DEPO" olarak kuyruksuz kalır (`captionOf`) — kapsamı tek tesis
         olmayan personele tesislerden birinin adını yazmak, yanlış deponun ekranındaymış gibi
         güvence vermek olurdu (CLAUDE §1). */
      eyebrow={captionOf(t.hub.eyebrow, workplace) ?? t.hub.eyebrow}
      title={t.hub.title}
      context={`${identity.name} · ${shell.sections.warehouse.tab}`}
      right={
        <NotificationBell
          onPress={() => router.navigate('/notifications')}
          accessibilityLabel={unread === 0 ? shell.bell.label : fillCopy(shell.bell.labelWithCount, { n: String(unread) })}
          count={unread}
          testID="operations-bell"
        />
      }
      identity={<OperationsStaffMenu testID="operations-staff-menu" />}
      testID="warehouse-hub-header"
    />
  );

  if (hub.status === 'loading') {
    /* İLK YÜK SKELETON, HALKA DEĞİL (kullanıcı kararı 30.08) — halka yerleşim tutmaz ve söndüğü
       an sayfa zıplar. Üç kutu hub'ın üç bloğunun yerini tutuyor: özet kartı, D1 büyük kartı ve
       kutucuk ızgarası (ölçüler bloklarının kendi yüksekliklerinden). */
    return (
      <View style={styles.screen} testID="operations-section-warehouse">
        {header}
        <View style={styles.loading}>
          <OperationsSkeletonList
            heights={[HUB_SKELETON.overview, HUB_SKELETON.hero, HUB_SKELETON.grid]}
            label={t.hub.loading}
            testID="warehouse-hub-loading"
          />
        </View>
      </View>
    );
  }

  /*
    KAPSAM SORUSU İKİ YOLDAN DOĞAR (30.08) ve ikisi de gerçek bir ölçüm:

    1. `scope === 'ambiguous'` — kapı sordu (`400 warehouse_required`). Bugüne kadarki tek yol.
    2. `workplace === null` + seçilebilecek tesis VAR — kapıya hiç gitmeden biliyoruz: kapsam tek
       tesis değil (`resolvedWarehouseId === null`) ve personel henüz seçmedi.

    İkincisi eklendi çünkü birincisi GEÇ: üç istek düşene kadar depocu boş bir hub'a bakıyordu, ve
    "depo değiştir"den sonra soru ancak bir sonraki okumada geri gelirdi. Bu bir tahmin değil —
    seçimin yokluğu istemcinin kendi bildiği bir gerçek; kimin hangi depoya yazabileceği kararı ise
    hâlâ tamamen kapının (her istekte `?warehouseId=` kapsama karşı sınanıyor).
  */
  if (scope === 'ambiguous' || (workplace === null && warehouseOptions.length > 0)) {
    return (
      <View style={styles.screen} testID="operations-section-warehouse">
        {header}
        <View style={styles.block}>
          {/*
            İKİ AYRI CÜMLE, ÇÜNKÜ İKİ AYRI HÂL (kullanıcı bulgusu 30.08).

            Eskiden tek cümle vardı — *"yönetici seni bir depoya atadığında bu bölüm kendiliğinden
            açılır"* — ve çok depolu personel için YANLIŞTI: atama zaten yapılmıştı, hatta İKİ kez.
            Ölçülen hâl `hepsi@lezzetanatolia.fr` (kapsam: bir tesis + bir araç): ekran doğru bir
            şey söylüyor ama yanlış kişiye söylüyordu ve çıkış yolu yoktu.

            Ayrım seçeneklerin VARLIĞINDAN geliyor, rolden değil: seçenek varsa soru "hangisi",
            yoksa cevap "atama bekleniyor". Kapsam okunamadığında da ikinci cümle geçerlidir —
            olmayan bir listeden seçim istemek, personeli boş bir ekrana bakmaya bırakırdı.
          */}
          <OperationsNoticeBlock
            variant="empty"
            title={warehouseOptions.length === 0 ? t.common.scope.title : t.common.scope.pickTitle}
            description={warehouseOptions.length === 0 ? t.common.scope.body : t.common.scope.pickBody}
            testID="warehouse-scope-block"
          />

          {/*
            SEÇİCİ (v3 ekran 10) — kapsamdaki TESİSLER, araçlar süzülmüş (`useWarehouseOptions`).
            Seçim sunucuya bir yetki olarak gitmiyor: adrese `?warehouseId=` yazılıyor ve kapı onu
            her istekte kapsama karşı sınıyor (`403 warehouse_out_of_scope`). Yani ekran bir kapı
            AÇMIYOR, var olan kapıya hangi anahtarla gireceğini söylüyor.
          */}
          {warehouseOptions.map((option) => (
            <PressableSurface
              key={option.id}
              onPress={() => pickWarehouse(option.id)}
              feedback="scale"
              style={styles.scopePick}
              accessibilityLabel={fillCopy(t.common.scope.pickAction, { name: option.name })}
              testID={`warehouse-scope-pick-${option.id}`}
            >
              <Text style={styles.scopePickName}>{option.name}</Text>
              {/* Kod da yazılıyor: iki tesisin adı benzediğinde ("Kehl Depo" · "Kehl Şube") adı
                  görüp seçmek bir tahmindir; kod belgelerde de o tesisi işaret eder. */}
              <Text style={styles.scopePickCode}>{option.code}</Text>
            </PressableSurface>
          ))}

          {/*
            ÇIKIŞ YOLLARI (v3:1057) — kapsam belirsizken depo bölümü kullanılamaz ama personelin
            BAŞKA bölümleri açık olabilir ("Ayşe Demir · depo + para"). Şablonun "Para bölümüne
            geç" düğmesi işte bu: kullanıcıyı kapalı bir kapının önünde bırakmamak.

            YALNIZ GERÇEKTEN AÇIK bölümler çizilir. Şablon "Para"yı sabit yazıyor; sabit yazmak,
            para yetkisi olmayan bir depocuya açamayacağı bir kapı göstermek olurdu — ve o kapı
            "yetkin yok" diye geri atardı. Bölüm listesi kapıdan geliyor (`useOperationsSections`).
          */}
          {sections
            .filter((section) => section !== 'warehouse')
            .map((section) => (
              <PressableSurface
                key={section}
                onPress={() => router.navigate(operationsSectionRoute(section))}
                feedback="scale"
                style={styles.scopeExit}
                accessibilityLabel={fillCopy(t.common.scope.otherSection, { section: shell.sections[section].tab })}
                testID={`warehouse-scope-to-${section}`}
              >
                <Text style={styles.scopeExitLabel}>{fillCopy(t.common.scope.otherSection, { section: shell.sections[section].tab })}</Text>
              </PressableSurface>
            ))}

          {/* Kararın kendisi yazılı: depo SEÇTİRİLMİYOR. Bir liste koymak kolay olurdu; yanlış
              depoya yazılan sayım iki deponun stokunu birden bozar (DOMAIN §17). */}
          <Text style={styles.scopeFootnote}>{t.common.scope.footnote}</Text>
        </View>
      </View>
    );
  }

  /* Kilit uyarısı hem listede hem HATA hâlinde çizilir: okumalar bağlantısızlıktan düştüyse
     depocunun göreceği ilk cümle "sunucu sorunu" değil "hat kapalı" olmalı — ve yazma ekranlarının
     neden kilitli olduğu o an anlaşılmalı. */
  const offlineBanner = offline ? (
    <View style={styles.offline} testID="warehouse-hub-offline">
      <Text style={styles.offlineText}>{t.hub.offline}</Text>
    </View>
  ) : null;

  if (hub.status === 'error') {
    return (
      <View style={styles.screen} testID="operations-section-warehouse">
        {header}
        <View style={styles.block}>
          {offlineBanner}
          <OperationsNoticeBlock
            variant="error"
            title={t.hub.error.title}
            description={t.hub.error.body}
            retry={{ label: t.common.retry, onPress: hub.reload }}
            testID="warehouse-hub-error"
          />
        </View>
      </View>
    );
  }

  const overview = buildOverview(hub.orders, hub.pendingHandover);
  const picking = buildPicking(hub.orders);
  const tiles = buildTiles(hub.orders, hub.transfers, hub.pendingHandover, router);

  return (
    <View style={styles.screen} testID="operations-section-warehouse">
      {/* AŞAĞI ÇEKİNCE YENİLE (kullanıcı isteği 30.08): hub günün sayılarını gösteriyor ve
          depocu onları tazelemek için ekrandan çıkıp giriyordu. */}
      {/* KABUK DAVRANIŞLARI TEK KAPIDAN (M1b · M1c): kap hem yapışkan mikro başlığı çizer hem
          kaydırma olayını kabuğa bağlar. Ekranın yazdığı tek şey ekran adı. */}
      <OperationsScreenScroll
        title={t.hub.title}
        caption={shell.sections.warehouse.tab}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={hub.reloading} onRefresh={hub.refresh} />}
        testID="warehouse-hub-list"
      >
        {/* BAŞLIK KAYDIRICININ İÇİNDE (M1a → M1b devri): tam başlık sayfayla birlikte yukarı
            kayar, 44px'i geçince yerini mikro başlık alır. Dışarıda kalsaydı ikisi üst üste
            binerdi — cihazda ölçüldü 30.08: mikro şerit indi, altında tam başlık asılı kaldı. */}
        {header}

        {offlineBanner}

        {/* ── 1. ÖZET KARTI ─────────────────────────────────────────────────
            Tıklanabilir DEĞİL: üç sayının da gideceği yer zaten altta bir kart olarak duruyor.
            Aynı yere iki kapı açmak, hangisinin "asıl" olduğunu belirsizleştirirdi. */}
        <View style={styles.overview} testID="warehouse-hub-overview">
          <Text style={styles.overviewLabel}>{t.hub.overview.label}</Text>
          <View style={styles.overviewRow}>
            {overview.map((cell, index) => (
              <View key={cell.key} style={[styles.overviewCell, index === 0 ? null : styles.overviewCellDivided]}>
                <Text
                  style={[styles.overviewValue, cell.key === 'half' ? styles.overviewValueWarn : null]}
                  testID={`warehouse-hub-overview-${cell.key}`}
                >
                  {cell.value}
                </Text>
                <Text style={styles.overviewCaption}>{cell.caption}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 2. D1 BÜYÜK KART ──────────────────────────────────────────── */}
        <PressableSurface
          onPress={() => router.navigate('/picking')}
          feedback="scale"
          style={styles.hero}
          accessibilityLabel={`${t.hub.rows.picking.title} — ${picking.subtitle}`}
          testID="warehouse-hub-picking"
        >
          <View style={styles.heroHead}>
            <View style={styles.codeChip}>
              <Text style={styles.codeChipText}>{t.hub.rows.picking.code}</Text>
            </View>
            <Text style={styles.heroTitle}>{t.hub.rows.picking.title}</Text>
            {picking.badge === null ? null : (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText} testID="warehouse-hub-picking-badge">
                  {picking.badge}
                </Text>
              </View>
            )}
          </View>

          {picking.preview.length === 0 ? null : (
            <View style={styles.previewList} testID="warehouse-hub-picking-preview">
              {picking.preview.map((row) => (
                <View key={row.key} style={styles.previewRow}>
                  <View style={styles.previewMark} />
                  <View style={styles.previewBody}>
                    <Text style={styles.previewTitle} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text style={styles.previewMeta} numberOfLines={1}>
                      {row.meta}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.heroFoot}>{picking.subtitle}</Text>
        </PressableSurface>

        {/* ── 3. D2…D8 IZGARASI ─────────────────────────────────────────── */}
        <View style={styles.grid}>
          {tiles.map((tile) => (
            <PressableSurface
              key={tile.key}
              onPress={tile.onPress}
              feedback="scale"
              style={[styles.tile, tile.empty === true ? styles.tileEmpty : null, { width: tileWidth }]}
              accessibilityLabel={`${tile.title} — ${tile.subtitle}`}
              testID={`warehouse-hub-${tile.key}`}
            >
              <View style={styles.tileHead}>
                <Icon name={tile.icon} size={operationsTheme.size.tileIcon} color={tile.tone} />
                <Text style={styles.tileCode}>{tile.code}</Text>
              </View>
              {/* Başlık tek satır, alt metin en fazla iki: kutucuk sabit yükseklikte ve taşan
                  metin kutuyu değil KENDİNİ kısaltmalı. */}
              <Text style={styles.tileTitle} numberOfLines={1}>
                {tile.title}
              </Text>
              <Text style={[styles.tileSubtitle, tile.alert ? styles.tileSubtitleAlert : null]} numberOfLines={2}>
                {tile.subtitle}
              </Text>
            </PressableSurface>
          ))}
        </View>

        {/* ── Yazıcı şeridi — kurulum, günlük iş değil; ızgaranın DIŞINDA.

            Kullanıcı bulgusu N6 (30.08): tasarımdaki düğmeden farklı görünüyordu. Ölçüm beş
            ayrım gösterdi — zemin `neutral-bg` (belirgin kum) iken tasarım `cream`, kenar
            `sand-300` iken tasarım `neutral-bg` (yani neredeyse görünmez), yarıçap bir kademe
            küçük, alt metin `muted` iken tasarım `tab-inactive`, yön oku bir punto büyük.
            Toplamı: sessiz olması gereken şerit, ızgaranın kutucuklarından DAHA yüksek sesle
            çiziliyordu. Artık kitin `quiet` tonu — tasarımda 37 kullanımı olan yüzey. */}
        <OperationsSurface
          tone="quiet"
          padding="md"
          chevron
          onPress={() => router.navigate('/printers')}
          accessibilityLabel={`${t.hub.rows.printers.title} — ${t.hub.rows.printers.subtitle}`}
          testID="warehouse-hub-printers"
        >
          <View style={styles.printersRow}>
            <Icon name="settings" size={operationsTheme.size.stripIcon} color={operationsTheme.colors.muted} />
            <View style={styles.printersBody}>
              <Text style={styles.printersTitle}>{t.hub.rows.printers.title}</Text>
              {/* Şerit "bu cihaz" diyorsa CİHAZIN HÂLİNİ söylemeli (görsel ajanı ölçümü 30.08,
                  hub farkı #4): tasarım "kutu etiketi QL-1110NWB · kargo etiketi tanımsız" yazıyor,
                  bizde ne işe yaradığını anlatan bir cümle vardı — ayarı açmadan hiçbir şey
                  öğretmiyordu. Okuma düşerse (`null`) o cümleye geri düşülür. */}
              <Text style={styles.printersSubtitle} testID="warehouse-hub-printers-state">
                {printerSummary(hub.printers)}
              </Text>
            </View>
          </View>
        </OperationsSurface>

        <Text style={styles.footnote}>{t.hub.footnote}</Text>
      </OperationsScreenScroll>
    </View>
  );
}

/**
 * ÖZET KARTININ ÜÇ SAYISI — hepsi zaten okunan veriden.
 *
 * `null` = OKUNAMADI ve "—" yazılır; sıfıra düşürmek "bugün iş yok" demek olurdu (CLAUDE §1).
 * "Yarım kutu": mühürlenmemiş kutusu olan sipariş — `sealedAt === null`. Kutuyu değil SİPARİŞİ
 * sayıyoruz, çünkü depocunun bitirmesi gereken şey siparişin kendisidir.
 */
function buildOverview(
  orders: readonly PreparationOrderContract[] | null,
  pendingHandover: number | null,
): { key: 'orders' | 'half' | 'shipments'; value: string; caption: string }[] {
  const unknown = t.hub.overview.unknown;
  const half = orders === null ? null : orders.filter(hasOpenBox).length;

  return [
    { key: 'orders', value: orders === null ? unknown : String(orders.length), caption: t.hub.overview.orders },
    { key: 'half', value: half === null ? unknown : String(half), caption: t.hub.overview.half },
    {
      key: 'shipments',
      value: pendingHandover === null ? unknown : String(pendingHandover),
      caption: t.hub.overview.shipments,
    },
  ];
}

/** Siparişin açık (mühürlenmemiş) kutusu var mı — "yarım kutu"nun tanımı. */
function hasOpenBox(order: PreparationOrderContract): boolean {
  return order.boxes.some((box) => box.sealedAt === null);
}

/** D1 kartının rozeti, önizleme satırları ve alt metni. */
function buildPicking(orders: readonly PreparationOrderContract[] | null): {
  badge: string | null;
  subtitle: string;
  preview: { key: string; title: string; meta: string }[];
} {
  const copy = t.hub.rows.picking;

  if (orders === null) return { badge: null, subtitle: copy.errorCta, preview: [] };
  if (orders.length === 0) return { badge: null, subtitle: copy.emptyCta, preview: [] };

  /* İLK İKİSİ — şablonun sayısı. Önizleme bir LİSTE DEĞİL, kartın "içeride ne var" cümlesidir;
     üçüncü satır kartı listeye çevirir ve altındaki ızgarayı ekrandan atardı.

     SIRA KUYRUĞUN SIRASIDIR (`orderPickingQueue`), ucun sırası değil: kuyruk ekranı yarım kalanı
     en üste alıyor ve hub burada başka bir "ilk ikisi" gösterseydi, aynı listenin iki ekranda iki
     farklı başı olurdu — depocu kartta gördüğü siparişi listenin başında bulamazdı. */
  const preview = orderPickingQueue(orders)
    .slice(0, 2)
    .map((order) => {
      const progress = fillCopy(t.hub.preview.line, {
        picked: String(order.pickedLineCount),
        total: String(order.lineCount),
      });
      return {
        key: order.orderId,
        title: `${order.referenceNo ?? ''} · ${order.recipientName ?? order.customerName}`.replace(/^ · /, ''),
        /* Açık kutu varsa onu söyle, yoksa kanalı: ikisi de "bu sipariş ne durumda" sorusuna
           cevaptır ama açık kutu ACİL olandır — kapatılmayı bekleyen bir iş. */
        meta: hasOpenBox(order) ? `${progress} · ${t.hub.preview.half}` : `${progress} · ${order.channel.toUpperCase()}`,
      };
    });

  return { badge: String(orders.length), subtitle: copy.open, preview };
}

/**
 * **Yazıcı şeridinin künyesi** — cihazın o anki kurulumu (v3:01 · görsel ajanı farkı #4).
 *
 * Tasarımın cümlesi iki yarımdan kurulu: *"kutu etiketi QL-1110NWB · kargo etiketi tanımsız"*.
 * Her yarım bir AMACIN karşılığı ve ikisi ayrı ayrı tanımsız olabilir — KEHL'de kutu yazıcısı var,
 * kargo yok (tohumun kendi üç hâli). Tek bir "2 yazıcı" sayısı bu bilgiyi taşımazdı: depocunun
 * sorusu "kaç tane" değil, "kargo etiketi basabilir miyim".
 *
 * `null` (okunamadı) → açıklama metnine düşülür. Boş liste ("hiç yazıcı yok") ondan AYRI ve kendi
 * cümlesini alır: biri ölçüm düşüşü, öteki gerçek bir kurulum hâli (CLAUDE §1).
 */
function printerSummary(printers: readonly BoxPrinterContract[] | null): string {
  if (printers === null) return t.hub.rows.printers.subtitle;
  const nameOf = (purpose: BoxPrinterContract['purpose']) =>
    printers.find((printer) => printer.purpose === purpose)?.model ?? t.hub.rows.printers.unset;
  return fillCopy(t.hub.rows.printers.state, { box: nameOf('box'), shipping: nameOf('shipping') });
}

/**
 * IZGARANIN YEDİ KUTUCUĞU. Sıra TASARIMIN sırasıdır (D2…D8), okuma sırası değil.
 *
 * `null` liste = OKUNAMADI ve "yok" ile karıştırılmaz: birinde alt metin "okunamadı" der,
 * ötekinde "bekleyen sipariş yok".
 */
function buildTiles(
  orders: readonly PreparationOrderContract[] | null,
  transfers: readonly { referenceNo: string }[] | null,
  pendingHandover: number | null,
  router: ReturnType<typeof useRouter>,
): HubTile[] {
  const transfer = t.hub.rows.transfer;
  const handover = t.hub.rows.handover;

  const handoverSubtitle =
    pendingHandover === null
      ? handover.unknown
      : pendingHandover === 0
        ? handover.none
        : pendingHandover === 1
          ? handover.one
          : fillCopy(handover.some, { n: String(pendingHandover) });

  const firstTransfer = transfers?.[0];
  const transferSubtitle =
    transfers === null
      ? transfer.unknown
      : firstTransfer === undefined
        ? transfer.none
        : transfers.length === 1
          ? fillCopy(transfer.some, { ref: firstTransfer.referenceNo })
          : fillCopy(transfer.someMany, { ref: firstTransfer.referenceNo, n: String(transfers.length) });

  const discardCount = NEAR_EXPIRY_FIXTURE.filter((batch) => batch.decision === 'discard').length;

  return [
    {
      key: 'intake',
      code: t.hub.rows.intake.code,
      icon: 'intake',
      tone: operationsTheme.colors.olive,
      title: t.hub.rows.intake.title,
      subtitle: t.hub.rows.intake.subtitle,
      alert: false,
      onPress: () => router.navigate('/intake'),
    },
    {
      key: 'near-expiry',
      code: t.hub.rows.nearExpiry.code,
      icon: 'near-expiry',
      tone: operationsTheme.colors.terracotta,
      title: t.hub.rows.nearExpiry.title,
      subtitle: fillCopy(t.hub.rows.nearExpiry.subtitle, {
        n: String(NEAR_EXPIRY_FIXTURE.length),
        discard: String(discardCount),
      }),
      /* Şablonun `d3Rengi` kuralı: liste DOLUYKEN alt metin dikkat rengine geçer. İmhalık parti
         bekleyen bir karardır; gri yazılsaydı öteki altı kutucukla aynı sesle konuşurdu. */
      alert: discardCount > 0,
      onPress: () => router.navigate('/near-expiry'),
    },
    {
      key: 'adjustment',
      code: t.hub.rows.adjustment.code,
      icon: 'stock-count',
      tone: operationsTheme.colors.olive,
      title: t.hub.rows.adjustment.title,
      subtitle: t.hub.rows.adjustment.subtitle,
      alert: false,
      onPress: () => router.navigate('/stock-count'),
    },
    {
      key: 'transfer',
      code: transfer.code,
      icon: 'transfer',
      tone: operationsTheme.colors['sand-600'],
      title: transfer.title,
      subtitle: transferSubtitle,
      alert: false,
      // Liste OKUNDU ve boşsa kesikli; `null` (okunamadı) kesikli DEĞİL — ölçülemeyeni "iş yok"
      // diye göstermek olurdu.
      empty: transfers !== null && transfers.length === 0,
      onPress: () => router.navigate('/inbound'),
    },
    {
      key: 'return',
      code: t.hub.rows.return.code,
      icon: 'courier-return',
      tone: operationsTheme.colors.terracotta,
      title: t.hub.rows.return.title,
      subtitle: t.hub.rows.return.subtitle,
      /* `d6Rengi` — bekleyen döküm bir karardır, bekleyen bir iştir. Bugün metin sabit (dökümü
         listeleyen kapı yok), o yüzden koşul da sabit; kapı gelince sayıya bağlanır. */
      alert: true,
      onPress: () => router.navigate('/courier-return'),
    },
    {
      key: 'sale',
      code: t.hub.rows.sale.code,
      icon: 'sale',
      tone: operationsTheme.colors.olive,
      title: t.hub.rows.sale.title,
      subtitle: t.hub.rows.sale.subtitle,
      alert: false,
      onPress: () => router.navigate('/sale'),
    },
    /*
      KARGO DEVRİ (07.12 · tasarım §8.6) — kutuların taşıyıcıya verildiği an.

      Sayaç kendi ucundan geliyor ve bu bir istisna: bekleyen kutuları hiçbir liste taşımıyor.
      Duyurulmuş bir siparişin kutuları hazırlık kuyruğundan DÜŞMÜŞTÜR (sipariş `ready`), yani
      hub'ın "listeden say" kuralı burada uygulanamıyordu.
    */
    {
      key: 'handover',
      code: handover.code,
      icon: 'handover',
      tone: operationsTheme.colors.olive,
      title: handover.title,
      subtitle: handoverSubtitle,
      alert: false,
      // Sayaç ucundan geliyor; `null` "okunamadı" demek ve o hâlde kesikli çizilmez.
      empty: pendingHandover === 0,
      onPress: () => router.navigate('/handover'),
    },
  ];
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
  /* Skeleton ORTALANMAZ: yerini tuttuğu bloklar yukarıdan başlıyor ve ortalanmış kutular veri
     gelince yukarı sıçrardı — halkanın kusurunu geri getirmek olurdu. */
  loading: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space['3xl'],
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
    gap: operationsTheme.space.xl,
  },
  /** Kapsam belirsizken açık kalan bölümlere çıkış — kullanıcı kapalı kapının önünde bırakılmaz. */
  scopeExit: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
  },
  scopeExitLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['olive-dark'],
  },
  /**
   * Depo seçeneği — çıkış düğmesiyle AYNI iskelet ama DOLU zemin: bu satır bir kaçış değil,
   * ekranın beklediği eylemdir. Aynı kutunun içinde iki kademe var (ad + kod), o yüzden hizalama
   * ortadan sola alındı.
   */
  scopePick: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space.xl,
    gap: operationsTheme.space['2xs'],
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-dark'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  scopePickName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['olive-dark'],
  },
  scopePickCode: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  scopeFootnote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space.xl,
  },
  /** Kilit uyarısı listenin ÜSTÜNDE, çünkü işlerin üçünü birden kapatıyor. */
  offline: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  offlineText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },

  /* ── Özet kartı ─────────────────────────────────────────────────────────── */
  overview: {
    marginTop: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['4xl'],
    gap: operationsTheme.space['2xl'],
  },
  overviewLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    /* Harf aralığı TOKEN'dan, ham çarpandan değil: token `em` (yazı boyuna göreli), RN mutlak dp
       ister — çeviri `parse.ts`te, tek yerde. Şablon burada 0.2em, kod chip'lerinde 0.14em
       yazıyor; ikisi de ölçeğin `eyebrow--letter-spacing` durağının (0.18em) etrafında ve o durak
       kullanılıyor. Ara değer için yeni durak AÇILMADI — üstbaşlık aralığı tek bir karardır,
       kullanıldığı yere göre değişmez (`section-header.tsx`in aynı yolu). */
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    textTransform: 'uppercase',
    color: operationsTheme.colors['on-ink-label'],
  },
  overviewRow: {
    flexDirection: 'row',
  },
  overviewCell: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  overviewCellDivided: {
    borderLeftWidth: operationsTheme.border.hairline,
    borderLeftColor: operationsTheme.colors['on-ink-line'],
    paddingLeft: operationsTheme.space.xl,
  },
  overviewValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors['on-image'],
  },
  /** "Yarım kutu" amber — bitirilmesi gereken bir iş; hata DEĞİL (token künyesi). */
  overviewValueWarn: {
    color: operationsTheme.colors['on-ink-warn'],
  },
  overviewCaption: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-ink-muted'],
  },

  /* ── D1 büyük kartı ─────────────────────────────────────────────────────── */
  hero: {
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['4xl'],
    gap: operationsTheme.space.xl,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  codeChip: {
    borderWidth: operationsTheme.border.hairline,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.sm,
  },
  codeChipText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  heroTitle: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.step,
    color: operationsTheme.colors.ink,
  },
  heroBadge: {
    backgroundColor: operationsTheme.colors.terracotta,
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.lg,
  },
  heroBadgeText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.card,
  },
  /* "tüm kuyruğu aç →" — kullanıcı bulgusu N5 (30.08): tasarımdakinden farklı görünüyordu.
     Ölçüldü, dördü birden ayrılmış: tasarım `700 12px · #5f7a2c · align-self:flex-end`,
     kod `400 · micro · muted · sola yaslı`. Yani bir EYLEM cümlesi, gri bir dipnot gibi
     çiziliyordu — kartın ne yaptığını söyleyen tek satır okunmuyordu.

     Dokunulabilir DEĞİL ve tasarımda da değil: satırın kendi `onClick`i yok, kartın var.
     Zeytin renk burada "bu bir bağlantı" demez, "bu kart seni oraya götürür" der. */
  heroFoot: {
    alignSelf: 'flex-end',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.olive,
  },
  previewList: {
    gap: operationsTheme.space.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  /** Şablonun sol işareti — satırı listeye bağlayan dikey çubuk. */
  previewMark: {
    width: operationsTheme.size.previewMark,
    height: operationsTheme.size.previewMarkHeight,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.terracotta,
  },
  previewBody: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.ink,
  },
  previewMeta: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },

  /* ── Izgara ─────────────────────────────────────────────────────────────── */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.lg,
  },
  /* Genişlik BURADA YOK — çağıran ekran genişliğinden hesaplayıp veriyor (gerekçe komponentte).
     Büyümeye de izin verilmiyor: yedi kutucuk iki sütuna sığmaz ve son hücre tek kalır; şablonun
     ızgarası `1fr 1fr` olduğu için o hücre tam genişliğe YAYILMAZ, bir sütun kalır. */
  tile: {
    // Sabit yükseklik: sekiz kutucuk EŞİT olmalı (metrics künyesi). `minHeight` ızgarayı kaydırıyordu.
    height: operationsTheme.size.tile,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    padding: operationsTheme.space['2xl'],
    gap: operationsTheme.space.md,
  },
  /* BOŞ KUTUCUK KESİKLİ (görsel ajanı ölçümü 30.08, hub farkı #3): tasarımın kuralı "dolu kart
     düz, boş kart kesikli". Kesik çizgi "burada bir şey OLABİLİR ama bugün yok" der; düz çerçeve
     boş bir kutuyu dolu kardeşleriyle aynı ağırlıkta gösteriyordu ve depocu ızgarayı tararken
     hangisinde iş olduğunu ancak alt metni okuyarak anlıyordu. Kitin `blank` tonuyla aynı karar
     (`surface.tsx`); kutucuk kendi yüzeyini çizdiği için ton oradan alınmıyor, kural tekrarlanıyor. */
  tileEmpty: {
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileCode: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['sand-600'],
  },
  tileTitle: {
    marginTop: 'auto',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  tileSubtitle: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  /** Bekleyen karar dikkat rengiyle yazılır (şablonun `d3Rengi`/`d6Rengi` kuralı). */
  tileSubtitleAlert: {
    color: operationsTheme.colors.error,
  },

  /* ── Yazıcı şeridi ──────────────────────────────────────────────────────── */
  printersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  printersBody: {
    flex: 1,
  },
  printersTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.body,
  },
  /* Alt metin `tab-inactive` (#a8a191): tasarımın en sessiz mürekkebi ve v3'te 91 kez geçiyor.
     `muted` (#8a8270) buradaki başlıkla neredeyse aynı ağırlıkta okunuyordu — şerit tek satır
     gibi görünüyor, hangisinin başlık olduğu ayırt edilemiyordu. */
  printersSubtitle: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['tab-inactive'],
  },
  chevron: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
  footnote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
