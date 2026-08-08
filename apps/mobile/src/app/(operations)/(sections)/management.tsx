import { OperationsSectionScreen } from '@/screens/operations/section-screen';

// Yönetim bölümünün kökü — gerekçe ve ince-rota kuralı `courier.tsx`te, tek yerde.
export default function ManagementRoute() {
  return <OperationsSectionScreen section="management" />;
}
