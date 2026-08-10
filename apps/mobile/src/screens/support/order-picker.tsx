import type { LocalizedCopy, Locale } from '@lezzet/i18n';
import { Text, View } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { LoadingState } from '@/components/ui/loading-state';
import { Note } from '@/components/ui/note';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { Skeleton } from '@/components/ui/skeleton';
import { TextAction } from '@/components/ui/text-action';
import { formatOrderDate } from '@/screens/orders/order-format';
import type { UseOrdersResult } from '@/screens/orders/use-orders.hook';
// Sözlük burada YALNIZ tip için okunuyor (metni ekran veriyor): çalışma zamanında ikinci bir JSON
// kopyası taşınmasın diye tip-yalnız import.
import type messages from './messages.json';

/*
  YENİ TALEBİN SİPARİŞ SEÇİCİSİ (v3 `vTalepNew` · `tn.orders`) — GERÇEK sipariş listesinden
  (`GET /api/v1/me/orders`) okur.

  ── LİSTEYİ KENDİ ÇEKMEZ, ÇEKMECEDEN ALIR (09.08) ───────────────────────────
  Eskiden okumayı bu komponent yapıyordu ve gerekçesi şuydu: liste yalnız "evet, bir siparişimle
  ilgili" denince gerekir. Gerekçe ARTIK GEÇERSİZ — çekmece kapsam sorusunu sormaya karar vermek
  için siparişin VAR OLUP OLMADIĞINI zaten bilmek zorunda (kullanıcı bulgusu 09.08: siparişi
  olmayana "evet" şıkkı gösterilip sonra boş liste denmesi). Okuma yukarı taşındı; burada ikinci
  kez okumak aynı sayfayı iki kez istemek olurdu.

  ── SAYFALAMA DÜĞMEYLE, SONSUZ KAYDIRMAYLA DEĞİL ────────────────────────────
  Sipariş sayısı sınırsız büyür, yani ilk sayfa listenin TAMAMI değildir (CLAUDE §1: sayfalayan
  okumanın tüketeni olmalı). Ama bu liste bir arşiv ekranı değil, formun içinde duran bir seçim
  adımı ve çevresinde form akıyor — iç içe kaydırma yerine "daha eski siparişler" düğmesi kondu.
  İmleç yine hook'ta, opak ve hiçbir yere yazılmıyor.
*/

type Messages = LocalizedCopy<typeof messages>;

/**
 * Bekleme skeleton'ı — üç sipariş satırı (v3 `hint-placeholder-count="3"`).
 *
 * YÜKSEKLİK YAZILMIYOR (10.08): eskiden `52` diye ham bir sayıydı ve satırın kendi dolgusundan
 * bağımsızdı — `orderRow` değiştiğinde sessizce yanlışa düşerdi. Skeleton artık satırın GERÇEK
 * kabuğunu kuruyor (`styles.orderRow`) ve içine iki çubuk koyuyor; yükseklik kendiliğinden çıkıyor.
 */
const SKELETON_SLOTS = [0, 1, 2];

interface OrderPickerProps {
  locale: Locale;
  t: Messages;
  /** Sipariş listesi — okuma ÇEKMECEDE, burada değil (künye). */
  orders: UseOrdersResult;
  /** Sipariş seçildi — akış forma geçer. */
  onPick: (reference: string) => void;
  /** Seçilecek sipariş yok / okunamadı — müşteri genel talebe düşer (aynı sorunun "hayır" şıkkı). */
  onGeneral: () => void;
}

export function OrderPicker({ locale, t, orders, onPick, onGeneral }: OrderPickerProps) {
  // Skeleton satır yüksekliklerini yazı kademelerinden türetir (aşağıdaki bekleme dalı).
  const { theme } = useUnistyles();

  if (orders.status === 'loading') {
    return (
      <View
        style={styles.block}
        testID="new-ticket-orders-loading"
        accessible
        accessibilityRole="progressbar"
        accessibilityState={{ busy: true }}
      >
        {SKELETON_SLOTS.map((slot) => (
          <View key={slot} style={styles.orderRow}>
            {/* Solda sipariş numarası, sağda tarih — satırın kendi düzeni. */}
            <Skeleton width="42%" height={theme.text.note * theme.text['h1--line-height']} tone="deep" />
            <Skeleton width="28%" height={theme.text.helper * theme.text['h1--line-height']} tone="deep" />
          </View>
        ))}
      </View>
    );
  }

  /* Misafir ve arıza AYRI cümleler ama aynı çıkış: siparişe bağlanamayan müşteri genel talep
     yazabilmeli — çıkışsız bir oda bırakmıyoruz. Oturum kapısını ekranın kendisi çizmiyor çünkü
     buraya gelen kişi zaten form dolduruyor; gönderim anında 401 gelirse orada söylenir. */
  if (orders.status !== 'ready') {
    return (
      <View style={styles.block} testID="new-ticket-orders-error">
        <Note description={orders.status === 'guest' ? t.new.errors.guest : t.new.order.error} tone="terracotta" />
        {orders.status === 'error' ? (
          <TextAction label={t.error.retry} onPress={orders.retry} tone="terracotta" testID="new-ticket-orders-retry" />
        ) : null}
        <SecondaryButton label={t.new.scope.no} onPress={onGeneral} testID="new-ticket-order-none" />
      </View>
    );
  }

  /* BOŞ LİSTE DALI YOK ve olmamalı: siparişi olmayan müşteriye kapsam sorusu hiç sorulmuyor, akış
     doğrudan genel talebe açılıyor (çekmecenin künyesi). Buraya gelen müşterinin elinde en az bir
     sipariş VAR — boş bir dal çizmek, artık olamayacak bir hâle bakım borcu ödemek olurdu. */
  return (
    <View style={styles.block} testID="new-ticket-orders">
      {orders.orders.map((order) => (
        <PressableSurface
          key={order.reference}
          onPress={() => onPick(order.reference)}
          feedback="opacity"
          style={styles.orderRow}
          accessibilityLabel={t.new.order.pick.replace('{reference}', order.reference)}
          testID={`new-ticket-order-${order.reference}`}
        >
          <Text style={styles.orderReference}>{order.reference}</Text>
          <Text style={styles.orderDate}>{formatOrderDate(order.placedAt, locale)}</Text>
        </PressableSurface>
      ))}

      {/* Kuyruk: yükleniyor · düştü · devamı var — üçü ayrı şey (liste ekranlarının aynı ayrımı). */}
      {orders.loadingMore ? (
        <LoadingState size="sm" label={t.list.loading} accessibilityLabel={t.list.loading} testID="new-ticket-orders-tail" />
      ) : orders.tailFailed ? (
        <TextAction label={t.list.tailRetry} onPress={orders.loadMore} tone="terracotta" testID="new-ticket-orders-tail-retry" />
      ) : orders.hasMore ? (
        <TextAction label={t.new.order.more} onPress={orders.loadMore} testID="new-ticket-orders-more" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  block: { gap: theme.space['2xl'] },
  body: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.note,
    lineHeight: theme.text.note * theme.text['lead--line-height'],
    color: theme.colors.body,
  },
  orderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors['sand-250'],
    borderRadius: theme.radius.card,
    paddingVertical: theme.space['2xl'],
    paddingHorizontal: theme.space['3xl'],
  },
  orderReference: {
    fontFamily: theme.font.body[theme.text['button--font-weight']],
    fontSize: theme.text.note,
    color: theme.colors.ink,
  },
  orderDate: {
    fontFamily: theme.font.body[400],
    fontSize: theme.text.helper,
    color: theme.colors.muted,
  },
}));
