import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenChrome } from '@/components/operations/screen-scroll';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy } from './copy';
import { DeliveryBoxesStep } from './components/delivery-boxes-step';
import { DeliveryCodeStep } from './components/delivery-code-step';
import { DeliveryCollectionStep } from './components/delivery-collection-step';
import { DeliveryGoodsStep } from './components/delivery-goods-step';
import { DeliveryOutcome } from './components/delivery-outcome';
import { DeliveryStopInfo } from './components/delivery-stop-info';
import { useDelivery } from './use-delivery.hook';

/* Kurye teslim ekranı yalnız düzeni kurar; adımlar `components/` altında, mantık `use-delivery.hook.ts`tedir. */

const t = courierCopy;

/* İlk yük iskeleti yalnız açılış bloklarını tutar, çünkü görünmeyen bloğun yerini tutmak zıplamayı önlemez. */
const DELIVERY_SKELETON = { address: 46, contacts: 44, section: 110 } as const;

export function CourierDeliveryScreen({ orderId }: { orderId: string }) {
  const router = useRouter();
  const delivery = useDelivery(orderId);
  const stop = delivery.stop;

  /* İş bitince listeye dönülür, çünkü sonuç toast'ta görünür ve sonuç ekranında kalmak kuryeye her durakta fazladan iki dokunuş yaptırıyordu. */
  useEffect(() => {
    if (delivery.finished) router.back();
  }, [delivery.finished, router]);

  if (delivery.status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-delivery">
        <OperationsStackHeader title={t.delivery.loading} onBack={() => router.back()} backLabel={t.delivery.back} />
        {/* İlk yükte iskelet çizilir, halka değil, çünkü halka yerleşimi tutmaz. */}
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[DELIVERY_SKELETON.address, DELIVERY_SKELETON.contacts, DELIVERY_SKELETON.section]}
            label={t.delivery.loading}
            testID="courier-delivery-loading"
          />
        </View>
      </View>
    );
  }

  if (delivery.status === 'missing' || stop === null) {
    return (
      <View style={styles.screen} testID="courier-delivery">
        <OperationsStackHeader
          title={t.delivery.notFound.title}
          onBack={() => router.back()}
          backLabel={t.delivery.back}
        />
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="error"
            title={t.delivery.notFound.title}
            description={t.delivery.notFound.body}
            retry={{ label: t.delivery.notFound.retry, onPress: delivery.reload }}
            testID="courier-delivery-missing"
          />
        </View>
      </View>
    );
  }

  const boxesLeft = delivery.boxes.length - delivery.scannedBoxCount;
  /* Kutular verilmeden sonraki adımlar kilitlidir, çünkü verilmemiş malın parasını almak teslim edilmemiş malın kaydını yazmaktır. */
  const stepsLocked = boxesLeft > 0;
  /* Adım numarası kutuya göre kayar: kutulu durakta kutular birinci adımdır. */
  const stepNo = (n: number): number => (delivery.boxes.length === 0 ? n : n + 1);
  /* Kapı kodu kutulardan hemen sonra sorulur, çünkü kod malı teslim alan kişinin kanıtıdır; sonraki adımlar bir kayar. */
  const afterCode = (n: number): number => stepNo(n) + (delivery.doorCodeAsked ? 1 : 0);

  return (
    <View style={styles.screen} testID="courier-delivery">
      {/* Başlık kaydırıcının içindedir, çünkü dışarıda kalsaydı mikro başlık inince altında asılı kalırdı. */}
      <OperationsScreenChrome
        title={fillCopy(t.delivery.title, { n: String(delivery.order), total: String(delivery.total) })}
        caption={operationsCopy.sections.courier.tab}
      >
        {(bind) => (
          <FormScroll {...bind} contentContainerStyle={styles.body} testID="courier-delivery-body">
            <OperationsHeadBleed pad="6xl">
              <OperationsStackHeader
                title={fillCopy(t.delivery.title, { n: String(delivery.order), total: String(delivery.total) })}
                subtitle={fillCopy(t.delivery.subtitle, { ref: stop.referenceNo ?? '—', n: String(stop.attempts + 1) })}
                onBack={() => router.back()}
                backLabel={t.delivery.back}
                // Kanal rozeti başlık satırındadır, çünkü kanal durağın kimliğidir ve kurye ona kapıya varmadan bakar.
                right={
                  <Text style={styles.channelTag} testID={`courier-delivery-${stop.channel}`}>
                    {t.channel[stop.channel]}
                  </Text>
                }
                testID="courier-delivery-header"
              />
            </OperationsHeadBleed>
            <DeliveryStopInfo stop={stop} />
            <DeliveryBoxesStep delivery={delivery} boxesLeft={boxesLeft} />
            {delivery.doorCodeAsked ? <DeliveryCodeStep delivery={delivery} n={stepNo(1)} locked={stepsLocked} /> : null}
            <DeliveryGoodsStep delivery={delivery} n={afterCode(1)} locked={stepsLocked} />
            <DeliveryCollectionStep delivery={delivery} n={afterCode(2)} locked={stepsLocked} />
          </FormScroll>
        )}
      </OperationsScreenChrome>
      <DeliveryOutcome delivery={delivery} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /** Yer tutucu gerçek blokların başlayacağı yerde başlar; dolgu `body` ile aynı. */
  skeleton: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space.lg,
  },
  block: { paddingHorizontal: operationsTheme.space['6xl'] },
  body: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['6xl'],
    gap: operationsTheme.space['2xl'],
  },
  channelTag: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.badge,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.ink,
  },
});
