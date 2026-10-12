import { useState } from 'react';
import { Linking, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import { navigationLink } from '@lezzet/domain-core';

import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy as t } from '../copy';
import { StepNote, type DeliveryState } from './delivery-step';

interface DeliveryStopInfoProps {
  stop: NonNullable<DeliveryState['stop']>;
}

/** Adres ve kapıya varış eylemleri; telefon ya da WhatsApp verisi yoksa o düğme çizilmez, çünkü işe yaramayan düğme yanlış bir şey söyler. */
export function DeliveryStopInfo({ stop }: DeliveryStopInfoProps) {
  /** Navigasyon açılamadıysa sebebi yazılır, çünkü sessizce hiçbir şey yapmayan düğme sahada en kötüsüdür. */
  const [navFailed, setNavFailed] = useState(false);
  /** Kapıyı açan adresin alıcısıdır, hesabın sahibi değil. */
  const receiver = stop.recipient ?? stop.customerName;

  return (
    <>
      <View style={styles.addressBlock}>
        <Text style={styles.address}>{stop.address ?? t.day.stop.noAddress}</Text>
        <Text style={styles.addressDetail}>{`${receiver} · ${t.channel[stop.channel]}`}</Text>
        {/* Doğrulanmış ya da bilinmeyen kapı bir şey yazmaz, çünkü her durakta görünen satır kuryeyi gerçek uyarıyı okumamaya alıştırır. */}
        {stop.doorCheck === 'unverified' || stop.doorCheck === 'elsewhere' ? (
          <Text style={styles.doorCheck} testID={`courier-delivery-door-${stop.doorCheck}`}>
            {t.delivery.doorCheck[stop.doorCheck]}
          </Text>
        ) : null}
      </View>

      <View style={styles.contactRow}>
        {stop.address === null ? (
          <View style={[styles.contact, styles.contactDisabled]}>
            <Text style={styles.contactMuted}>{t.delivery.noNavigate}</Text>
          </View>
        ) : (
          <PressableSurface
            onPress={() => {
              const url = navigationLink({ address: stop.address });
              if (!url) return;
              setNavFailed(false);
              void Linking.openURL(url).catch(() => setNavFailed(true));
            }}
            feedback="scale"
            // Esneme `grow`dan gelir: stildeki `flex: 1` dış Pressable'a ulaşmaz ve dış kutu içeriğine büzülür.
            grow
            style={[styles.contact, styles.contactPrimary]}
            accessibilityLabel={t.delivery.navigate}
            testID="courier-delivery-navigate"
          >
            <Icon name="navigate" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.card} />
            <Text style={styles.contactPrimaryLabel}>{t.delivery.navigate}</Text>
          </PressableSurface>
        )}
        {/* Ara ve WhatsApp yalnız ikondur ki satırı asıl eylem kaplasın; ad ekran okuyucuya `accessibilityLabel` ile gider. */}
        {stop.phone === null ? null : (
          <PressableSurface
            onPress={() => void Linking.openURL(`tel:${stop.phone ?? ''}`)}
            feedback="scale"
            style={[styles.contactIcon, styles.contactOutline]}
            accessibilityLabel={t.delivery.call}
            testID="courier-delivery-call"
          >
            <Icon name="phone" size={operationsTheme.size.headerIcon} color={operationsTheme.colors.ink} />
          </PressableSurface>
        )}
        {stop.whatsAppLink === null ? null : (
          <PressableSurface
            onPress={() => void Linking.openURL(stop.whatsAppLink ?? '')}
            feedback="scale"
            style={[styles.contactIcon, styles.contactOutline]}
            accessibilityLabel={t.delivery.whatsApp}
            testID="courier-delivery-whatsapp"
          >
            <Icon name="whatsapp" size={operationsTheme.size.headerIcon} color={operationsTheme.colors['brand-whatsapp']} />
          </PressableSurface>
        )}
      </View>
      {navFailed ? (
        <StepNote tone="error" testID="courier-navigate-failed">
          {t.delivery.navigateFailed}
        </StepNote>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  addressBlock: { gap: operationsTheme.space['2xs'] },
  /** Adres gövde fontuyla yazılır: başlık değil kapıda okunacak veridir ve durak künyesiyle yarışmamalı. */
  address: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    lineHeight: operationsTheme.text.body * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },
  addressDetail: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.body,
  },
  /** Kapı doğrulaması adresin bir niteliğidir, ayrı bir uyarı değil: aynı punto, sessiz ton. */
  doorCheck: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  contactRow: { flexDirection: 'row', gap: operationsTheme.space.md },
  /** Navigasyon yatay ve sabit boylu, çünkü dikey dizilim düğmeyi yanındaki ikon kareleriyle hizasız bir karoya çeviriyordu. */
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: operationsTheme.space.md,
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
  },
  contactIcon: {
    width: operationsTheme.size.contactIcon,
    alignItems: 'center',
    justifyContent: 'center',
    height: operationsTheme.size.controlLg,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
  },
  contactPrimary: {
    backgroundColor: operationsTheme.colors.olive,
    borderColor: operationsTheme.colors.olive,
  },
  contactOutline: { borderColor: operationsTheme.colors['sand-500'] },
  contactDisabled: {
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['disabled-line'],
  },
  contactPrimaryLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.card,
  },
  contactMuted: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
    textAlign: 'center',
  },
});
