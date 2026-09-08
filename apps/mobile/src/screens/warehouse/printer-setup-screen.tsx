import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { BoxPrinterContract, PrinterPurpose } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsSurface } from '@/components/operations/surface';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { Icon } from '@/components/ui/icon';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fetchPrinters, registerPrinter } from '@/lib/api/warehouse';
import { findNetworkPrinters, printLabel, type PrinterChannel } from '@/lib/print/brother';
import { downloadSampleLabelPng } from '@/lib/print/label-file';
import { locatePrinter, printTargetOf } from '@/lib/print/printer-locate';
import { hasPrinterNativeModule } from '@/lib/print/printer-availability';
import { choosePrinter, readPrinterChoice, resolvePrinter, type PrinterChoice } from '@/lib/print/printer-choice';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { PrinterOptionList } from './printer-option-list';
import { trackWarehouse } from './warehouse-status';

/*
  BU CİHAZ · YAZICILAR (07.12 · kullanıcı kararı 29.08 · v3 yerleşimi 30.08 · tanıtma 05.09).

  ── EKRAN NEYİ SORUYOR ──────────────────────────────────────────────────────
  *"Sunucu: bu depoda hangi yazıcılar var. Cihaz: hangisini kullanıyor — listeden seçer, elle IP
  yazmaz."* Envanter sunucuda; bu ekran ikinci yarıyı, yani BU TELEFONUN seçimini yazıyor ve seçim
  cihazın yerel deposunda kalıyor — sunucuya hiç gitmiyor.

  ── VE ARTIK BİRİNCİ YARIYI DA AÇIYOR (05.09) ───────────────────────────────
  Envanteri 29.08'den beri yalnız web'deki Depolar ekranı dolduruyordu. Cihazda ölçüldü: yazıcının
  önünde duran depocu "Tanımlı değil" kartını görüyor ve kart onu **başka bir yüzeye** yolluyordu —
  elindeki telefonla yapabileceği hiçbir şey yoktu. Artık kart ağda bulunanları listeliyor ve
  dokunuş yazıcıyı bu depoya tanıtıyor.

  ── İKİ İŞ = İKİ KART (v3:1009-1039) ────────────────────────────────────────
  Ayrım fiziksel (tasarım §4.6): kutu etiketi 4×6 kalıp kesim, kargo etiketi taşıyıcının A6'sı.
  Tek bir "yazıcı seç" sorusu iki kâğıdı aynı makineye yollardı ve yanlış boy basım anında
  reddedilirdi. v3 bu ayrımı LİSTE BAŞLIĞIYLA değil KARTLA kuruyor: her iş kendi kutusunda, kendi
  üstbaşlığı, kendi hedefi ve kendi sonuç cümlesiyle duruyor.

  ── ÜSTBAŞLIKTAN "· 4×6" DÜŞTÜ (06.09) ──────────────────────────────────────
  Şablon `KUTU ETİKETİ · 4×6` diyordu ve o gün doğruydu: kutu etiketi geniş yazıcının 4×6 kalıp
  kesiminden çıkıyordu. Kullanıcı iş bölüşümünü düzeltince (kutu etiketi → 62 mm'lik QL-820,
  kargo etiketi → 103 mm'lik QL-1110) o ölçü YANILTICI oldu — kartın üstünde "4×6" yazarken
  makinede 62 mm rulo duruyor. 4×6 şablonun çizim boyu, kâğıdın adı değil (SDK ~%60 ölçekliyor,
  23.5'te okunur çıktığı ölçüldü). Ölçü artık kartın izah satırında, kâğıdın gerçeğiyle.

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

  ── LİSTE ARTIK İKİ CİNS SATIR TAŞIYOR ──────────────────────────────────────
  30.08'de liste yalnız envanterin adaylarını gösteriyordu ve `aday ≥ 2` şartına bağlıydı — yani
  tam da TANIMSIZ hâlde (0 ya da 1 aday) hiç çizilmiyordu. Tasarımın o karttaki asıl fikri buydu ve
  uygulamada hiç görünmedi (kullanıcı bulgusu 05.09). Şart değişti; satır cinsi ikiye çıktı:
    · envanterdeki aday → **seç** (seçili olan da listede kalır, cihaz kararı geri alınabilsin)
    · ağda bulunan ama envanterde olmayan → **tanıt**
  Blok çizilir: hedef yoksa DAİMA (boşken bile — "yeniden tara" oradan erişilebilir olmalı), hedef
  varsa yalnız gösterilecek bir seçenek varsa. Tek yazıcı sorunsuz çalışıyorsa ekran susar.
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
 * cümlesi. Seçenek listesi hesaba GİRMİYOR — kaç satır çizileceği ağ taraması bitmeden bilinmiyor;
 * yer tutucu bilinmeyeni değil, her hâlde var olanı tutar (ölçüm: tasarımın kutu kartı 128 dp, bu
 * türetme 133).
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
    AĞDA BULUNANLAR — ÖLÇÜM, VARSAYIM DEĞİL (v3:1022 "bağlı · Wi-Fi" · 30.08).

    ── VERİDE YOK, CİHAZDA VAR ─────────────────────────────────────────────────
    `warehouse_printer` bir ENVANTERDİR: adres, model, kâğıt boyu. "Şu an açık mı" bilgisi orada
    YOK ve olmamalı — bir yazıcının ayakta olup olmadığını ancak onunla aynı ağdaki cihaz bilir;
    sunucuya yazılmış bir "bağlı" bayrağı, kimsenin tazelemediği anda yalan söylemeye başlar.

    ── `null` SIFIR DEĞİL "ÖLÇEMEDİM" ──────────────────────────────────────────
    Boş dizi "taradım, kimse yok" demektir; `null` ise "tarayamadım" (modül yok ya da keşif düştü).
    İkisini aynı saymak, tarama yapamayan bir cihaza "ağda yazıcı yok" dedirtmek olurdu — depocu
    olmayan bir arızanın peşine düşerdi (CLAUDE §1).

    ── EŞLEŞME ADRESTEN DEĞİL SERİDEN ──────────────────────────────────────────
    `locatePrinter` tek kural: seri varsa ondan, yoksa adresten. Gerekçesi ölçülmüş bir arıza —
    künyesi `lib/print/printer-locate.ts`te.
  */
  const [found, setFound] = useState<PrinterChannel[] | null>(null);
  const [probing, setProbing] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  /** Tanıtma sürüyor — hangi ADRESİN satırında olduğuyla (keşif satırının kimliği adresidir). */
  const [registering, setRegistering] = useState<string | null>(null);
  /* Sonuç HANGİ İŞİN kartına ait olduğuyla saklanıyor: iki kart var ve ekranın altına düşen tek
     bir cümle, hangi yazıcının cevabı olduğunu söylemezdi. */
  const [notice, setNotice] = useState<{ purpose: PrinterPurpose; tone: 'ok' | 'error'; text: string } | null>(null);
  /**
   * **HANGİ İŞİN ÇEKMECESİ AÇIK** (kullanıcı kararı 05.09) — tanımlı kartın "yazıcı değiştir"i.
   *
   * Liste tanımlı kartın içinde durunca kurulum bittikten sonra bile ekran konuşmaya devam
   * ediyordu; tasarımın tanımlı kartı ise sessiz (v3:1015-1024). Kullanıcının önerisi: *"gözümüzün
   * gördüğü bir kart içerisinde tüm yazıcıların listelenmesi hoş olmaz, yazıcıları bir çekmecede
   * açalım."* Çekmece ayrıca listenin BOYUNU da çözüyor — kaydırılabilir bir katman, kartın
   * içindeki sabit yığından farklı olarak uzayabilir.
   */
  const [sheet, setSheet] = useState<PrinterPurpose | null>(null);

  const readPrinters = useCallback(async () => {
    const liste = await trackWarehouse(fetchPrinters());
    if (liste.error !== null) return null;
    setPrinters(liste.data.printers);
    return liste.data.printers;
  }, []);

  /**
   * **ESKİMİŞ ADRESLERİ ONAR** (05.09) — taramada seriden bulunan yazıcının adresi envanterdekiyle
   * uyuşmuyorsa sunucuyu tazeler.
   *
   * Sessiz ve kendiliğinden, çünkü depocuya sorulacak bir şey yok: yazıcı orada, adresi değişmiş.
   * Onarım burada duruyor çünkü tarama burada yapılıyor — ve tazelenmiş adres yalnız bu telefona
   * değil, envanteri okuyan HERKESE lazım (kutu kapanışında basan öteki telefonlar dahil).
   *
   * Başarısızlığı yutuluyor ve bu bilinçli: onarım bir kolaylıktır, ekranın işi değil. Yazılamazsa
   * bu telefon yine doğru adrese basar (`printTargetOf` canlı adresi kullanıyor) ve bir sonraki
   * açılışta yeniden denenir.
   */
  const healAddresses = useCallback(
    async (rows: readonly BoxPrinterContract[], bulunan: readonly PrinterChannel[]) => {
      const eskiyen = rows.flatMap((row) => {
        const canli = locatePrinter(row, bulunan);
        return canli !== null && canli.address !== row.address && row.serialNumber !== null
          ? [{ row, address: canli.address }]
          : [];
      });
      if (eskiyen.length === 0) return;

      const yazildi = await Promise.all(
        eskiyen.map(({ row, address }) =>
          registerPrinter({
            purpose: row.purpose,
            model: row.model,
            address,
            serialNumber: row.serialNumber,
            name: row.name,
          }).then((sonuc) => sonuc.error === null && sonuc.data.status === 'ok'),
        ),
      );
      if (yazildi.some(Boolean)) await readPrinters();
    },
    [readPrinters],
  );

  /**
   * Ağ keşfi. Modül yoksa HİÇ taranmaz ve sonuç `null` kalır: tarama yapamayan bir cihazın "yok"
   * demesi, ölçmediğini ölçmüş gibi söylemesidir.
   */
  const probe = useCallback(
    async (rows: readonly BoxPrinterContract[]) => {
      if (!hasPrinterNativeModule()) {
        setFound(null);
        return;
      }
      setProbing(true);
      try {
        const bulunan = await findNetworkPrinters();
        setFound(bulunan);
        await healAddresses(rows, bulunan);
      } catch {
        // Keşfin kendisi düştü — bu "yazıcı yok" DEĞİL "ölçemedim"dir (CLAUDE §1). Sessiz değil:
        // kartlar ölçümün yapılamadığını yazıyor.
        setFound(null);
      } finally {
        setProbing(false);
      }
    },
    [healAddresses],
  );

  const load = useCallback(async () => {
    setFailed(false);
    const [rows, secim] = await Promise.all([readPrinters(), readPrinterChoice()]);
    setChoice(secim);
    if (rows === null) {
      setFailed(true);
      setPrinters([]);
      return;
    }
    await probe(rows);
  }, [probe, readPrinters]);

  useEffect(() => {
    void load();
  }, [load]);

  const pick = useCallback(async (purpose: PrinterPurpose, id: string) => {
    await choosePrinter(purpose, id);
    setChoice(await readPrinterChoice());
  }, []);

  /** **YENİDEN TARA** — envanteri de tazeliyor: başka telefon bu arada yazıcı tanıtmış olabilir. */
  const rescan = useCallback(async () => {
    setNotice(null);
    const rows = await readPrinters();
    if (rows !== null) await probe(rows);
  }, [probe, readPrinters]);

  /**
   * **TANIT** (05.09) — ağda görülen yazıcıyı bu deponun envanterine yazar.
   *
   * Adres KEŞİFTEN geliyor, depocunun parmağından değil: yanlış IP'nin nasıl göründüğünü ölçtük
   * (envanterde `.91`, gerçek yazıcı `.169`, ekran "ağda görünmüyor"). Kâğıt boyu gövdede YOK —
   * sunucu modelden türetiyor ve tanınmayan modeli reddediyor.
   *
   * İkinci dokunuş EKLEMİYOR, adresi tazeliyor (`created:false`) ve cümle bunu söylüyor: depocu
   * dokunuşunun ne yaptığını görmeli.
   */
  const introduce = useCallback(
    async (purpose: PrinterPurpose, channel: PrinterChannel) => {
      setNotice(null);
      setRegistering(channel.address);
      try {
        const sonuc = await registerPrinter({
          purpose,
          model: channel.modelName,
          address: channel.address,
          serialNumber: channel.serialNumber,
        });
        if (sonuc.error !== null) {
          setNotice({ purpose, tone: 'error', text: fillCopy(t.printers.discover.failed, { error: sonuc.error }) });
          return;
        }
        if (sonuc.data.status === 'unsupported_model') {
          setNotice({
            purpose,
            tone: 'error',
            text: fillCopy(t.printers.discover.unsupported, { model: sonuc.data.model }),
          });
          return;
        }
        setNotice({
          purpose,
          tone: 'ok',
          text: sonuc.data.created
            ? fillCopy(t.printers.discover.registered, { name: sonuc.data.printer.name })
            : fillCopy(t.printers.discover.refreshed, {
                name: sonuc.data.printer.name,
                address: sonuc.data.printer.address,
              }),
        });
        await readPrinters();
      } finally {
        setRegistering(null);
      }
    },
    [readPrinters],
  );

  /**
   * **TEST BAS** (v3:1023) — sunucunun ürettiği ÖRNEK etiketi kartın hedef yazıcısına basar.
   *
   * ── NEDEN GERÇEK ŞABLON ─────────────────────────────────────────────────────
   * Basım hattında paketlenmiş bir test deseni var (`printNeedleTest`) ama o başka bir soruyu
   * cevaplıyor: "SDK bu yazıcıya bir görüntü basabiliyor mu" (23.5 iğne deneyi). Ayarlar
   * ekranının sorusu daha dar: *"seçtiğim yazıcıdan BİZİM etiketimiz doğru çıkıyor mu"* — kâğıt
   * boyu tutuyor mu, QR okunuyor mu, yazı kesiliyor mu. Bunu ancak gerçek şablon gösterir.
   *
   * ── ADRES ENVANTERDEN DEĞİL, ÖLÇÜMDEN ───────────────────────────────────────
   * Hedef `printTargetOf` ile çözülüyor: taramada bulunduysa GÜNCEL adres. Envanterdeki adres
   * eskimişse test onun yüzünden düşmemeli — testin sorusu kâğıt, adres değil.
   *
   * ── HATA YUTULMAZ, CÜMLEYE ÇEVRİLİR ─────────────────────────────────────────
   * SDK reddi (yanlış kâğıt boyu, ulaşılamayan adres) testin VERİSİDİR: "basılamadı" demek
   * yetmez, hangi sebep olduğu ekranda durmalı — kâğıt kararı fizikseldir ve kod onu çözemez.
   */
  const testPrint = useCallback(
    async (purpose: PrinterPurpose, printer: BoxPrinterContract, bulunan: readonly PrinterChannel[]) => {
      setNotice(null);
      setTesting(printer.id);
      try {
        const fileUri = await downloadSampleLabelPng(printer.id);
        await printLabel(fileUri, printTargetOf(printer, bulunan));
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
    },
    [],
  );

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

  /* Çekmecenin işi ayrı bir ad: `sheet` durumun kendisi, bu onun okunur hâli — JSX içinde
     `sheet!` yazmamak için (kesin-değil işareti, tip daraltmasının yerini tutmaz). */
  const sheetPurpose = sheet;

  return (
    <View style={styles.screen} testID="warehouse-printers">
      {/* KABUK DAVRANIŞLARI TEK KAPIDAN (21.178): kap hem yapışkan mikro başlığı çizer hem
          kaydırma olayını kabuğa bağlar (alt çubuk gizlemesi de oradan besleniyor). Başlık
          KAYDIRICININ İÇİNDE: dışarıda kalsaydı mikro şerit inince altında asılı kalırdı. */}
      <OperationsScreenScroll
        title={t.printers.title}
        caption={operationsCopy.sections.warehouse.tab}
        contentContainerStyle={styles.list}
        testID="warehouse-printers-list"
      >
        <OperationsHeadBleed pad="5xl">{header}</OperationsHeadBleed>
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
          const bulunan = found ?? [];
          const durum: PrinterLink =
            hedef === null || found === null ? 'unknown' : locatePrinter(hedef, bulunan) === null ? 'offline' : 'online';
          const uyari = hedef === null;
          const sonuc = notice !== null && notice.purpose === purpose ? notice : null;

          /* Ağda görülen ama BU İŞ için envanterde olmayanlar — tanıtılacak olanlar. Aynı fiziksel
             yazıcı öteki işte kayıtlı olabilir ve burada yine yeni sayılır: kâğıt değiştirilerek
             ikinci işe de bakabilir (0054'ün kısmi unique indeksi `purpose`u içeriyor). */
          const yeniler = bulunan.filter((channel) => !adaylar.some((p) => locatePrinter(p, [channel]) !== null));

          return (
            <OperationsSurface
              key={purpose}
              tone="panel"
              padding="lg"
              style={[styles.card, uyari ? styles.cardUnset : null]}
              testID={`warehouse-printers-${purpose}`}
            >
              <Text style={[styles.eyebrow, uyari ? styles.eyebrowUnset : null]}>{t.printers.purpose[purpose]}</Text>
              {/* İKİ KAVRAM KARTIN ÜSTÜNDE İZAH EDİLİYOR (kullanıcı isteği 06.09: *"kargo
                  etiketiyle kutu etiketinin ne anlama geldiği arayüzde izah edilebilir olsun"*).
                  Karışma gerçek ve bedeli fiziksel: "kargo" bir TAŞIYICI ŞİRKETİN etiketi, "kutu
                  etiketi" bizim kendi kutumuzun künyesi. Yazıcı seçen kişi hangi kâğıdı hangi
                  makineye bağladığını bu iki cümleden okuyor — üstbaşlık ("KARGO ETİKETİ") tek
                  başına ikisini ayırt ettirmiyordu. */}
              <Text style={styles.explain}>{t.printers.explain[purpose]}</Text>

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
                    onPress={() => void testPrint(purpose, hedef, bulunan)}
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

              {/* HİÇ ADAY YOKSA yön: eskiden "Depolar ekranından tanımlanır" diyordu ve depocuyu
                  ulaşamayacağı bir yüzeye yolluyordu (ölçüldü 05.09). Artık aşağıdaki listeyi
                  gösteriyor. */}
              {adaylar.length === 0 ? <Text style={styles.define}>{t.printers.define}</Text> : null}

              {sonuc === null ? null : (
                <Text
                  style={[styles.result, sonuc.tone === 'ok' ? styles.resultOk : styles.resultError]}
                  accessibilityRole="alert"
                  testID={`warehouse-printers-notice-${purpose}`}
                >
                  {sonuc.text}
                </Text>
              )}

              {/* LİSTE YALNIZ TANIMSIZ KARTTA (tasarımın kargo kartı, v3:1031-1038 · kullanıcı
                  bulgusu 05.09). TANIMLI kart tasarımda SESSİZDİR: ikon, ad, "bağlı · Wi-Fi",
                  "test bas" ve sonuç cümlesi — altında liste yok. Kod bir ara tanımlı kartta da
                  liste çiziyordu (ağda tanıtılmamış yazıcı varsa) ve kurulum bittikten sonra bile
                  ekran konuşmaya devam ediyordu. Değiştirmenin yolu kapanmadı, ÇEKMECEYE taşındı:
                  nadir yapılan iş, dinlenme hâlini kirletmez. */}
              {uyari ? (
                <PrinterOptionList
                  candidates={adaylar}
                  target={hedef}
                  discovered={yeniler}
                  scanned={found !== null}
                  probing={probing}
                  registering={registering}
                  onPick={(id) => void pick(purpose, id)}
                  onIntroduce={(channel) => void introduce(purpose, channel)}
                  onRescan={() => void rescan()}
                  testID={`warehouse-printers-options-${purpose}`}
                />
              ) : (
                <PressableSurface
                  onPress={() => setSheet(purpose)}
                  feedback="opacity"
                  compact
                  accessibilityLabel={t.printers.discover.change}
                  testID={`warehouse-printers-change-${purpose}`}
                >
                  <Text style={styles.change}>{t.printers.discover.change}</Text>
                </PressableSurface>
              )}

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
      </OperationsScreenScroll>

      {/* DEĞİŞTİRME ÇEKMECESİ — aynı liste, ikinci host (kullanıcı kararı 05.09). Tanımlı kartın
          dinlenme hâli sessiz kalıyor; yazıcıyı değiştirmek ya da ikinci bir yazıcı tanıtmak nadir
          bir iş ve nadir iş, sık görülen yüzeyi kirletmez. Liste uzasa da burada kaydırılıyor —
          kartın içindeki sabit yığın uzayamazdı. */}
      <BottomSheet
        visible={sheet !== null}
        title={sheetPurpose === null ? '' : fillCopy(t.printers.discover.sheetTitle, { purpose: t.printers.purpose[sheetPurpose] })}
        onClose={() => setSheet(null)}
        testID="warehouse-printers-sheet"
      >
        {sheetPurpose === null ? null : (
          <PrinterOptionList
            candidates={printers.filter((p) => p.purpose === sheetPurpose)}
            target={resolvePrinter(printers, sheetPurpose, choice)}
            discovered={(found ?? []).filter(
              (channel) =>
                !printers.some((p) => p.purpose === sheetPurpose && locatePrinter(p, [channel]) !== null),
            )}
            scanned={found !== null}
            probing={probing}
            registering={registering}
            onPick={(id) => void pick(sheetPurpose, id)}
            onIntroduce={(channel) => void introduce(sheetPurpose, channel)}
            onRescan={() => void rescan()}
            testID="warehouse-printers-sheet-options"
          />
        )}
      </BottomSheet>
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
  /** İki kavramın izahı — üstbaşlığın hemen altında, dipnot sesiyle (kartın konusu değil, tarifi). */
  explain: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['tab-inactive'],
    marginTop: -operationsTheme.space.xs,
  },
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
  /** Test/tanıtma sonucu — kartın İÇİNDE, hedef satırının hemen altında. */
  result: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
  },
  resultOk: { color: operationsTheme.colors['olive-dark'] },
  resultError: { color: operationsTheme.colors.terracotta },
  /* Zemin/kenar/yarıçap `OperationsSurface tone="card"`ten (kutunun İÇİNDEKİ satır: beyaz +
     `sand-300` + bir kademe küçük yarıçap). Dolgu `none`, çünkü şablonun satırı yüksekliğiyle
     tarif ediliyor (48) — dikey dolguyla değil. */
  /** "yazıcı değiştir" — çekmeceyi açan metin eylemi; kartın sessizliğini bozmayan tek satır. */
  change: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['olive-dark'],
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
