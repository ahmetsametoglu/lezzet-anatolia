import { useRouter } from 'expo-router';

import { CustomerPicker } from '@/screens/staff-order/customer-picker-screen';
import { NewCustomerForm } from '@/screens/staff-order/new-customer-screen';
import { saleCopy } from './copy';
import { useSaleContext } from './sale-context';

/* Yerinde satışın müşteri seçimi sipariş girişinin seçicisi ve yeni kayıt formudur; seçilen müşteri satışın bağlamına yazılır. */

const c = saleCopy.customer;

export function SaleCustomerPickerScreen() {
  const router = useRouter();
  const sale = useSaleContext();
  return (
    <CustomerPicker
      subtitle={c.pickerSubtitle}
      onPick={(customer) => {
        if (sale.customer?.id !== customer.id) sale.setCustomer(customer);
        router.back();
      }}
      onNewRecord={() => router.push('/sale/new-customer')}
    />
  );
}

export function SaleNewCustomerScreen() {
  const router = useRouter();
  const sale = useSaleContext();
  return (
    <NewCustomerForm
      subtitle={c.newSubtitle}
      onChosen={(customer) => {
        if (sale.customer?.id !== customer.id) sale.setCustomer(customer);
        router.dismissTo('/sale');
      }}
    />
  );
}
