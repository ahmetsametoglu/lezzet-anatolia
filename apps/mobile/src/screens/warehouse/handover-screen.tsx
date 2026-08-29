import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { handOverBox } from '@/lib/api/warehouse';
import { fillCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { trackWarehouse, useWarehouseStatus } from './warehouse-status';

/*
  KARGO DEVRİ (07.12) — kutular taşıyıcıya veriliyor.

  ── EKRAN BİR LİSTE DEĞİL, BİR OKUTUCU ──────────────────────────────────────
  Fiziksel an şu: depocu rampada, kurye karşısında, kutuları tek tek uzatıyor. "Hangi siparişi
  vereceğim" diye bir soru YOK — elindeki kutuyu okutuyor ve sistem hangi gönderi olduğunu kendisi
  çözüyor. Bir bekleyenler listesi çizmek, olmayan bir seçimi varmış gibi göstermek olurdu (ve
  besleyeceği bir uç da yok).

  Bu yüzden ekranın gövdesi OKUTMA GEÇMİŞİ: hangi kutu verildi, kaç kaldı. Depocunun tek sorusu
  odur ve cevabı her okutmadan sonra yazılıyor.

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

  const handleScan = useCallback((code: string) => {
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
    })();
  }, []);

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
        {offline ? (
          <Text style={[styles.notice, styles.notice_error]} accessibilityRole="alert">
            {t.common.offlineHint}
          </Text>
        ) : (
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
        )}

        {rows.length === 0 ? (
          <Text style={styles.hint}>{t.handover.hint}</Text>
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
  hint: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.muted,
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
