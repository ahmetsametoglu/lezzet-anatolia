import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fetchPendingHandover, handOverBox } from '@/lib/api/warehouse';
import { fillCopy } from '@/screens/operations/copy';
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

/** Okutma geçmişinin bir satırı — sonucun tonu cümleyle birlikte taşınır. */
interface ScanRow {
  key: string;
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

export function HandoverScreen() {
  const router = useRouter();
  const { offline } = useWarehouseStatus();
  const [scanOpen, setScanOpen] = useState(false);
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [busy, setBusy] = useState(false);
  /** Rampada bekleyen kutu; **`null` = OKUNAMADI, sıfır DEĞİL** — "rampa boş" yanlış bir izindir. */
  const [pending, setPending] = useState<number | null>(null);

  const loadPending = useCallback(async () => {
    const result = await trackWarehouse(fetchPendingHandover());
    setPending(result.error === null ? result.data.boxes : null);
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
        const key = `${code}-${Date.now()}`;
        if (result.error !== null) {
          return { key, tone: 'error', text: result.error === 'network_error' ? t.common.networkError : fillCopy(t.common.serverError, { error: result.error }) };
        }
        const data = result.data;
        switch (data.status) {
          case 'ok':
            return {
              key,
              tone: 'ok',
              text: data.shipmentHandedOver
                ? fillCopy(t.handover.doneAll, { ref: data.referenceNo ?? '—', n: String(data.boxCount) })
                : fillCopy(t.handover.done, { n: String(data.boxNo), handed: String(data.handedBoxes), total: String(data.boxCount) }),
            };
          // İkinci okutma bir HATA değil: sayaç kıpırdamadı, depocu sayımına güvenmeye devam etsin.
          case 'already_handed':
            return { key, tone: 'warn', text: fillCopy(t.handover.already, { n: String(data.boxNo), handed: String(data.handedBoxes), total: String(data.boxCount) }) };
          case 'out_of_scope':
            return { key, tone: 'error', text: fillCopy(t.handover.outOfScope, { ref: data.referenceNo ?? '—' }) };
          case 'not_sealed':
            return { key, tone: 'error', text: fillCopy(t.handover.notSealed, { n: String(data.boxNo) }) };
          case 'not_announced':
            return { key, tone: 'error', text: fillCopy(t.handover.notAnnounced, { n: String(data.boxNo) }) };
          default:
            return { key, tone: 'error', text: fillCopy(t.handover.unknownCode, { code }) };
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

  return (
    <View style={styles.screen} testID="warehouse-handover">
      <OperationsStackHeader
        title={t.handover.title}
        subtitle={t.handover.subtitle}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="warehouse-handover-header"
      />

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-handover-list">
        {/* Sayı düğmenin ÜSTÜNDE: depocu "daha var mı" sorusunu okutmadan ÖNCE soruyor. */}
        <Text style={styles.pending} testID="warehouse-handover-pending">
          {pending === null
            ? t.handover.pendingUnknown
            : pending === 0
              ? t.handover.pendingNone
              : pending === 1
                ? t.handover.pendingOne
                : fillCopy(t.handover.pending, { n: String(pending) })}
        </Text>

        {offline ? (
          /* ÇEVRİMDIŞI SEBEBİ BU EKRANDA EN KESKİN (v3:1692): kutu devri ANINDA yazılır ve
             kuyruğa alınamaz — taşıyıcıya fiziksel olarak verilmiş bir kutunun sistemde "sırada"
             beklemesi, malın kimde olduğunu belirsiz bırakır. Genel "yazma kapalı" cümlesi bunu
             söylemiyordu. */
          <View style={styles.locked} testID="warehouse-handover-locked">
            <Text style={styles.lockedTitle}>{t.handover.locked.title}</Text>
            <Text style={styles.lockedBody}>{t.handover.locked.body}</Text>
          </View>
        ) : (
          <>
            <PressableSurface
              onPress={() => setScanOpen(true)}
              feedback="scale"
              disabled={busy}
              style={styles.scanButton}
              accessibilityLabel={t.handover.cta}
              testID="warehouse-handover-scan"
            >
              <Text style={styles.scanLabel}>{busy ? t.handover.busy : t.handover.cta}</Text>
            </PressableSurface>
            {/* EKRANIN KURALI DÜĞMENİN ALTINDA (v3:1686) — "hangi siparişi vereceğini seçmiyorsun"
                bu ekranın tasarım kararıdır (liste değil OKUTUCU). Eskiden yalnız geçmiş boşken
                görünüyordu; ilk okutmadan sonra kaybolan bir kural, ikinci kutuda unutulur. */}
            <Text style={styles.scanRule}>{t.handover.scanRule}</Text>
          </>
        )}

        <Text style={styles.logHeading}>{t.handover.logHeading}</Text>

        {rows.length === 0 ? (
          <View style={styles.emptyBlock} testID="warehouse-handover-empty">
            <Text style={styles.emptyTitle}>{t.handover.empty.title}</Text>
            <Text style={styles.emptyBody}>{t.handover.empty.body}</Text>
          </View>
        ) : (
          rows.map((row) => (
            <Text key={row.key} style={[styles.notice, styles[`notice_${row.tone}`]]} testID={`warehouse-handover-row-${row.key}`}>
              {row.text}
            </Text>
          ))
        )}

        <Text style={styles.footnote}>{t.handover.footnote}</Text>
      </ScrollView>

      <ScanSheet
        open={scanOpen}
        title={t.handover.scanTitle}
        hint={t.handover.scanHint}
        onClose={() => setScanOpen(false)}
        onScan={handleScan}
        testID="warehouse-handover-scan-sheet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    paddingHorizontal: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['4xl'],
    gap: operationsTheme.space.md,
  },
  scanButton: {
    marginTop: operationsTheme.space.xl,
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.olive,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors.cream,
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
  notice: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    padding: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
  },
  notice_ok: {
    color: operationsTheme.colors.ink,
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors.card,
  },
  notice_warn: {
    color: operationsTheme.colors.ink,
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors.panel,
  },
  notice_error: {
    color: operationsTheme.colors.terracotta,
    borderColor: operationsTheme.colors.terracotta,
    backgroundColor: operationsTheme.colors.card,
  },
  footnote: {
    marginTop: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.muted,
  },
});
