import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { BoxPrinterContract } from '@lezzet/types';
import { defaultLabelSizeFor } from '@lezzet/domain-core';

import { OperationsSurface } from '@/components/operations/surface';
import { PressableSurface } from '@/components/ui/pressable-surface';
import type { PrinterChannel } from '@/lib/print/brother';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';

/*
  YAZICI SEÇENEKLERİ — İKİ HOSTU OLAN TEK LİSTE (05.09).

  ── NEDEN AYRI BİLEŞEN ──────────────────────────────────────────────────────
  Aynı liste iki yerde çiziliyor: TANIMSIZ kartın içinde (tasarımın kargo kartı, v3:1031-1038) ve
  TANIMLI kartın açtığı ÇEKMECEDE. İki ayrı kopya yazmak duplikasyon olurdu (CLAUDE §1) ve
  ikisinden biri bir gün ötekinden ayrılırdı — "tanıt" bir yerde çalışıp öteki yerde çalışmayan bir
  ekran, en zor bulunan arıza cinsidir.

  ── İKİ CİNS SATIR ──────────────────────────────────────────────────────────
  · envanterdeki aday → **seç** · seçili olan KOYU MÜREKKEP zeminde durur (v3:4523'ün kendi kuralı:
    `aktif ? {bg:#2f353a, fg:#f5f1e6}`) ve listede KALIR — cihazın kararı geri alınabilir olmalı.
  · ağda bulunan ama envanterde olmayan → **tanıt** · adı ve adresi tek satırda, orta noktayla
    ("QL-820NWB · 192.168.1.169") — tasarımın kendi deyimi ("Zebra ZD421 · rampa"). Adres gerekli:
    ağda aynı modelden iki cihaz olabilir ve model adı ikisini ayırmaz.

  ── KÂĞIDINI BİLMEDİĞİMİZ MODEL: SATIR DURUR, EYLEM YOK ─────────────────────
  Ağda etiket yazıcısı olmayan Brother cihazları da bulunabilir. Gizlemek depocuya "ağımdaki cihaz
  neden listede yok" dedirtirdi, dokundurmak kesin bir redde yollardı — satır duruyor, eylemin
  yerinde sebebi yazıyor. (Ölçüldü 05.09: SDK'nın kendi keşfi zaten süzüyor — ağdaki MFC-9330CDW
  listeye hiç girmedi. Bu dal yine de duruyor: süzgeç SDK'nın kararı, bizim garantimiz değil.)
*/

const t = warehouseCopy;

interface PrinterOptionListProps {
  /** Envanterdeki adaylar — bu işin yazıcıları. */
  candidates: readonly BoxPrinterContract[];
  /** Basımın hedefi (`resolvePrinter`) — listede işaretli duran satır. */
  target: BoxPrinterContract | null;
  /** Ağda görülen ama bu iş için envanterde OLMAYAN yazıcılar. */
  discovered: readonly PrinterChannel[];
  /** `null` = ağ TARANAMADI (modül yok / keşif düştü) — boş diziyle aynı şey değil (CLAUDE §1). */
  scanned: boolean;
  probing: boolean;
  /** Tanıtması süren satırın adresi. */
  registering: string | null;
  onPick: (printerId: string) => void;
  onIntroduce: (channel: PrinterChannel) => void;
  onRescan: () => void;
  testID: string;
}

export function PrinterOptionList({
  candidates,
  target,
  discovered,
  scanned,
  probing,
  registering,
  onPick,
  onIntroduce,
  onRescan,
  testID,
}: PrinterOptionListProps) {
  return (
    <View style={styles.options} testID={testID}>
      <View style={styles.optionsHead}>
        <Text style={styles.optionsTitle}>{t.printers.discover.title}</Text>
        {/* YENİDEN TARA — envanteri de tazeliyor: başka telefon bu arada yazıcı tanıtmış olabilir
            ve yalnız ağı taramak onu göstermezdi. */}
        <PressableSurface
          onPress={onRescan}
          disabled={probing}
          feedback="opacity"
          compact
          accessibilityLabel={t.printers.discover.rescan}
          testID={`${testID}-rescan`}
        >
          <Text style={styles.optionsAction}>
            {probing ? t.printers.discover.scanning : t.printers.discover.rescan}
          </Text>
        </PressableSurface>
      </View>

      {candidates.map((row) => {
        const secili = target !== null && target.id === row.id;
        return (
          <OperationsSurface
            key={row.id}
            tone="card"
            padding="none"
            onPress={() => onPick(row.id)}
            /* SEÇİLİLİK ADIN İÇİNDE: `OperationsSurface`in `selected` prop'u yok, yani
               `accessibilityState.selected` ekran okuyucuya ulaşmıyor — renk farkı da ulaşmaz.
               Bilgi kaybolmasın diye satırın adına yazılıyor. Kit boşluğu raporlandı. */
            accessibilityLabel={`${row.name} — ${secili ? t.printers.picked : t.printers.pick}`}
            style={[styles.option, secili ? styles.optionSelected : null]}
            testID={`warehouse-printers-option-${row.id}`}
          >
            <Text style={[styles.optionName, secili ? styles.optionNameSelected : null]}>{row.name}</Text>
            <Text style={[styles.optionAction, secili ? styles.optionActionSelected : null]}>
              {secili ? t.printers.picked : t.printers.pick}
            </Text>
          </OperationsSurface>
        );
      })}

      {discovered.map((channel) => {
        const kagit = defaultLabelSizeFor(channel.modelName);
        const anahtar = channel.serialNumber ?? channel.address;
        const satirTestID = `${testID}-new-${channel.address}`;
        const etiket = `${channel.modelName} · ${channel.address}`;
        const govde = (
          <>
            <Text style={styles.optionName}>{etiket}</Text>
            <Text style={[styles.optionAction, kagit === null ? null : styles.optionActionAdd]}>
              {kagit === null
                ? t.printers.discover.unknownPaper
                : registering === channel.address
                  ? t.printers.discover.adding
                  : t.printers.discover.add}
            </Text>
          </>
        );

        /* İki AYRI yüzey, koşullu tek yüzey DEĞİL: `OperationsSurface`in dokunulabilir biçimi
           `onPress`i ZORUNLU istiyor (kitin birleşim tipi) — `undefined` geçirmek dokunulamaz gibi
           görünen ama a11y'de düğme olarak duyurulan bir öğe üretirdi. */
        return kagit === null ? (
          <OperationsSurface
            key={anahtar}
            tone="card"
            padding="none"
            style={[styles.option, styles.optionMuted]}
            testID={satirTestID}
          >
            {govde}
          </OperationsSurface>
        ) : (
          <OperationsSurface
            key={anahtar}
            tone="card"
            padding="none"
            onPress={() => onIntroduce(channel)}
            accessibilityLabel={`${etiket} — ${t.printers.discover.add}`}
            style={styles.option}
            testID={satirTestID}
          >
            {govde}
          </OperationsSurface>
        );
      })}

      {/* BOŞ HÂL İKİYE AYRILIR: "taradım, kimse yok" ile "tarayamadım" ayrı cümleler — birincisi
          yazıcıyı aramaya, ikincisi derlemeye bakmaya yollar. */}
      {candidates.length === 0 && discovered.length === 0 && !probing ? (
        <Text style={styles.empty} testID={`${testID}-none`}>
          {scanned ? t.printers.discover.empty : t.printers.discover.unavailable}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /** SEÇENEK LİSTESİ (v3:1031) — `gap:8`. */
  options: { gap: operationsTheme.space.md },
  /** Listenin başlığı ve "yeniden tara" — üstbaşlığın tipografisi, kartınkiyle aynı aile. */
  optionsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  optionsTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  optionsAction: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['olive-dark'],
  },
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
  /* SEÇİLİ SATIR — tasarımın kendi kuralı (v3:4523): `aktif ? {bg:#2f353a, fg:#f5f1e6, bd:#2f353a}`,
     yani KOYU MÜREKKEP zemin + krem yazı. Kod 30.08'de zeytin çizmişti ve bu bir improvizasyondu —
     şablonun seçili hâli bütün ekranlarda aynı: dolu koyu kutu (kullanıcı bulgusu 05.09).
     `on-image` tam da bu durak: "koyu zemin üstünde krem metin" (token künyesi). */
  optionSelected: {
    borderColor: operationsTheme.colors.ink,
    backgroundColor: operationsTheme.colors.ink,
  },
  optionName: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.ink,
  },
  optionNameSelected: { color: operationsTheme.colors['on-image'] },
  optionAction: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  /* Koyu satırda `muted` (#8a8270) mürekkebin üstünde 3:1'e düşüyor. Şablon onu öyle çiziyor ama
     orada eylem sözcüğü "seç"ti — burada "seçili", yani satırın DURUMUNU söyleyen tek işaret;
     kaybolması bilgiyi kaybetmek olurdu. `sand-500` aynı aileden bir kademe açık. */
  optionActionSelected: { color: operationsTheme.colors['sand-500'] },
  /** "tanıt" bir EYLEM, "seç"ten farklı: envantere yazıyor. Zeytin, çünkü olumlu ve kalıcı. */
  optionActionAdd: { color: operationsTheme.colors['olive-dark'] },
  /** Dokunulamayan satır — zemin kartın kendi kumuna düşüyor, "burada eylem yok" demek için. */
  optionMuted: { backgroundColor: operationsTheme.colors['neutral-bg'] },
  empty: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
