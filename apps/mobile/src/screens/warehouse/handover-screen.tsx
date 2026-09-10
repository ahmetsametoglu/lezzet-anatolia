import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { ORDER_STATUS_LABELS, type AwaitingHandoverBoxContract } from '@lezzet/types';

import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsScanFab } from '@/components/operations/scan-fab';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { Icon } from '@/components/ui/icon';
import { fetchPendingHandover, handOverBox } from '@/lib/api/warehouse';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { trackWarehouse, useWarehouseStatus } from './warehouse-status';

/*
  KARGO DEVRİ (07.12) — kutular taşıyıcıya veriliyor.

  ── EKRAN BİR LİSTE DEĞİL, BİR OKUTUCU ──────────────────────────────────────
  Fiziksel an şu: depocu rampada, kurye karşısında, kutuları tek tek uzatıyor. "Hangi siparişi
  vereceğim" diye bir soru YOK — elindeki kutuyu okutuyor ve sistem hangi gönderi olduğunu kendisi
  çözüyor. Bir bekleyenler listesi çizmek, olmayan bir seçimi varmış gibi göstermek olurdu.

  Bu yüzden ekranın gövdesi OKUTMA GEÇMİŞİ: hangi kutu verildi, kaç kaldı.

  ── AMA BİR SAYI VAR, VE LİSTEDEN FARKI ─────────────────────────────────────
  Başlıkta rampada bekleyen kutu ADEDİ yazıyor (07.12 · §8.6). Sayı bir seçim davet etmiyor, bir
  BİTİŞ ölçüsü veriyor: depocu okutmaya başlamadan önce kaç kutu olduğunu, okuturken de kaç
  kaldığını görüyor. Bu soru bugüne kadar ancak İLK okutmadan sonra ve yalnız O gönderi için
  cevaplanabiliyordu (`handedBoxes/boxCount`) — rampada üç ayrı siparişin kutuları varken
  "bitti mi" sorusunun cevabı hiçbir yerde yoktu.

  Sayı her okutmadan sonra SUNUCUDAN yeniden okunuyor, yerelde eksiltilmiyor: aynı depoda ikinci
  bir telefon da okutuyor olabilir ve yerel bir sayaç sessizce yanlışa kayardı.

  ── SAYIM GÖNDERİNİN, SİPARİŞİN DEĞİL ───────────────────────────────────────
  "2/3 kutu verildi" cümlesi duyurulan GÖNDERİYİ sayıyor (kapı künyesi): bir siparişin kutuları
  iptal + yeniden duyuruyla iki gönderiye bölünmüş olabilir ve depocunun elindeki yığın ikincisidir.

  ── ÇEVRİMDIŞI: KİLİT VAR, KUYRUK YOK ───────────────────────────────────────
  Bağlantı yokken okutma düğmesi çizilmez (kabul ve toplama ekranlarının aynı kararı): yerel bir
  kuyruğa yazmak depocuya "verildi" dedirtip rafla sistemi ayırırdı.
*/

const t = warehouseCopy;

/*
  ── SATIR İKİ KATMAN, TON DÖRT (çizime çekildi 05.09) ───────────────────────
  Çizim her sonucu bir KART olarak veriyor: kalın başlık, ince alt satır, sağ üstte saat. Kod
  ikisini tek cümlede birleştirip saati atıyordu — saat zaten hesaplanıyordu, satır anahtarı
  olarak kullanılıp çöpe gidiyordu.

  Ton sayısı da üçe düşmüştü ve çakışma en yanlış yerdeydi: "kutu verildi" ile "son kutuyla sipariş
  YOLA ÇIKTI" aynı kartı alıyordu. Oysa ekranın var olma sebebi o ikincisi — gönderinin yola
  çıktığı an. Çizim onu ayrı bir tonla ve tikle işaretliyor; kısmi devir nötr kalıyor.

  `muted` da bilinçli: "başka deponun kutusu" ve "zaten verilmişti" HATA DEĞİL. Biri yönlendirme
  (kutuyu doğru yığına koy), öteki bir tekrar. Kırmızıya boyamak depocuya yanlış yaptığını söyler.
*/
type ScanTone = 'done' | 'neutral' | 'muted' | 'error';

/** Okutma geçmişinin bir satırı — başlık, alt satır, saat ve ton birlikte taşınır. */
interface ScanRow {
  key: string;
  tone: ScanTone;
  title: string;
  sub: string;
  /** Okutmanın CİHAZDAKİ anı ("14:20") — kapı zaman döndürmüyor, bu yerel ölçüm. */
  time: string;
}

/** `Date` → "14:20". Yerel saat; ekranın tek kullanıcısı rampadaki depocu ve saati onun saati. */
function clockOf(at: Date): string {
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}

export function HandoverScreen() {
  const router = useRouter();
  const { offline } = useWarehouseStatus();
  const [scanOpen, setScanOpen] = useState(false);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [busy, setBusy] = useState(false);
  /** Rampada bekleyen kutu; **`null` = OKUNAMADI, sıfır DEĞİL** — "rampa boş" yanlış bir izindir. */
  const [pending, setPending] = useState<number | null>(null);
  /** Rampada bekleyen kutuların KENDİSİ — sayının satır hâli (kullanıcı kararı 05.09). */
  const [waiting, setWaiting] = useState<AwaitingHandoverBoxContract[]>([]);

  const loadPending = useCallback(async () => {
    const result = await trackWarehouse(fetchPendingHandover());
    setPending(result.error === null ? result.data.boxes : null);
    // Okunamayan liste BOŞ liste değildir; ama sayı da `null` olduğu için ekran zaten "okunamadı"
    // diyor — iki yarım cevap yerine tek cümle.
    setWaiting(result.error === null ? result.data.waiting : []);
  }, []);

  // Ekran açılınca bir kez: sayının işi okutmaya BAŞLAMADAN önce cevap vermek.
  useEffect(() => {
    void loadPending();
  }, [loadPending]);

  const handleScan = useCallback(
    (code: string) => {
    // Sayfa okuma başına kapanır (mal kabul deseni): sonuç listenin üstünde okunur, ikinci kutu
    // için düğme yeniden açar. Rampada elinde kutu olan depocu için bu bir adım değil, bir ritim.
    setScanOpen(false);
    setBusy(true);

    void (async () => {
      const result = await trackWarehouse(handOverBox(code));
      setBusy(false);

      const satir = ((): ScanRow => {
        const now = new Date();
        const key = `${code}-${now.getTime()}`;
        const time = clockOf(now);
        const r = t.handover.result;

        if (result.error !== null) {
          return {
            key,
            tone: 'error',
            time,
            title: r.failed.title,
            sub: fillCopy(r.failed.sub, {
              reason: result.error === 'network_error' ? t.common.networkError : fillCopy(t.common.serverError, { error: result.error }),
            }),
          };
        }
        const data = result.data;
        switch (data.status) {
          case 'ok': {
            const ref = data.referenceNo ?? '—';
            // SON KUTU AYRI BİR TON: ekranın var olma sebebi bu an (çizim: yeşil zemin + tik).
            if (data.shipmentHandedOver) {
              return {
                key,
                tone: 'done',
                time,
                title: r.doneAll.title,
                sub: fillCopy(r.doneAll.sub, { ref, handed: String(data.handedBoxes), total: String(data.boxCount) }),
              };
            }
            // Kalan kutu sayısı TÜRETİLİR (toplam − verilen); çizimin alt satırı bunu söylüyor.
            const kalan = data.boxCount - data.handedBoxes;
            return {
              key,
              tone: 'neutral',
              time,
              title: fillCopy(r.done.title, { handed: String(data.handedBoxes), total: String(data.boxCount) }),
              sub: kalan === 1 ? fillCopy(r.done.subOne, { ref }) : fillCopy(r.done.subMany, { ref, n: String(kalan) }),
            };
          }
          // İkinci okutma bir HATA değil: sayaç kıpırdamadı, depocu sayımına güvenmeye devam etsin.
          case 'already_handed':
            return { key, tone: 'muted', time, title: r.already.title, sub: fillCopy(r.already.sub, { code }) };
          // Kapsam dışı kutu da hata DEĞİL, bir yönlendirme: kutuyu doğru yığına geri koy.
          case 'out_of_scope':
            return { key, tone: 'muted', time, title: r.outOfScope.title, sub: fillCopy(r.outOfScope.sub, { ref: data.referenceNo ?? '—' }) };
          case 'not_sealed':
            return { key, tone: 'error', time, title: r.notSealed.title, sub: fillCopy(r.notSealed.sub, { code }) };
          /*
            SİPARİŞ ARTIK GÖNDERİLMİYOR (05.09 · cihazda bulundu).

            Sunucudaki kapı 21.265'te yazıldı ama ekran öğrenmemişti: `not_shippable` bu `switch`in
            `default`ına düşüyor ve depocuya **"Kod tanınmıyor"** diyordu. Yanlış cevabın bedeli
            somut — depocu barkodun okunmadığını sanır, siler, tekrar dener, elle girer; kutu
            elinde kalır ve gerçek sebebi ("bu sipariş iptal edildi") hiç öğrenemez. Typecheck
            göremezdi: `default` yeni birlik üyesini sessizce yutar.

            Ret bir YÖNLENDİRME, kapsam dışı kutunun aynı tonu: kutu rampadan ÇEKİLİR. Durum adı
            motorun sözlüğünden geliyor (`ORDER_STATUS_LABELS`) — kurye kulvarındaki kardeş
            mesajın aynı kaynağı (`use-courier-day.hook.ts:786`).
          */
          case 'not_shippable':
            return {
              key,
              tone: 'error',
              time,
              title: r.notShippable.title,
              sub: fillCopy(r.notShippable.sub, {
                ref: data.referenceNo ?? '—',
                status: ORDER_STATUS_LABELS[data.currentStatus],
              }),
            };
          case 'not_announced':
            return { key, tone: 'error', time, title: r.notAnnounced.title, sub: r.notAnnounced.sub };
          default:
            return { key, tone: 'error', time, title: r.unknownCode.title, sub: fillCopy(r.unknownCode.sub, { code }) };
        }
      })();

      // En yeni ÜSTTE: depocu son okuttuğunun cevabını aramak için listeyi kaydırmasın.
      setRows((current) => [satir, ...current]);

      /*
        SAYI HER OKUTMADAN SONRA TAZELENİR — başarısızdan sonra da.

        Yerelde eksiltmek daha ucuz olurdu ama yanlışa kayardı: aynı depoda ikinci bir telefon da
        okutuyor olabilir. Başarısız okutmadan sonra da tazelenmesinin sebebi ayrı — `not_sealed`
        ya da `not_announced` alan bir kutu, o arada BAŞKASI tarafından hazırlanmış olabilir.
      */
      void loadPending();
    })();
    },
    [loadPending],
  );

  /* Rampanın sayı künyesi — başlığın kuyruğuna giriyor. `null` OKUNAMADI demek, sıfır değil. */
  const rampaSayisi =
    pending === null
      ? t.handover.rampCountUnknown
      : pending === 0
        ? t.handover.rampCountNone
        : pending === 1
          ? t.handover.rampCountOne
          : fillCopy(t.handover.rampCount, { n: String(pending) });

  /* İKİSİ DE BOŞ: rampada kutu yok VE bugün hiç okutma yapılmadı. Okunamayan sayı bu hâle
     GİRMEZ — "bilmiyorum"u "boş" saymak, depocuyu dolu bir rampadan uzaklaştırırdı. */
  const bosEkran = pending === 0 && waiting.length === 0 && rows.length === 0;

  return (
    <View style={styles.screen} testID="warehouse-handover">
      {/* KABUK DAVRANIŞLARI TEK KAPIDAN (21.178): yapışkan mikro başlık ve alt çubuk gizlemesi
          bu kaptan besleniyor. Başlık KAYDIRICININ İÇİNDE — dışarıda kalsaydı mikro şerit inince
          altında asılı kalırdı. */}
      <OperationsScreenScroll
        title={t.handover.title}
        caption={operationsCopy.sections.warehouse.tab}
        contentContainerStyle={styles.list}
        testID="warehouse-handover-list"
      >
        {/* Başlık burada HER hâlde kaydırıcının içinde, yani yer değiştirmiyordu; sarmalama
            tasarım ölçüsü için — gövdenin dolgusu başlığın kendi 20'sine binip onu itiyordu,
            öteki yığın başlıklarının hepsi 20'de. */}
        <OperationsHeadBleed pad="5xl">
          <OperationsStackHeader
            title={t.handover.title}
            subtitle={t.handover.subtitle}
            onBack={() => router.back()}
            backLabel={t.common.back}
            testID="warehouse-handover-header"
          />
        </OperationsHeadBleed>

        {/* EKRANIN KURALI HER ZAMAN GÖRÜNÜR (v3:1686) — "hangi siparişi vereceğini seçmiyorsun"
            bu ekranın tasarım kararıdır. Kaybolan bir kural, ikinci kutuda unutulur. */}
        <Text style={styles.scanRule}>{t.handover.scanRule}</Text>

        {!offline ? null : (
          /* ÇEVRİMDIŞI SEBEBİ BU EKRANDA EN KESKİN (v3:1692): kutu devri ANINDA yazılır ve
             kuyruğa alınamaz — taşıyıcıya fiziksel olarak verilmiş bir kutunun sistemde "sırada"
             beklemesi, malın kimde olduğunu belirsiz bırakır. */
          <View style={styles.locked} testID="warehouse-handover-locked">
            <Text style={styles.lockedTitle}>{t.handover.locked.title}</Text>
            <Text style={styles.lockedBody}>{t.handover.locked.body}</Text>
          </View>
        )}

        {/*
          ── BOŞ EKRAN TEK CÜMLE (kullanıcı bulgusu 05.09) ────────────────────────────────────
          Rampa boşken ve henüz okutma yapılmamışken ekran aynı şeyi ÜÇ kez söylüyordu: üstte
          "rampa boş", ortada "RAMPADA BEKLEYEN → bekleyen kutu yok", altta "bugün kutu
          verilmedi". Üç boş blok, boş bir ekranda kalabalık yapıyordu ve ilk kez giren
          *"burası ne"* diye soruyordu. İkisi de boşken artık tek blok var ve ekranın ne
          olduğunu söylüyor.
        */}
        {bosEkran ? (
          <View style={styles.emptyBlock} testID="warehouse-handover-idle">
            <Text style={styles.emptyTitle}>{t.handover.idle.title}</Text>
            <Text style={styles.emptyBody}>{t.handover.idle.body}</Text>
          </View>
        ) : (
          <>
            {/*
              ── RAMPADA BEKLEYEN (kullanıcı kararı 05.09) ────────────────────────────────────
              Ekranın kuralı "liste değil OKUTUCU" ve bu liste onunla ÇELİŞMİYOR: seçim değil
              ENVANTER. Satırlar dokunulamaz — hiçbiri bir eylem açmıyor.

              SAYI BAŞLIĞIN KUYRUĞUNDA (v3'ün kendi grameri): ayrı bir cümle olarak yazılınca
              bölümün boş hâliyle aynı şeyi iki kez söylüyordu.
            */}
            <Text style={styles.logHeading} testID="warehouse-handover-pending">
              {`${t.handover.rampHeading} · ${rampaSayisi}`}
            </Text>
            {waiting.map((box) => (
              <View key={box.boxId} style={styles.rampRow} testID={`warehouse-handover-ramp-${box.code}`}>
                <Text style={styles.rampTitle}>
                  {fillCopy(t.handover.rampRow, {
                    ref: box.referenceNo ?? '—',
                    no: String(box.boxNo),
                    total: String(box.boxCount),
                  })}
                </Text>
                <Text style={styles.rampCode}>{box.code}</Text>
              </View>
            ))}
            {/* KIRPILMA SESSİZ DEĞİL: gerçek toplam sayaçtan geliyor, liste tavanlı. Kırpılmış bir
                listeyi tam sanmak, rampayı olduğundan boş sanmaktır. */}
            {pending === null || pending <= waiting.length ? null : (
              <Text style={styles.rampMore} testID="warehouse-handover-ramp-more">
                {fillCopy(t.handover.rampMore, { n: String(waiting.length), total: String(pending) })}
              </Text>
            )}

            <Text style={styles.logHeading}>{t.handover.logHeading}</Text>
            {rows.length !== 0 ? null : (
              <View style={styles.emptyBlock} testID="warehouse-handover-empty">
                <Text style={styles.emptyTitle}>{t.handover.empty.title}</Text>
                <Text style={styles.emptyBody}>{t.handover.empty.body}</Text>
              </View>
            )}
          </>
        )}

        {rows.length === 0 ? null : (
          rows.map((row) => (
            <View key={row.key} style={[styles.row, styles[`row_${row.tone}`]]} testID={`warehouse-handover-row-${row.key}`}>
              <View style={styles.rowHead}>
                {row.tone !== 'done' ? null : (
                  <Icon name="check" size={operationsTheme.size.cardTileIcon} color={operationsTheme.colors['olive-dark']} />
                )}
                <Text style={[styles.rowTitle, styles[`title_${row.tone}`]]}>{row.title}</Text>
                {/* SAAT sağ üstte (çizim): depocu "hangi kutuyu ne zaman verdim" sorusunu
                    listeden okuyor. Kapı zaman döndürmüyor, bu CİHAZIN ölçtüğü an. */}
                <Text style={styles.rowTime}>{row.time}</Text>
              </View>
              <Text style={styles.rowSub}>{row.sub}</Text>
            </View>
          ))
        )}

        {rows.length === 0 ? null : <Text style={styles.footnote}>{t.handover.footnote}</Text>}
      </OperationsScreenScroll>

      {/* OKUTMA FAB'DA (kullanıcı isteği 05.09) — sayım, düşüm ve yükleme ekranlarının aynı
          kararı: kaydırılan içeriğin DIŞINDA, sağ altta sabit. İki bölümlü gövdede satır içi bir
          düğme listeyi ikiye bölerdi ve aşağı kaydırınca elin gittiği yer boşalırdı.
          Çevrimdışında daire GİZLENMİYOR, SÖNÜYOR: kaybolan düğme "bu ekranda okutma yok" der,
          sönük düğme "şimdi olmaz" der ve sebebi zaten yukarıdaki kilit bloğunda yazılı. */}
      <OperationsScanFab
        icon="scan"
        onPress={() => setScanOpen(true)}
        disabled={offline || busy}
        accessibilityLabel={busy ? t.handover.busy : t.handover.cta}
        testID="warehouse-handover-scan"
      />

      <ScanSheet
        open={scanOpen}
        title={t.handover.scanTitle}
        hint={t.handover.scanHint}
        onClose={() => setScanOpen(false)}
        onScan={handleScan}
        /* Simülasyon çipleri RAMPADA BEKLEYENLERdir (05.09). `scan-sheet.tsx` künyesi bunu şart
           koşuyordu — *"kutu QR'ı havuzda yok: kutu kodlarını çağıran ekran kendi devCodes'uyla
           verir, elindeki gerçek kutuların kodları"* — ve kutu okutan altı ekranın beşi veriyordu;
           D8 tek eksikti. Bedeli ölçüldü: kargo devri kamerasız hiç denenemiyordu, yani cihaz
           doğrulaması bu ekranda başlamadan bitiyordu. Liste zaten elde (`/handover/pending`).

           Çipler LİSTEDEN geliyor, ayrı bir sorgudan değil: rampada olmayan bir kutuyu çip yapmak
           depocuya elinde olmayan bir kutuyu vaat ederdi. Kapının reddettiği hâller (iptal, başka
           depo) burada zaten görünmez — onlar gerçek kâğıtla, kamerayla denenir. */
        devCodes={waiting.map((box) => ({ label: `Kutu ${box.boxNo}/${box.boxCount}`, code: box.code }))}
        testID="warehouse-handover-scan-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    /* SAYFA KENARI 20 (tasarım ölçümü 09.09: bu ekranın blokları `margin:0 20px`). 12 yazılıydı ve
       ekranın gövdesi başlığından 8 birim solda duruyordu — cihazda görüldü. Öteki 22 yığın
       ekranının hepsi 20/22'de. */
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space['4xl'],
    gap: operationsTheme.space.md,
  },
  /*
    RAMPA SATIRI — DOKUNULAMAZ (05.09). Kart zemini ve "›" oku bilerek YOK: dokunulabilir görünen
    bir satır, dokunup bir şey olmayınca arıza gibi okunur (transfer listesinin aynı kuralı).
    Bu bölüm bir envanter, bir seçim değil.
  */
  rampRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
    paddingVertical: operationsTheme.space.md,
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  rampTitle: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  /** Kutu kodu künye: taşıyıcının etiketine METİN olarak yazılı, depocu kutunun üstünde okuyor. */
  rampCode: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  rampEmpty: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space.md,
  },
  rampMore: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.md,
  },
  /** Sayı satırı — ipucundan AYRI yüz: bu bir açıklama değil, işin ölçüsü. */
  pending: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
    marginTop: operationsTheme.space.lg,
  },
  /** Ekranın kuralı — düğmenin altında, HER ZAMAN (ilk okutmadan sonra da). */
  scanRule: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  logHeading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
    paddingTop: operationsTheme.space.lg,
  },
  emptyBlock: {
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    gap: operationsTheme.space['2xs'],
  },
  emptyTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  emptyBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  locked: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderRadius: operationsTheme.radius.control,
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
    gap: operationsTheme.space['2xs'],
  },
  lockedTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.error,
  },
  lockedBody: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },
  /*
    SONUÇ KARTI (çizime çekildi 05.09) — başlık + saat üstte, alt satır altta.
    Dört ton, dördü de çizimin kendi zeminleri; kırmızı ailesi token'larda BİREBİR duruyor.
  */
  row: {
    gap: operationsTheme.space['2xs'],
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
  },
  rowHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  rowTitle: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
  },
  /** Saat sağ üstte, satırın en sessiz öğesi — bir künye, bir vurgu değil. */
  rowTime: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  rowSub: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.body,
  },
  /** TAMAMLANDI — gönderi yola çıktı. Ekranın var olma sebebi olan tek olay (çizim: yeşil + tik). */
  row_done: {
    backgroundColor: operationsTheme.colors['success-bg'],
    borderColor: operationsTheme.colors['success-line'],
  },
  title_done: { color: operationsTheme.colors['olive-dark'] },
  /** KISMİ devir — nötr kart; iş sürüyor, kutlanacak bir şey yok. */
  row_neutral: {
    backgroundColor: operationsTheme.colors.panel,
    borderColor: operationsTheme.colors['sand-300'],
  },
  title_neutral: { color: operationsTheme.colors.ink },
  /** HATA DEĞİL, SESSİZ: ikinci okutma ve başka deponun kutusu. Biri tekrar, öteki yönlendirme. */
  row_muted: {
    backgroundColor: operationsTheme.colors.cream,
    borderColor: operationsTheme.colors['neutral-bg'],
  },
  title_muted: { color: operationsTheme.colors.body },
  /** GERÇEK ENGEL — mühürsüz kutu, etiketsiz gönderi, tanınmayan kod. */
  row_error: {
    backgroundColor: operationsTheme.colors['error-bg'],
    borderColor: operationsTheme.colors['error-line'],
  },
  title_error: { color: operationsTheme.colors.error },
  footnote: {
    marginTop: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.muted,
  },
});
