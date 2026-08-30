import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { BoxPrinterContract, PrinterPurpose } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsSurface } from '@/components/operations/surface';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fetchPrinters } from '@/lib/api/warehouse';
import { findNetworkPrinters, printLabel } from '@/lib/print/brother';
import { downloadSampleLabelPng } from '@/lib/print/label-file';
import { hasPrinterNativeModule } from '@/lib/print/printer-availability';
import { choosePrinter, readPrinterChoice, resolvePrinter, type PrinterChoice } from '@/lib/print/printer-choice';
import { fillCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  BU CİHAZ · YAZICILAR (07.12 · kullanıcı kararı 29.08 · v3 yerleşimi 30.08).

  ── EKRAN NEYİ SORUYOR ──────────────────────────────────────────────────────
  *"Sunucu: bu depoda hangi yazıcılar var. Cihaz: hangisini kullanıyor — listeden seçer, elle IP
  yazmaz."* Envanter sunucuda; bu ekran yalnız ikinci yarıyı, yani BU TELEFONUN seçimini yazıyor
  ve seçim cihazın yerel deposunda kalıyor — sunucuya hiç gitmiyor.

  ── İKİ İŞ = İKİ KART (v3:1009-1039) ────────────────────────────────────────
  Ayrım fiziksel (tasarım §4.6): kutu etiketi 4×6 kalıp kesim, kargo etiketi taşıyıcının A6'sı.
  Tek bir "yazıcı seç" sorusu iki kâğıdı aynı makineye yollardı ve yanlış boy basım anında
  reddedilirdi. v3 bu ayrımı LİSTE BAŞLIĞIYLA değil KARTLA kuruyor: her iş kendi kutusunda, kendi
  üstbaşlığı (`KUTU ETİKETİ · 4×6`), kendi hedefi ve kendi sonuç cümlesiyle duruyor.

  ── KARTIN İKİ HÂLİ, RENGİ KENARINDAN ───────────────────────────────────────
  · HEDEF VAR  → nötr kart (`panel` + `sand-300`): zeytin karonun içinde yazıcı ikonu, adı,
    bağlantı satırı ve "test bas".
  · HEDEF YOK  → uyarı kartı (turuncu kenar + terracotta üstbaşlık): "Tanımlı değil / etiket
    alınsa da basılamaz". Kartı uyarı yapan şey ZEMİNİ değil KENARI ve metnidir — zemin ölçümü
    (#fdf8f3) `panel`e Δ2/2/1, yani ekranda ayırt edilemez (`operations-app.ts` §4 künyesi).

  ── HEDEF "SEÇİLEN" DEĞİL, "BASILACAK OLAN" ─────────────────────────────────
  Kartın tepesindeki yazıcıyı ekran KENDİ hesaplamıyor: basım hattının kullandığı `resolvePrinter`
  ile aynı cevabı okuyor (seçim varsa o · o iş için tek yazıcı varsa o · yoksa `null`). İki ayrı
  hesap olsaydı ekran bir yazıcı gösterip basım başkasına gidebilirdi.

  ── SEÇENEK LİSTESİ SORU OLDUĞUNDA ÇIZİLİR ──────────────────────────────────
  Şablon seçenek satırlarını (v3:1032-1037) yalnız kargo kartında gösteriyor; kutu kartında tek
  aday var ve liste yok. Kural adaydan çıkıyor, kartın hâlinden değil: iki ve daha fazla aday
  varsa soru VARDIR (seçili olan da işaretli durur, böylece cihaz kararı geri alınabilir), tek
  aday varsa soru yoktur — seçenek yoksa seçim de yoktur.
*/

const t = warehouseCopy;
const PURPOSES: PrinterPurpose[] = ['box', 'shipping'];

/**
 * Yazıcının ağdaki hâli. **`unknown` sıfır değil "ölçemedim"dir** (CLAUDE §1): yazıcı modülü bu
 * derlemede yoksa ya da keşif düşerse "bağlı değil" demek, çalışan bir yazıcıyı arızalı gösterir.
 * Anahtarlar sözlükteki (`printers.link.*`) adlarla birebir — ekran kendi eşlemesini kurmuyor.
 */
type PrinterLink = 'online' | 'offline' | 'unknown';

/**
 * İskelet kutusu İŞ KARTININ kendi ölçüsünden türer (bildirimler/karar kutusu emsali): iki dolgu +
 * iki iç aralık + üstbaşlık satırı + ikon karosu boyundaki hedef satırı + iki satırlık sonuç
 * cümlesi. Seçenek listesi hesaba GİRMİYOR — o yalnız iki ve daha fazla aday varken çiziliyor ve
 * yükleme anında kaç aday olduğu henüz bilinmiyor; yer tutucu bilinmeyeni değil, her hâlde var
 * olanı tutar (ölçüm: tasarımın kutu kartı 128 dp, bu türetme 133).
 */
const SKELETON_CARD_HEIGHT =
  operationsTheme.space['2xl'] * 2 +
  operationsTheme.space.lg * 2 +
  operationsTheme.text.eyebrow * operationsTheme.text['lead--line-height'] +
  operationsTheme.size.listAvatar +
  operationsTheme.text.tag * operationsTheme.text['lead--line-height'] * 2;

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
  /* Test sonucu HANGİ İŞİN kartına ait olduğuyla saklanıyor: iki kart var ve ekranın altına
     düşen tek bir cümle, hangi yazıcının cevabı olduğunu söylemezdi. */
  const [notice, setNotice] = useState<{ purpose: PrinterPurpose; tone: 'ok' | 'error'; text: string } | null>(null);

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
   * **TEST BAS** (v3:1023) — sunucunun ürettiği ÖRNEK etiketi kartın hedef yazıcısına basar.
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
  const testPrint = useCallback(async (purpose: PrinterPurpose, printer: BoxPrinterContract) => {
    setNotice(null);
    setTesting(printer.id);
    try {
      const fileUri = await downloadSampleLabelPng(printer.id);
      await printLabel(fileUri, { address: printer.address, model: printer.model, labelSize: printer.labelSize });
      setNotice({ purpose, tone: 'ok', text: fillCopy(t.printers.test.ok, { name: printer.name }) });
    } catch (err) {
      setNotice({
        purpose,
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
        {/* İLK YÜK HALKA DEĞİL İSKELET (kullanıcı kararı 30.08): halka yerleşim tutmaz, söndüğü an
            sayfa zıplar. Kutular sayfanın KENDİ dolgusunun içinde duruyor ki yer tuttukları kartlarla
            aynı hizada olsunlar; iki kutu, çünkü ekranda her zaman iki iş kartı var. */}
        <View style={styles.list}>
          <OperationsSkeletonList
            heights={[SKELETON_CARD_HEIGHT, SKELETON_CARD_HEIGHT]}
            label={t.printers.loading}
            testID="warehouse-printers-loading"
          />
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
          const adaylar = printers.filter((p) => p.purpose === purpose);
          /* Hedef, basım hattının okuduğu cevabın AYNISI — ekran kendi kuralını kurmuyor. */
          const hedef = resolvePrinter(printers, purpose, choice);
          const durum: PrinterLink = hedef === null ? 'unknown' : (link[hedef.id] ?? 'unknown');
          const uyari = hedef === null;
          const sonuc = notice !== null && notice.purpose === purpose ? notice : null;

          return (
            <OperationsSurface
              key={purpose}
              tone="panel"
              padding="lg"
              style={[styles.card, uyari ? styles.cardUnset : null]}
              testID={`warehouse-printers-${purpose}`}
            >
              <Text style={[styles.eyebrow, uyari ? styles.eyebrowUnset : null]}>{t.printers.purpose[purpose]}</Text>

              <View style={styles.head}>
                {/* KARO BİR DÜĞME DEĞİL: `OperationsIconButton` 40'lık kum KUTUCUK ve dokunulabilir;
                    buradaki 34'lük renkli kare yalnız kartın konusunu söylüyor (zeytin = hedef var,
                    terracotta = yok). Kitte karşılığı yok, yerel duruyor (raporlandı). */}
                <View style={[styles.tile, uyari ? styles.tileUnset : null]}>
                  <Icon
                    name={uyari ? 'alert-circle' : 'printer'}
                    size={operationsTheme.size.inlineIcon}
                    color={uyari ? operationsTheme.colors.terracotta : operationsTheme.colors['olive-dark']}
                  />
                </View>
                <View style={styles.headBody}>
                  <Text
                    style={[styles.headTitle, uyari ? styles.headTitleUnset : null]}
                    testID={`warehouse-printers-target-${purpose}`}
                  >
                    {hedef === null ? t.printers.unset.title : hedef.name}
                  </Text>
                  {/* BAĞLANTI DURUMU — üç hâl, üçüncüsü "ölçemedim" (yukarıdaki künye). Tarama
                      sürerken ayrı bir cümle: boş bırakmak "yok" gibi okunurdu. Hedef yokken bu
                      satır bağlantıyı değil BEDELİ yazıyor ("etiket alınsa da basılamaz") —
                      ölçülecek bir yazıcı yok. */}
                  <Text
                    style={[styles.headLink, uyari ? styles.headLinkUnset : styles[`link_${durum}`]]}
                    testID={hedef === null ? undefined : `warehouse-printers-link-${hedef.id}`}
                  >
                    {hedef === null ? t.printers.unset.body : probing ? t.printers.link.probing : t.printers.link[durum]}
                  </Text>
                </View>
                {hedef === null ? null : (
                  /* TEST, SEÇİMDEN AYRI BİR FİİL: seçenek satırına dokunmak yazıcıyı DEĞİŞTİRİR,
                     bu düğme kâğıt HARCAR. İkisi aynı dokunuşa binseydi depocu yazıcı denerken
                     etiket basardı. Dokunma payı yalnız yukarı/yanlara: altındaki seçenek
                     satırları da dokunulabilir ve payların çakıştığı yeri üstteki kazanır. */
                  <PressableSurface
                    onPress={() => void testPrint(purpose, hedef)}
                    disabled={testing !== null}
                    feedback="scale"
                    compact
                    compactEdges="up"
                    style={styles.testButton}
                    accessibilityLabel={t.printers.test.cta}
                    testID={`warehouse-printers-test-${hedef.id}`}
                  >
                    <Text style={styles.testLabel}>
                      {testing === hedef.id ? t.printers.test.sending : t.printers.test.cta}
                    </Text>
                  </PressableSurface>
                )}
              </View>

              {sonuc === null ? null : (
                <Text
                  style={[styles.result, sonuc.tone === 'ok' ? styles.resultOk : styles.resultError]}
                  accessibilityRole="alert"
                  testID={`warehouse-printers-notice-${purpose}`}
                >
                  {sonuc.text}
                </Text>
              )}

              {/* SEÇENEKLER — iki ve daha fazla aday varsa (yukarıdaki künye). Seçili satır da
                  listede kalır: cihazın kararı görünür ve geri alınabilir olmalı. */}
              {adaylar.length < 2 ? null : (
                <View style={styles.options}>
                  {adaylar.map((row) => {
                    const secili = hedef !== null && hedef.id === row.id;
                    return (
                      <OperationsSurface
                        key={row.id}
                        tone="card"
                        padding="none"
                        onPress={() => void pick(purpose, row.id)}
                        /* SEÇİLİLİK ADIN İÇİNDE: `OperationsSurface`in `selected` prop'u yok, yani
                           `accessibilityState.selected` ekran okuyucuya ulaşmıyor — renk farkı da
                           ulaşmaz. Bilgi kaybolmasın diye satırın adına yazılıyor (emsal: depo
                           hub'ının başlık+künye birleşimi). Kit boşluğu raporlandı. */
                        accessibilityLabel={`${row.name} — ${secili ? t.printers.picked : t.printers.pick}`}
                        style={[styles.option, secili ? styles.optionSelected : null]}
                        testID={`warehouse-printers-option-${row.id}`}
                      >
                        <Text style={[styles.optionName, secili ? styles.optionNameSelected : null]}>{row.name}</Text>
                        <Text style={styles.optionAction}>{secili ? t.printers.picked : t.printers.pick}</Text>
                      </OperationsSurface>
                    );
                  })}
                </View>
              )}

              {/* HİÇ ADAY YOKSA eksiklik sunucudadır, cihazda değil — depocu burada seçemez,
                  yazıcının nereden tanımlandığını bilmesi gerekir. Tasarımda bu hâl çizilmemiş
                  (şablonun kargo kartında iki aday var); uyarı kartının içinde tek satırlık bir
                  yön olarak duruyor. */}
              {adaylar.length === 0 ? <Text style={styles.define}>{t.printers.define}</Text> : null}

              {/* HER İŞİN KENDİ SONUCU (v3:1024, 1039) — seçim bir tercih değil, bir DAVRANIŞ
                  belirliyor: kutu etiketi kapanışta kendiliğinden basar; kargo etiketi alınmışsa
                  basım düşse bile gönderi iptal olmaz. İkisi ayrı cümle, çünkü ikisinin bedeli
                  ayrı — ortak bir dipnot ikisini de yarım anlatırdı. */}
              <Text style={[styles.consequence, uyari ? styles.consequenceUnset : null]}>
                {t.printers.consequence[purpose]}
              </Text>
            </OperationsSurface>
          );
        })}

        <Text style={styles.footnote}>{t.printers.footnote}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  /** v3:1014 — `padding:0 20px 24px;gap:12px`; başlığın kendi nefesi `OperationsStackHeader`ta. */
  list: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space['6xl'],
    gap: operationsTheme.space.xl,
  },
  /* İŞ KARTI (v3:1015) — zemin/kenar/yarıçap/dolgu artık `OperationsSurface tone="panel"
     padding="lg"`ten geliyor (tarif birebir aynı: `panel` + `sand-300` + `radius card` + 14/16).
     Ekrana kalan tek şey iç aralık.
     TON `quiet` DEĞİL, ölçüldü: şablon bu kartları `#fbfaf4` + `#ddd6c4` çiziyor (v3:1015, 1027),
     yani `panel`. Kitin "yazıcı kurulumu sessiz ailedendir" örneği DEPO HUB'ININ satırıdır
     (v3:158, krem + `neutral-bg`) — orada yazıcı bir AYAR SATIRIDIR; burada ekranın konusudur. */
  card: {
    gap: operationsTheme.space.lg,
  },
  /* HEDEFSİZ KART — zemin değişmiyor (ölçüm #fdf8f3, `panel`e Δ2/2/1), yalnız KENARI (v3:1027). */
  cardUnset: { borderColor: operationsTheme.colors['warning-line'] },
  /** ÜSTBAŞLIK (v3:1016) — işin adı; kartı açan tek satır. */
  eyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  eyebrowUnset: { color: operationsTheme.colors.terracotta },
  /** HEDEF SATIRI (v3:1017) — karo + ad/bağlantı + "test bas". */
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  /** İkon karosu (v3:1018) — 34×34, `radius 11`, zeytin zemin. */
  tile: {
    width: operationsTheme.size.listAvatar,
    height: operationsTheme.size.listAvatar,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['olive-bg'],
    alignItems: 'center',
    justifyContent: 'center',
    flexGrow: 0,
    flexShrink: 0,
  },
  tileUnset: { backgroundColor: operationsTheme.colors['terracotta-bg'] },
  headBody: { flex: 1, gap: operationsTheme.space['2xs'] },
  headTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.control,
    color: operationsTheme.colors.ink,
  },
  headTitleUnset: { color: operationsTheme.colors.terracotta },
  headLink: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
  },
  headLinkUnset: { color: operationsTheme.colors.muted },
  /** Bağlantı durumu — üç hâl üç renk; "ölçemedim" nötr (uyarı da değil, olumlu da). */
  link_online: { color: operationsTheme.colors.olive },
  link_offline: { color: operationsTheme.colors.terracotta },
  link_unknown: { color: operationsTheme.colors.muted },
  /** "test bas" (v3:1023) — dolgusuz, kum çerçeveli küçük düğme. */
  testButton: {
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space.lg,
  },
  testLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.ink,
  },
  /** Test sonucu — kartın İÇİNDE, hedef satırının hemen altında. */
  result: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
  },
  resultOk: { color: operationsTheme.colors['olive-dark'] },
  resultError: { color: operationsTheme.colors.terracotta },
  /** SEÇENEK LİSTESİ (v3:1031) — `gap:8`. */
  options: { gap: operationsTheme.space.md },
  /* Zemin/kenar/yarıçap `OperationsSurface tone="card"`ten (kutunun İÇİNDEKİ satır: beyaz +
     `sand-300` + bir kademe küçük yarıçap). Dolgu `none`, çünkü şablonun satırı yüksekliğiyle
     tarif ediliyor (48) — dikey dolguyla değil. */
  option: {
    height: operationsTheme.size.controlMd,
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  optionSelected: {
    borderColor: operationsTheme.colors['olive-line'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  optionName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  optionNameSelected: { color: operationsTheme.colors['olive-dark'] },
  optionAction: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  /** Aday yoksa yön gösteren tek satır. */
  define: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  /** İŞİN SONUCU (v3:1024, 1039) — seçim bir tercih değil, bir davranış belirliyor. */
  consequence: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['tab-inactive'],
  },
  /* Uyarı kartında aynı cümle bir kademe KOYU: turuncu kenarın içinde dipnot grisi kayboluyor —
     şablonun kendi ayrımı (v3:1024 `#a8a191` ↔ v3:1039 `#8a8270`). */
  consequenceUnset: { color: operationsTheme.colors.muted },
  /** Ekranın dipnotu (v3:1042) — kuralın kendisi, kartların değil sayfanın altında. */
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['tab-inactive'],
  },
});
