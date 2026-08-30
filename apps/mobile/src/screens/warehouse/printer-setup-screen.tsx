import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { BoxPrinterContract, PrinterPurpose } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fetchPrinters } from '@/lib/api/warehouse';
import { findNetworkPrinters, printLabel } from '@/lib/print/brother';
import { downloadSampleLabelPng } from '@/lib/print/label-file';
import { hasPrinterNativeModule } from '@/lib/print/printer-availability';
import { choosePrinter, readPrinterChoice, type PrinterChoice } from '@/lib/print/printer-choice';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  BU CİHAZ · YAZICILAR (07.12 · kullanıcı kararı 29.08).

  ── EKRAN NEYİ SORUYOR ──────────────────────────────────────────────────────
  *"Sunucu: bu depoda hangi yazıcılar var. Cihaz: hangisini kullanıyor — listeden seçer, elle IP
  yazmaz."* Envanter sunucuda; bu ekran yalnız ikinci yarıyı, yani BU TELEFONUN seçimini yazıyor
  ve seçim cihazın yerel deposunda kalıyor — sunucuya hiç gitmiyor.

  ── İKİ İŞ AYRI SORULUYOR ───────────────────────────────────────────────────
  Ayrım fiziksel (tasarım §4.6): kutu etiketi 4×6 kalıp kesim, kargo etiketi A6 yatay. Tek bir
  "yazıcı seç" sorusu, iki kâğıdı aynı makineye yollardı ve yanlış boy basım anında reddedilirdi.

  ── TEK YAZICI VARSA SORU YOK ───────────────────────────────────────────────
  O iş için depoda tek yazıcı varsa satır "kendiliğinden kullanılıyor" diye işaretli çıkıyor:
  seçenek yoksa seçim de yoktur. Ekran onu yine GÖSTERİYOR — hangi makineye basıldığını bilmek,
  seçmek kadar önemli.
*/

const t = warehouseCopy;
const PURPOSES: PrinterPurpose[] = ['box', 'shipping'];

/**
 * Yazıcının ağdaki hâli. **`unknown` sıfır değil "ölçemedim"dir** (CLAUDE §1): yazıcı modülü bu
 * derlemede yoksa ya da keşif düşerse "bağlı değil" demek, çalışan bir yazıcıyı arızalı gösterir.
 * Anahtarlar sözlükteki (`printers.link.*`) adlarla birebir — ekran kendi eşlemesini kurmuyor.
 */
type PrinterLink = 'online' | 'offline' | 'unknown';

export function PrinterSetupScreen() {
  const router = useRouter();
  const [printers, setPrinters] = useState<BoxPrinterContract[] | null>(null);
  const [choice, setChoice] = useState<PrinterChoice>({});
  const [failed, setFailed] = useState(false);
  /*
    BAĞLANTI DURUMU ÖLÇÜLÜR, VARSAYILMAZ (v3:1022 "bağlı · Wi-Fi" · 30.08).

    ── VERİDE YOK, CİHAZDA VAR ─────────────────────────────────────────────────
    `warehouse_printer` bir ENVANTERDİR: adres, model, kâğıt boyu. "Şu an açık mı" bilgisi orada
    YOK ve olmamalı — bir yazıcının ayakta olup olmadığını ancak onunla aynı ağdaki cihaz bilir;
    sunucuya yazılmış bir "bağlı" bayrağı, kimsenin tazelemediği anda yalan söylemeye başlar.
    Ölçüm SDK'nın ağ keşfiyle yapılıyor (`findNetworkPrinters`, mDNS/SNMP) ve eşleşme ADRESTEN.

    ── ÜÇ HÂL, VE ÜÇÜNCÜSÜ SIFIR DEĞİL ─────────────────────────────────────────
    `online` (keşifte görüldü) · `offline` (tarandı, yok) · **`unknown` (ölçülemedi)**. Üçüncüsü
    CLAUDE §1'in kuralı: yazıcı modülü bu derlemede yoksa (dev-client, jest) ya da keşif düşerse
    "bağlı değil" demek, çalışan bir yazıcıyı arızalı göstermek olurdu — depocu sorunu olmayan bir
    kabloyu kontrol etmeye giderdi. Ölçemediğimizi söylüyoruz.
  */
  const [link, setLink] = useState<Record<string, PrinterLink>>({});
  const [probing, setProbing] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  /**
   * Ağ keşfi — listedeki her yazıcı için üç hâlden birini yazar. Modül yoksa HİÇ taranmaz ve
   * hepsi `unknown` kalır: tarama yapamayan bir cihazın "yok" demesi, ölçmediğini ölçmüş gibi
   * söylemesidir.
   */
  const probe = useCallback(async (rows: BoxPrinterContract[]) => {
    if (rows.length === 0) return;
    if (!hasPrinterNativeModule()) {
      setLink(Object.fromEntries(rows.map((row) => [row.id, 'unknown' as const])));
      return;
    }
    setProbing(true);
    try {
      const found = await findNetworkPrinters();
      const addresses = new Set(found.map((channel) => channel.address));
      setLink(Object.fromEntries(rows.map((row) => [row.id, addresses.has(row.address) ? 'online' : 'offline'])));
    } catch {
      // Keşfin kendisi düştü — bu "yazıcı yok" DEĞİL "ölçemedim"dir (CLAUDE §1). Sessiz değil:
      // satırlar `unknown` yazıyor ve depocu ölçümün yapılamadığını görüyor.
      setLink(Object.fromEntries(rows.map((row) => [row.id, 'unknown' as const])));
    } finally {
      setProbing(false);
    }
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    const [liste, secim] = await Promise.all([trackWarehouse(fetchPrinters()), readPrinterChoice()]);
    setChoice(secim);
    if (liste.error !== null) {
      setFailed(true);
      setPrinters([]);
      return;
    }
    setPrinters(liste.data.printers);
    await probe(liste.data.printers);
  }, [probe]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = useCallback(async (purpose: PrinterPurpose, id: string) => {
    await choosePrinter(purpose, id);
    setChoice(await readPrinterChoice());
  }, []);

  /**
   * **TEST BAS** (v3:1023) — sunucunun ürettiği ÖRNEK etiketi seçili yazıcıya basar.
   *
   * ── NEDEN GERÇEK ŞABLON ─────────────────────────────────────────────────────
   * Basım hattında paketlenmiş bir test deseni var (`printNeedleTest`) ama o başka bir soruyu
   * cevaplıyor: "SDK bu yazıcıya bir görüntü basabiliyor mu" (23.5 iğne deneyi). Ayarlar
   * ekranının sorusu daha dar: *"seçtiğim yazıcıdan BİZİM etiketimiz doğru çıkıyor mu"* — kâğıt
   * boyu tutuyor mu, QR okunuyor mu, yazı kesiliyor mu. Bunu ancak gerçek şablon gösterir.
   *
   * ── HATA YUTULMAZ, CÜMLEYE ÇEVRİLİR ─────────────────────────────────────────
   * SDK reddi (yanlış kâğıt boyu, ulaşılamayan adres) testin VERİSİDİR: "basılamadı" demek
   * yetmez, hangi sebep olduğu ekranda durmalı — kâğıt kararı fizikseldir ve kod onu çözemez.
   */
  const testPrint = useCallback(async (printer: BoxPrinterContract) => {
    setNotice(null);
    setTesting(printer.id);
    try {
      const fileUri = await downloadSampleLabelPng(printer.id);
      await printLabel(fileUri, { address: printer.address, model: printer.model, labelSize: printer.labelSize });
      setNotice({ tone: 'ok', text: fillCopy(t.printers.test.ok, { name: printer.name }) });
    } catch (err) {
      setNotice({
        tone: 'error',
        text: fillCopy(t.printers.test.failed, { error: err instanceof Error ? err.message : String(err) }),
      });
    } finally {
      setTesting(null);
    }
  }, []);

  const header = (
    <OperationsStackHeader
      title={t.printers.title}
      subtitle={t.printers.subtitle}
      onBack={() => router.back()}
      backLabel={t.common.back}
      testID="warehouse-printers-header"
    />
  );

  if (printers === null) {
    return (
      <View style={styles.screen} testID="warehouse-printers">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.printers.loading} label={t.printers.loading} testID="warehouse-printers-loading" />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen} testID="warehouse-printers">
      {header}
      <ScrollView contentContainerStyle={styles.list} testID="warehouse-printers-list">
        {failed ? (
          <OperationsNoticeBlock
            variant="error"
            title={t.printers.error.title}
            description={t.printers.error.body}
            retry={{ label: t.common.retry, onPress: () => void load() }}
            testID="warehouse-printers-error"
          />
        ) : null}

        {PURPOSES.map((purpose) => {
          const uygun = printers.filter((p) => p.purpose === purpose);
          const tek = uygun.length === 1;
          return (
            <View key={purpose} style={styles.group} testID={`warehouse-printers-${purpose}`}>
              <Text style={styles.groupTitle}>{t.printers.purpose[purpose]}</Text>
              {uygun.length === 0 ? (
                <Text style={styles.empty}>{t.printers.none}</Text>
              ) : (
                uygun.map((row) => {
                  // Tek yazıcıda "seçili" işareti bir seçimi DEĞİL bir olguyu anlatıyor:
                  // başka aday yok, o yüzden basım oradan çıkıyor.
                  const secili = tek || choice[purpose] === row.id;
                  const durum: PrinterLink = link[row.id] ?? 'unknown';
                  return (
                    <View key={row.id} style={styles.rowWrap}>
                      <PressableSurface
                        onPress={() => void pick(purpose, row.id)}
                        feedback="scale"
                        selected={secili}
                        style={styles.row}
                        accessibilityLabel={row.name}
                        testID={`warehouse-printers-option-${row.id}`}
                      >
                        <View style={styles.rowBody}>
                          <Text style={styles.rowTitle}>{row.name}</Text>
                          <Text style={styles.rowSub}>
                            {fillCopy(t.printers.detail, { model: row.model, address: row.address, size: row.labelSize })}
                          </Text>
                          {/* BAĞLANTI DURUMU — üç hâl, üçüncüsü "ölçemedim" (yukarıdaki künye).
                              Tarama sürerken ayrı bir cümle: boş bırakmak "yok" gibi okunurdu. */}
                          <Text
                            style={[styles.link, styles[`link_${durum}`]]}
                            testID={`warehouse-printers-link-${row.id}`}
                          >
                            {probing ? t.printers.link.probing : t.printers.link[durum]}
                          </Text>
                        </View>
                        <Text style={styles.mark}>{secili ? (tek ? t.printers.only : '✓') : ''}</Text>
                      </PressableSurface>
                      {/* TEST AYRI BİR DÜĞME, satırın kendisi DEĞİL: satıra dokunmak SEÇER ve
                          seçim ile basım aynı dokunuşa binseydi depocu yazıcıyı değiştirmek
                          isterken kâğıt harcardı. */}
                      <PressableSurface
                        onPress={() => void testPrint(row)}
                        disabled={testing !== null}
                        feedback="scale"
                        compact
                        style={styles.testButton}
                        accessibilityLabel={t.printers.test.cta}
                        testID={`warehouse-printers-test-${row.id}`}
                      >
                        <Text style={styles.testLabel}>
                          {testing === row.id ? t.printers.test.sending : t.printers.test.cta}
                        </Text>
                      </PressableSurface>
                    </View>
                  );
                })
              )}
              {/* HER İŞİN KENDİ SONUCU (v3:1017, 1035) — seçim bir tercih değil, bir DAVRANIŞ
                  belirliyor: kutu etiketi kapanışta kendiliğinden basar; kargo etiketi alınmışsa
                  basım düşse bile gönderi iptal olmaz. İkisi ayrı cümle, çünkü ikisinin bedeli
                  ayrı — ortak bir dipnot ikisini de yarım anlatırdı. */}
              <Text style={styles.consequence}>{t.printers.consequence[purpose]}</Text>
            </View>
          );
        })}

        {notice === null ? null : (
          <Text
            style={[styles.notice, notice.tone === 'ok' ? styles.noticeOk : styles.noticeError]}
            accessibilityRole="alert"
            testID="warehouse-printers-notice"
          >
            {notice.text}
          </Text>
        )}

        <Text style={styles.footnote}>{t.printers.footnote}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: {
    paddingHorizontal: operationsTheme.space.xl,
    paddingBottom: operationsTheme.space['4xl'],
    gap: operationsTheme.space.lg,
  },
  group: { gap: operationsTheme.space.sm, marginTop: operationsTheme.space.lg },
  /* v3'te grup başlığı bir BAŞLIK değil ÜSTBAŞLIK ("KUTU ETİKETİ · 4×6"): ekranda iki grup var ve
     ikisi de aynı işin iki kipi — Lora başlıklar onları iki ayrı bölüm gibi gösteriyordu. */
  groupTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  /** İşin sonucu — seçim bir tercih değil, bir davranış belirliyor. */
  consequence: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  empty: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.terracotta,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
    padding: operationsTheme.space.md,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors.card,
  },
  /** Satır + test düğmesi tek blok: düğme satırın ALTINDA, çünkü ikisi ayrı fiil (seç / bas). */
  rowWrap: { gap: operationsTheme.space['2xs'] },
  testButton: {
    alignSelf: 'flex-end',
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-line'],
  },
  testLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors['olive-dark'],
  },
  /** Bağlantı durumu — üç hâl üç renk; "ölçemedim" nötr (uyarı da değil, olumlu da). */
  link: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  link_online: { color: operationsTheme.colors['olive-dark'] },
  link_offline: { color: operationsTheme.colors.terracotta },
  link_unknown: { color: operationsTheme.colors.muted },
  notice: {
    marginTop: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
  },
  noticeOk: { color: operationsTheme.colors['olive-dark'] },
  noticeError: { color: operationsTheme.colors.terracotta },
  rowBody: { flex: 1, gap: operationsTheme.space['2xs'] },
  rowTitle: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  rowSub: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.muted,
  },
  mark: {
    fontFamily: operationsTheme.font.body[600],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.olive,
  },
  footnote: {
    marginTop: operationsTheme.space.lg,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.muted,
  },
});
