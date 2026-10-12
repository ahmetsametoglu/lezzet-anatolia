import { useRouter } from 'expo-router';
import { Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { StaffCustomerOption } from '@lezzet/types';

import { OperationsStackHeader } from '@/components/operations/stack-header';
import { FormScroll } from '@lezzet/mobile-kit/src/components/ui/form-scroll';
import { TextField } from '@lezzet/mobile-kit/src/components/ui/text-field';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { staffOrderCopy as t } from './copy';
import { RegistrySlot } from './components/registry-slot';
import { SubmitBar } from './components/submit-bar';
import { useStaffOrderContext } from './staff-order-context';
import { useNewCustomer, type NewCustomerBlock } from './use-new-customer.hook';

/*
  Yeni profesyonel kayıtta eksik olan alttaki düğmenin üstünde yazar; alanın altına hata satırı girmez ki form kaymasın. Açılan ya da
  aynı SIRET'le bulunan kayıt çağıranın akışına (sipariş, yerinde satış) verilir.
*/

const c = t.newCustomer;

const WHY: Record<Exclude<NewCustomerBlock, null>, string> = {
  siret: c.why.siret,
  siretInvalid: c.why.siretInvalid,
  loading: c.slotLoading,
  dup: c.why.dup,
  notFound: c.why.notFound,
  name: c.why.name,
  email: c.why.email,
};

export function StaffNewCustomerScreen() {
  const router = useRouter();
  const order = useStaffOrderContext();
  return (
    <NewCustomerForm
      subtitle={c.subtitle}
      onChosen={(customer) => {
        if (order.customer?.id !== customer.id) order.selectCustomer(customer);
        router.dismissTo('/order');
      }}
    />
  );
}

interface NewCustomerFormProps {
  subtitle: string;
  /** Açılan kayıt ya da aynı SIRET'le var olan kayıt; ikisinde de akış o müşteriyle sürer. */
  onChosen: (customer: StaffCustomerOption) => void;
}

export function NewCustomerForm({ subtitle, onChosen }: NewCustomerFormProps) {
  const router = useRouter();
  const form = useNewCustomer();

  const submit = async () => {
    const customer = await form.submit();
    if (customer !== null) onChosen(customer);
  };

  const siretBlock = form.block === 'siret' || form.block === 'siretInvalid' || form.block === 'notFound';

  return (
    <View style={styles.screen} testID="staff-order-new-customer-screen">
      <OperationsStackHeader
        subtitleLines={1}
        title={c.title}
        subtitle={subtitle}
        onBack={() => router.back()}
        backLabel={t.back}
        testID="staff-order-new-customer-header"
      />
      <FormScroll contentContainerStyle={styles.body} testID="staff-order-new-customer-body">
        <TextField
          label={c.siret}
          value={form.siret}
          onChangeText={form.setSiret}
          accessibilityLabel={c.siret}
          numeric
          accent={siretBlock}
          density="compact"
          testID="staff-order-new-customer-siret"
        />
        <RegistrySlot registry={form.registry} duplicate={form.duplicate} onPickExisting={onChosen} />
        <TextField
          label={c.name}
          value={form.name}
          onChangeText={form.setName}
          placeholder={c.namePlaceholder}
          accessibilityLabel={c.name}
          content="name"
          accent={form.block === 'name' && form.name.trim() === ''}
          density="compact"
          testID="staff-order-new-customer-name"
        />
        <TextField
          label={c.phone}
          value={form.phone}
          onChangeText={form.setPhone}
          placeholder={c.phonePlaceholder}
          accessibilityLabel={c.phone}
          content="tel"
          accent={form.block === 'name' && form.name.trim() !== '' && form.phone.trim() === ''}
          density="compact"
          testID="staff-order-new-customer-phone"
        />
        <TextField
          label={c.email}
          value={form.email}
          onChangeText={form.setEmail}
          placeholder={c.emailPlaceholder}
          accessibilityLabel={c.email}
          content="email"
          accent={form.block === 'email'}
          density="compact"
          testID="staff-order-new-customer-email"
        />
        <Text style={styles.note}>{c.note}</Text>
      </FormScroll>
      <SubmitBar
        why={form.block === null ? c.why.ready : WHY[form.block]}
        label={form.sending ? c.sending : c.submit}
        disabled={form.block !== null || form.sending}
        onPress={() => void submit()}
        testID="staff-order-new-customer-footer"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  body: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space.sm,
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['9xl'],
    gap: operationsTheme.space.lg,
  },
  note: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
