import { OperationsSectionScreen } from '@/screens/operations/section-screen';

// Depo bölümünün kökü — gerekçe ve ince-rota kuralı `courier.tsx`te, tek yerde.
export default function WarehouseRoute() {
  return <OperationsSectionScreen section="warehouse" />;
}
