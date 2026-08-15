import type { LocalizedCopy } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { StyleSheet } from 'react-native-unistyles';

import { useAppLocale } from '@/lib/i18n/app-locale';
import messages from './points-award-messages.json';

/*
  PUAN KAZANIMININ SONUCU — HER KAZANMA ANININ ORTAK BLOĞU (kullanıcı isteği 15.08).

  Kullanıcının cümlesi tek satırdı ve iki soru soruyordu: *"ne kadar kazandı, sonra mevcut puanın ne
  olduğu — her puan kazanma durumunun sonucunda aynı sayfayı göstermek lazım."*

  ── NEDEN TEK BİLEŞEN ───────────────────────────────────────────────────────
  Ölçüldü 15.08: iki ayrı sonuç ekranı vardı ve İKİSİ AYNI ŞEYİ FARKLI SÖYLÜYORDU. Geri bildirim
  daveti üç satır yazıyordu (kazanılan · not · toplam); keşif turu tek bir hap çipe *"+N puan
  kazandınız"* yazıp toplamı hiç söylemiyordu. Aynı sistemin iki ödülü, iki ayrı biçim, iki ayrı
  metin kümesi — biri değiştiğinde ötekinin unutulacağı klasik ikilik (`points-earn-list.tsx`
  künyesindeki aynı gerekçe: üç yüzey aynı programı anlatıyorsa metin de sayı da tek yerden gelir).

  Kazanan biçim geri bildirimdekiydi ve bu bir zevk kararı değil: kullanıcı onu üç tur döndürerek
  onayladı (15.08 — kutu kalktı, ölçek büyüdü, işaret kalpten `✦`e döndü).

  ── SAYFA EKRANIN ORTASINDA DURUR — BU BİR TASARIM DESENİ (kullanıcı kararı 15.08) ──
  Kullanıcının cümlesi: *"biz puan verdiğimiz zaman ekran ortalanıyor. Ekranın ortasında bir puan
  verme sayfası varken bu bir tasarım desenidir, bunu takip etmek lazım."*

  Yani ortalama bu bloğun bir SÜSÜ değil, puan kazanma anının kuralı: kazanımı gösteren ekran
  içeriği dikeyde ortalar (`flexGrow: 1` + `justifyContent: 'center'` — kaydırma kabında). Blok
  bunu KENDİ İÇİNDE yapamaz, çünkü ortalanan şey blok değil SAYFADIR (başlık, gövde, düğme dahil);
  her yüzey kendi kaydırma kabına uygular. Bugün ikisi de uyguluyor: geri bildirim sonucu
  (`contentFill`, yalnız sonuç aşamasında) ve keşif bitişi (`done`). Üçüncü bir kazanım ekranı
  açılırsa aynı kural onun için de geçerli.

  ── NOT SATIRI ARTIK BAĞLAMI TEKRARLAMIYOR ──────────────────────────────────
  Eskiden *"bu değerlendirme için hesabınıza eklendi"* yazıyordu. Ortak bileşende bağlam cümlesi
  taşımak, her yüzeye bir metin daha eklemek (yani ikiliği geri getirmek) olurdu. Bağlamı zaten
  bloğun ÜSTÜNDEKİ başlık söylüyor — *"Değerlendirmeniz için teşekkürler"* / *"Hepsi bu kadardı"*;
  not satırı yalnız ödülün nereye gittiğini söyler.
*/

type Messages = LocalizedCopy<typeof messages>;

/** Puan yıldızının geometrisi — künyesi `PointsSpark`ta. */
const SPARK_PATH =
  'M12 2c.6 5.2 4.2 8.8 9.4 9.4C16.2 12 12.6 16.2 12 22c-.6-5.8-4.2-10-9.4-10.6C7.8 10.8 11.4 7.2 12 2z';

interface PointsSparkProps {
  /** Kenar uzunluğu (dp) — kahraman ölçeği çağıranın kararı. */
  size: number;
  /** Dolgunun rengi — tema token'ı; ham hex YASAK (CLAUDE §3). */
  color: string;
}

/**
 * **Puan yıldızı (✦) — puanın görsel imzası** (kullanıcı kararı 15.08).
 *
 * Geri bildirim sonucunda kalp vardı ve kalp jenerikti: *"beğendim"* der, oysa anın konusu PUAN.
 * `✦` uygulamanın puan dilinin kendisi — hesap kartı `✦ 10`, kazanım satırı `✦ +15 puan` diye
 * yazıyor; işaret artık yanındaki metinle aynı şeyi söylüyor.
 *
 * Geometri: (12,12) merkezli dört uçlu yıldız; kenarlar merkeze doğru İÇBÜKEY, yani uçlar sivri.
 * Düz bir eşkenar dörtgen büyük ölçekte şekil değil LEKE gibi okunuyor.
 *
 * `customer-icon.tsx` sözlüğüne girmedi: oradaki `star` beş uçlu klasik yıldız ve başka bir işi var
 * (bildirim listesi · "Ürünleri değerlendir"). İkisi aynı ada iki geometri olurdu.
 */
export function PointsSpark({ size, color }: PointsSparkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={SPARK_PATH} fill={color} />
    </Svg>
  );
}

interface PointsAwardProps {
  /**
   * Bu anda GERÇEKTEN yazılan puan — motorun defterinden, ekranın çarpımından değil.
   *
   * `null` = ödülün sahibi yok (girişsiz tur) ve bu SIFIR DEĞİLDİR; `0` = motor gerçekten yazmadı
   * (günlük tavan · B2B · aynı kayda ikinci ödül). İkisinde de blok çizilmez: kazanılmayan bir
   * ödülün sonucu gösterilmez.
   */
  points: number | null;
  /**
   * Yazımdan SONRAKİ bakiye — *"şu ana kadar ne oldu"* sorusunun cevabı.
   *
   * `null` iken toplam satırı düşer, blok yine çizilir: kazanılan puan bilindiği hâlde bakiyenin
   * okunamadığı hâlde "Toplam ✦ 0" yazmak, bozuk ölçümü sağlıklı gibi okutmak olurdu (CLAUDE §1).
   */
  balance: number | null;
  /**
   * Toplam henüz OTURMADI mı — yolda, cevabı gelmemiş bir yazım var demektir.
   *
   * `true` iken sayı YAZILMAZ, bekleme SÖYLENİR. MB-16'nın ölçümü buydu (11.08): 4 oy verilmiş,
   * deftere 8 puan yazılmış, ekran "+6" demişti — sayı yanlış hesaplanmıyordu, HENÜZ TAMAMLANMAMIŞ
   * bir sayı tam gibi gösteriliyordu.
   */
  settling?: boolean;
  testID?: string;
}

/**
 * Kazanımın üç satırı — **kutu değil**, yalnız kendi aralığı olan bir küme.
 *
 * Kullanıcı kararı 15.08: *"kart görmek istemiyorum… sayfa ekran ile bütünleşik olsun, bölüm bölüm
 * görünmesini istemiyorum."* Hiyerarşi çerçeveyle değil ÖLÇEK ve BOŞLUKLA kuruluyor; öne çıkan şey
 * sayının kendi ölçeği (`h1-sm` — mobilin kahraman durağı) ve çevresindeki nefes.
 */
export function PointsAward({ points, balance, settling = false, testID }: PointsAwardProps) {
  const locale = useAppLocale();
  const t: Messages = messages[locale];

  if (settling) {
    return (
      <Text style={styles.settling} testID={testID === undefined ? undefined : `${testID}-settling`}>
        {t.settling}
      </Text>
    );
  }

  if (points === null || points <= 0) return null;

  return (
    <View style={styles.block} testID={testID}>
      <Text style={styles.value}>{t.points.replace('{points}', String(points))}</Text>
      <Text style={styles.note}>{t.note}</Text>
      {balance === null ? null : (
        <View style={styles.total}>
          <Text style={styles.totalLabel}>{t.total.replace('{points}', String(balance))}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: {
    alignItems: 'center',
    gap: theme.space.xs,
    marginTop: theme.space.lg,
  },
  value: {
    fontFamily: theme.font.display[theme.text['h1-sm--font-weight']],
    fontSize: theme.text['h1-sm'],
    color: theme.colors.terracotta,
  },
  note: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    color: theme.colors.body,
  },
  /** Toplam bir ROZET: kazanılan sayıdan bir kademe küçük, ama zeminiyle ondan ayrı bir gerçek. */
  total: {
    backgroundColor: theme.colors.olive,
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.sm,
    paddingHorizontal: theme.space['2xl'],
    marginTop: theme.space['2xs'],
    transform: [{ rotate: '2deg' }],
  },
  totalLabel: {
    fontFamily: theme.font.body[theme.text['badge--font-weight']],
    fontSize: theme.text.badge,
    color: theme.colors.card,
  },
  /** Bekleme cümlesi — sayının yerini tutar, o yüzden aynı dikey boşlukta ve aynı tonda. */
  settling: {
    fontFamily: theme.font.body[theme.text['field-label--font-weight']],
    fontSize: theme.text['field-label'],
    color: theme.colors.body,
    textAlign: 'center',
    marginTop: theme.space.lg,
  },
}));
