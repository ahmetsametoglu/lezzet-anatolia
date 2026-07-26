import { notFound } from 'next/navigation';

/**
 * Operasyon catch-all — `/operations/…` altındaki eşleşmeyen yolları yakalar ve `notFound()`
 * çağırır → operations/not-found.tsx (AdminSidebar içinde) devreye girer. Layout guard'ı (requireStaff)
 * önce çalışır, böylece 404 da yalnız personele ve sidebar korunarak gösterilir.
 */
export default function OperationsCatchAll() {
  notFound();
}
