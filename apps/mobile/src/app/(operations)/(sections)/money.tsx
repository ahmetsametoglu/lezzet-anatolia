import { OperationsSectionScreen } from '@/screens/operations/section-screen';

// Para bölümünün kökü — gerekçe ve ince-rota kuralı `courier.tsx`te, tek yerde.
export default function MoneyRoute() {
  return <OperationsSectionScreen section="money" />;
}
