import { View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Skeleton } from '@/components/ui/skeleton';

/*
  HESABIM — AĞDAN BEKLEYEN İKİ BÖLÜMÜN SKELETON'I (kullanıcı isteği 10.08: "açılırken bazı
  bölümler geç geliyor, kullanıcının bilgilerini barındıran kısımlar").

  Hesap ekranı TEK PARÇA yüklenmiyor: kimlik kartı rota `/me`yi çözdükten sonra çiziliyor (yani
  ekran açıldığında zaten dolu), ama İKİ bölüm kendi çağrılarını bekliyor:
    · PUAN CÜZDANI (`GET /api/v1/me/points`) — bakiye · eşik · kuponlar,
    · ADRES DEFTERİ (`GET /api/v1/me/addresses`).
  İkisi de yüklenirken HİÇ ÇİZİLMİYORDU ve veri gelince ekranın ortasına giriyor, altındaki her
  şeyi aşağı itiyordu. Adres defterinde bir de yanlış cümle vardı: liste boş dizi olarak
  başladığı için "adresler yükleniyor" ile "hiç adresin yok" ayırt edilemiyordu — ekranın
  sessizce yanlış şey söylediği tek yer buydu (CLAUDE §1: ölçülemeyen değer sıfır değildir).

  İKİ AYRI BİLEŞEN, TEK EKRAN SKELETON'I DEĞİL: bölümler AYRI çağrılara bağlı ve ayrı anlarda
  doluyor. Tek bir tam ekran skeleton'ı, zaten hazır olan kimlik kartını ve menüyü de gizlerdi —
  eldeki bilgiyi saklamak, beklemeyi uzatmaktan kötüdür.

  ÖLÇÜLER SAYFANIN KENDİ STİLLERİNDEN; kartların kabuğu (zemin · köşe · dolgu · kesikli ayraç)
  GERÇEK çizilir, çünkü sabit yapı veriye bağlı değil. Her iki bileşen kendi `progressbar`ını
  taşır: ekranda aynı anda iki bekleme olabilir ve ekran okuyucu hangisinin sürdüğünü bilmeli.
*/

/** Adres satırı — kaç adres geleceği bilinmiyor; en az makul sayı (fazlası kaybolur, azı eklenir). */
const ADDRESS_SLOTS = [0, 1];

interface AccountSectionSkeletonProps {
  testID?: string;
}

/**
 * PUAN CÜZDANI KARTI — başlık + bakiye, altında tek açıklama satırı.
 *
 * Düğme ve "puan kazanma yolları" listesi ÇİZİLMEZ: hangisinin geleceği bakiyeye bağlı (sıfırsa
 * liste, değilse dönüştür düğmesi) ve ikisi çok farklı yükseklikte. Yanlış olanı çizmek, veri
 * gelince kartı büyütür ya da küçültürdü; ikisi de kaymadır ama küçülme daha kötüsüdür.
 */
export function AccountPointsSkeleton({ testID }: AccountSectionSkeletonProps) {
  const { theme } = useUnistyles();
  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  return (
    <View
      style={styles.card}
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
    >
      <View style={styles.headRow}>
        <Skeleton width="42%" height={line(theme.text['card-title-sm'])} tone="deep" />
        <Skeleton width="24%" height={line(theme.text['h2-sm'])} tone="deep" />
      </View>
      <Skeleton width="88%" height={line(theme.text.helper, theme.text['lead--line-height'])} tone="deep" />
    </View>
  );
}

/**
 * ADRES DEFTERİ — panelin başlığı ve "＋ Yeni adres ekle" bağlantısı sayfada KOŞULSUZ çizildiği
 * için burada yok; bu bileşen yalnız satırların yerini tutar (panelin İÇİNE girer).
 */
export function AccountAddressesSkeleton({ testID }: AccountSectionSkeletonProps) {
  const { theme } = useUnistyles();
  const line = (fontSize: number, ratio: number = theme.text['h1--line-height']): number => fontSize * ratio;

  return (
    <View testID={testID} accessible accessibilityRole="progressbar" accessibilityState={{ busy: true }}>
      {ADDRESS_SLOTS.map((slot) => (
        <View key={slot} style={slot > 0 ? styles.divider : undefined}>
          <View style={styles.addressRow}>
            <View style={styles.addressText}>
              {/* Etiket satırı (adres başlığı; varsayılan rozeti opsiyonel, çizilmez). */}
              <Skeleton width="46%" height={line(theme.text.note)} tone="deep" />
              <Skeleton width="76%" height={line(theme.text.helper)} tone="deep" />
            </View>
            {/* Sağdaki "Düzenle" bağlantısı — koşulsuz olan tek eylem ("Varsayılan yap" değil. */}
            <Skeleton width="18%" height={line(theme.text.control)} tone="deep" />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  /** Puan kartının kabuğu (`account-screen.pointsCard`). */
  card: {
    backgroundColor: theme.colors['sand-150'],
    borderRadius: theme.radius.card,
    padding: theme.space['3xl'],
    gap: theme.space.md,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: theme.space.lg,
  },

  /** Satır ayracı (`account-screen.settingsDivider`) — panelin kendi kesikli çizgisi. */
  divider: {
    borderTopWidth: theme.border.base,
    borderTopColor: theme.colors['sand-400'],
    borderStyle: 'dashed',
    paddingTop: theme.space.lg,
    marginTop: theme.space.xs,
  },
  /** Adres satırının düzeni (`address-card.card`). */
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.lg,
  },
  addressText: { flex: 1, gap: theme.space['2xs'] },
}));
