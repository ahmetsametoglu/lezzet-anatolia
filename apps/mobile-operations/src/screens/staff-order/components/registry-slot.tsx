import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StaffCustomerOption } from '@lezzet/types';

import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from '../copy';
import { customerBadgeOf } from '../staff-order-format';
import type { RegistryState } from '../use-new-customer.hook';

/*
  Yeni kaydın resmî kayıt kutusu: SIRET tamamlanmadan da yeri ayrılmıştır ve her hâlde aynı boydadır; unvan gelince altındaki alanlar
  kaymaz. Aynı SIRET'le kayıt varsa kutu o kaydı seçtirir.
*/

const c = t.newCustomer;

interface RegistrySlotProps {
  registry: RegistryState;
  duplicate: { key: 'email' | 'siret'; existing: StaffCustomerOption } | null;
  onPickExisting: (customer: StaffCustomerOption) => void;
}

export function RegistrySlot({ registry, duplicate, onPickExisting }: RegistrySlotProps) {
  if (duplicate !== null) {
    const existing = duplicate.existing;
    return (
      <PressableSurface
        onPress={() => onPickExisting(existing)}
        feedback="scale"
        style={[styles.slot, styles.dup]}
        accessibilityLabel={`${c.dupTitle} ${existing.name}`}
        testID="staff-order-new-customer-dup"
      >
        <Text style={styles.reason}>{duplicate.key === 'email' ? c.dupEmailTitle : c.dupTitle}</Text>
        <Text style={styles.title} numberOfLines={1}>
          {`${existing.name} · ${customerBadgeOf(existing).label}`}
        </Text>
        <Text style={styles.link}>{c.dupPick}</Text>
      </PressableSurface>
    );
  }
  if (registry.kind === 'ready' && registry.lookup.registry.status === 'found') {
    const company = registry.lookup.registry.company;
    return (
      <View style={[styles.slot, styles.found]} testID="staff-order-new-customer-registry">
        <Text style={styles.legal} numberOfLines={1}>
          {company.legalName}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {`${company.line1}, ${company.postalCode} ${company.city}`}
        </Text>
        <Text style={company.isActive === false ? styles.reason : styles.ok}>
          {company.isActive === false ? c.slotClosed : c.slotActive}
        </Text>
      </View>
    );
  }
  const [title, hint, warn] =
    registry.kind === 'loading'
      ? [c.slotLoading, '', false]
      : registry.kind === 'failed' || (registry.kind === 'ready' && registry.lookup.registry.status === 'unavailable')
        ? [c.slotUnavailable, c.slotUnavailableHint, false]
        : registry.kind === 'ready'
          ? [c.slotNotFound, c.slotNotFoundHint, true]
          : [c.slotTitle, c.slotHint, false];
  return (
    <View style={styles.slot} testID="staff-order-new-customer-registry">
      <Text style={warn ? styles.reason : styles.sub} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.hint} numberOfLines={2}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    height: operationsTheme.size.controlAmount + operationsTheme.space['3xl'],
    justifyContent: 'center',
    gap: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.xl,
    borderWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors.panel,
  },
  found: { borderStyle: 'solid', borderColor: operationsTheme.colors['olive-line'], backgroundColor: operationsTheme.colors.card },
  dup: {
    borderStyle: 'solid',
    borderColor: operationsTheme.colors['terracotta-line'],
    backgroundColor: operationsTheme.colors['terracotta-bg'],
  },
  legal: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  title: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  sub: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta, color: operationsTheme.colors.muted },
  hint: { fontFamily: operationsTheme.font.body[400], fontSize: operationsTheme.text.meta, color: operationsTheme.colors['tab-inactive'] },
  ok: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['olive-dark'],
  },
  reason: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.terracotta,
  },
  link: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.olive,
  },
});
