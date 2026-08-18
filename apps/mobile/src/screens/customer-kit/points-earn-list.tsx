import type { LocalizedCopy } from '@lezzet/i18n';
import type { MePointsEarnWayKey } from '@lezzet/types';
import type { ReactElement } from 'react';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon } from '@/components/ui/icon';
import { TextAction } from '@/components/ui/text-action';
import type { PointsRules } from '@/lib/api/points';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { CustomerIcon } from './customer-icon';
import messages from './points-earn-messages.json';
import { formatCompactEuro } from '@lezzet/helper';

/*
  PUAN KAZANMA YOLLARININ ANLATIMI — ÜÇ YÜZEYİN ORTAK BİLEŞENİ (kullanıcı kararı 12.08).

  Tüketenler: onboarding'in son adımı (misafir, düğmesiz) · hesap ekranının puan kartı (bakiye
  sıfırken, düğmeli) · hesaptan açılan "Nasıl puan kazanırım?" çekmecesi (her zaman, düğmeli).

  ── NEDEN TEK BİLEŞEN ───────────────────────────────────────────────────────
  Üçü de AYNI programı anlatıyor. Ayrı ayrı yazılsalardı üç metin kümesi doğardı ve bir ödül
  değiştiğinde biri güncellenip ötekiler unutulurdu — üç yüzey aynı sisteme üç farklı sayı söylerdi.
  Bu tam olarak `points-api.schema.ts`in "ekran sayı uydurmaz" kuralının ekran tarafındaki karşılığı.

  ── SAYI DA METİN DE TEK KAYNAKTAN ──────────────────────────────────────────
  Puanlar sunucudan gelir (`PointsRules.earnWays`, ayardan okunmuş); para karşılığı `points ×
  centValue` ile BURADA hesaplanır, çünkü aynı çarpım her satırda tekrarlanacak. Metinler bu
  klasörün kendi sözlüğünde (`points-earn-messages.json`) — ekrana özel ikinci bir sözlük açmak,
  aynı ödülü iki farklı cümleyle anlatmaktı.

  ── TANIMADIĞI ANAHTAR SESSİZCE DÜŞER ───────────────────────────────────────
  `Record` derlemede tam kapsam ister (sunucu yeni bir yol eklerse burası kırılır, eksik çizmez),
  ama çalışma zamanı süzgeci yine de duruyor: cihazdaki ESKİ sürüm yarının anahtarını tanımayacak
  ve o satırı çizmemek çökmekten iyidir (hesap ekranının 09.08'de öğrendiği ders).
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * Yolun görseli — her satır KENDİ ikonunu alır, hepsi aynı simgeyle çizilmez.
 *
 * Kullanıcı isteği 12.08: *"hem görsel olarak hem de metinsel olarak anlaşılır olsun."* Altı satırın
 * altısı da yıldızla çizilseydi liste bir renk lekesine dönerdi; ayrı geometriler, göz listeyi
 * okumadan önce "bunlar farklı şeyler" desin diye.
 *
 * Renk ödülün TÜRÜNÜ söylüyor: davet ödülleri terracotta (en yüksek basamak ve tek "başkasını
 * getir" hamlesi), kendi başına yapılanlar zeytin. Sayı zaten yanında yazıyor — renk onu tekrar
 * etmiyor, gruplandırıyor.
 */
function iconOf(key: MePointsEarnWayKey, size: number, invited: string, own: string): ReactElement {
  const icons: Record<MePointsEarnWayKey, ReactElement> = {
    referral: <Icon name="share" size={size} color={invited} />,
    neighbor: <Icon name="home" size={size} color={invited} />,
    review: <Icon name="orders" size={size} color={own} />,
    visit: <CustomerIcon name="check" size={size} color={own} />,
    feedback_purchase: <CustomerIcon name="star" size={size} color={own} />,
    feedback_candidate: <Icon name="search" size={size} color={own} />,
  };
  return icons[key];
}

/**
 * Bir yolun düğmesi VARSA — `Partial` ve bu bilinçli.
 *
 * `visit` ve `feedback_purchase` müşterinin gidebileceği bir yere işaret etmez: biri kendiliğinden
 * yazılır, öteki zaten teslim edilmiş bir siparişin ekranında yapılır. Onlara düğme koymak, basınca
 * hiçbir şey olmayan ya da alakasız bir ekrana atan bir yüzey demekti.
 */
export type PointsEarnActions = Partial<Record<MePointsEarnWayKey, () => void>>;

interface PointsEarnListProps {
  rules: PointsRules;
  /** Verilmezse liste düğmesiz çizilir (onboarding: müşterinin daha hesabı yok). */
  actions?: PointsEarnActions;
  /**
   * Çevrim kuralı (oran satırı + dipnotlar) çizilsin mi.
   *
   * **BAŞLIK TAŞIMAZ** ve bu cihazda ölçülmüş bir düzeltme (12.08): bileşen kendi başlığını
   * basıyordu ve çekmecede iki başlık üst üste bindi — kabuğun verdiği *"Puan kazanma yolları"*
   * ile listenin kendi *"Nasıl puan kazanılır"*ı. Başlık her zaman ÇAĞIRANIN işidir: onboarding'in
   * adım başlığı, çekmecenin kabuk başlığı, kartın kendi başlığı zaten var.
   */
  showRules?: boolean;
  testID?: string;
}

export function PointsEarnList({ rules, actions, showRules = false, testID }: PointsEarnListProps): ReactElement {
  const locale = useAppLocale();
  const t: Messages = messages[locale];
  const { theme } = useUnistyles();

  const known = (key: string): key is MePointsEarnWayKey => key in t.ways;

  return (
    <View style={styles.list} testID={testID}>
      {showRules ? (
        <Text style={styles.rate}>
          {t.rate
            .replace('{points}', String(rules.redeem.minimumPoints))
            .replace('{value}', formatCompactEuro(rules.redeem.valueCents, locale))}
        </Text>
      ) : null}

      {rules.earnWays.filter((way) => known(way.key)).map((way) => {
        const copy = t.ways[way.key];
        const action = actions?.[way.key];
        return (
          <View key={way.key} style={styles.row} testID={`points-earn-${way.key}`}>
            <View style={styles.icon}>{iconOf(way.key, theme.size.inlineIcon, theme.colors.terracotta, theme.colors['olive-dark'])}</View>
            {/* ── TEK SÜTUN: ÖDÜL BAŞLIĞIN ALTINDA (kullanıcı kararı 13.08) ──────────────
                Önceki kurgu sayıyı SAĞA, kendi sütununa koyuyordu. Kullanıcı cihazda görüp eledi:
                *"puan kalemlerinin açıklaması, başlığı, bunların dengesi ve yerleşim şekli çok
                hoşuma gitmedi."* Ölçülen sebep yapısaldı, zevk değil: sağ sütun üç ayrı kademede
                üç satır taşıyordu (puan · para · sıklık) ve başlıkla aynı yükseklikte yarışıyordu;
                soldaki açıklama de o yüzden dar bir şeride sıkışıp üç-dört satıra kırılıyordu.

                Sınır metni uzayınca (*"o güne çağırdığınız her komşu için · en fazla 3"*) kurgu
                tamamen bozuluyordu — sabit genişlikli bir sütun, uzunluğu bilinmeyen bir metni
                taşıyamaz. Yeni düzen tek sütun: başlık → ödül rozeti + sıklık → tam genişlikte
                açıklama. Ödül artık başlığın rakibi değil, ONUN CEVABI.

                Puan ile para AYNI rozette: kullanıcı isteği 12.08 ikisini birden istiyor (asıl
                birim puan, karşılığı para), ama alt alta iki kademe olmaları gerekmiyordu — tek
                satırda okunuyorlar.

                ── AYRAÇ `·` DEĞİL PARANTEZ (kullanıcı kararı 18.08) ──────────
                `+500 · 5,00 €` cihazda okunmuyordu: orta nokta iki EŞİT şeyi ayırır, oysa bunlar
                eşit değil — biri kazanılan birim, öteki onun karşılığı. Parantez o astlığı yazının
                kendisiyle söylüyor: `+500 (5 €)`. Kuruş da düştü, gerekçesi `compact-euro`
                künyesinde: kupon tam eurodur, `5,00` olmayan bir hassasiyet iddia ediyordu. */}
            <View style={styles.body}>
              <Text style={styles.title}>{copy.title}</Text>
              <View style={styles.rewardLine}>
                <Text style={styles.rewardBadge}>
                  +{way.points} ({formatCompactEuro(way.points * rules.centValue, locale)})
                </Text>
                {/* `{max}` YALNIZ komşu satırında geçiyor ama değişim koşulsuz uygulanıyor: bir gün
                    başka bir satır da sınır taşırsa metin çalışır, taşımayanda `replace` hiçbir şey
                    yapmaz. Koşullu yazsaydık "hangi satır hangi yer tutucuyu bilir" diye ikinci bir
                    eşleme doğardı. */}
                <Text style={styles.cadence}>{copy.cadence.replace('{max}', String(rules.neighborMaxUses))}</Text>
              </View>
              <Text style={styles.description}>{copy.body}</Text>
              {action === undefined || !('cta' in copy) ? null : (
                <TextAction label={copy.cta} onPress={action} testID={`points-earn-${way.key}-cta`} />
              )}
            </View>
          </View>
        );
      })}

      {showRules ? (
        <View style={styles.footnotes}>
          <Text style={styles.footnote}>
            {t.footnote
              .replace('{threshold}', String(rules.redeem.minimumPoints))
              .replace('{value}', formatCompactEuro(rules.redeem.valueCents, locale))}
          </Text>
          {/* Davet ödülünün BEKLEMESİ burada söylenir (karar seti 3): puan davet anında değil,
              davet edilenin PARASI alındığında yazılır. Söylenmezse müşteri "paylaştım, puan
              gelmedi" diye okur — motorun doğru davranışı, ekranın eksikliği yüzünden arıza
              gibi görünürdü. */}
          <Text style={styles.footnote}>{t.paidNote}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: { gap: theme.space['2xl'] },
  /* ── KADEME: İÇERİK 14'ÜN ALTINA İNMEZ (görev 21.38 · kullanıcı bulgusu 13.08) ──────────
     Bu dosya doğduğunda başlık ve rozet `control` (13,5) durağındaydı ve açıklama `body-sm`
     (14) — yani **başlık açıklamasından KÜÇÜKTÜ**. Ters kademe cihazda "fontlar küçük" diye
     görülüyor ve sebebi ölçülebilir: `control` bir DÜĞME/SÜZGEÇ durağıdır (kitin sözlüğünde
     "süzgeç ve sıralama düğmesi"), okunacak metnin değil.

     Yeni merdiven: satır başlığı ve ödül rozeti `body` (15) · açıklama ve koşul `body-sm` (14) ·
     dipnot `body-sm` (14). Hiyerarşi artık BOYUTLA değil ağırlık ve renkle kuruluyor — 21.38'in
     hükmü tam olarak buydu: müşterinin karar için okuduğu metin 14'ün altına inmez. */
  rate: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.terracotta,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.space.lg,
  },
  icon: { paddingTop: theme.space['2xs'] },
  body: { flex: 1, gap: theme.space['2xs'] },
  title: {
    fontFamily: theme.font.body[theme.text['control--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors.ink,
  },
  /* İçerik metni `body-sm` (14) — `helper` DEĞİL: müşteri ödülün kuralını buradan okuyor, bu
     yardımcı bir ipucu değil ekranın asıl içeriği (görev 21.38'in ölçtüğü merdiven). */
  description: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  /* Ödül satırı: rozet + sıklık YAN YANA ama SARAN (`wrap`) — sıklık metni uzunsa (komşu sınırı)
     rozetin altına geçer, rozeti daraltmaz. Sabit genişlik verilmiyor: uzunluğu bilinmeyen bir
     metne kutu biçmek, eski kurgunun tam olarak düştüğü yerdi. */
  rewardLine: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: theme.space.md,
    marginTop: theme.space['2xs'],
    marginBottom: theme.space['2xs'],
  },
  /* Rozet — ödülün KENDİSİ, başlığın rakibi değil cevabı. Kartın zemininden ayrılsın diye kum
     dolgu; `overflow:hidden` yarıçapın Android'de kesmesi için (kitin fiyat rozetiyle aynı desen). */
  rewardBadge: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.body,
    color: theme.colors['olive-dark'],
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.badge,
    paddingVertical: theme.space.xs,
    paddingHorizontal: theme.space.lg,
    overflow: 'hidden',
  },
  /* Sıklık — rozetin YANINDA ve sessiz: ödülün kendisi değil, KOŞULU. `flex: 1` YOK (onboarding'de
     12.08'de ölçülen tuzak: dikey kapta yüksekliği sıfıra düşürüyor); saran satırda genişliği
     zaten içeriği belirliyor. */
  /* Sıklık `note` (13) DEĞİL `body-sm` (14): burada yazan şey bir süsleme değil ödülün KOŞULU —
     "her üründe bir kez", "o güne çağırdığınız her komşu için · en fazla 3". Müşteri kaç kez
     kazanacağını buradan okuyor, yani 21.38'in "karar için okunan metin" tanımına giriyor.
     Rozetten ayrışması boyutla değil renkle: sessiz ton, aynı kademe. */
  cadence: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
  footnotes: { gap: theme.space.md },
  /* Dipnot da `body-sm`: ikisi de KURAL taşıyor — çevrim eşiği ve "ödül ödeme alınınca yazılır".
     İkincisi olmadan müşteri "paylaştım, puan gelmedi" diye okur; kuralı 13 pikselde saklamak,
     onu söylememeye yakın durur. */
  footnote: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text['body-sm'],
    lineHeight: theme.text['body-sm'] * theme.text['lead--line-height'],
    color: theme.colors.muted,
  },
}));
