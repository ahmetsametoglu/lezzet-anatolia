'use client';

import { useEffect, useState } from 'react';
import type { Device } from './device';

/**
 * Cihaz forkunun client ucu (Sapma 3): ilk boya sunucu ipucuyla (`initial`, `detectDevice()`),
 * mount sonrası viewport ölçüsüne göre düzeltilir. Tek render ağacı — `md:` akışkan responsive
 * yerine `device === 'mobile' ? <Mobil/> : <Masaüstü/>` çatallaması. Login, hata sayfaları ve
 * cihaza göre ayrışan tüm client yüzeyler bu TEK kaynağı kullanır.
 */
export function useDevice(initial: Device): Device {
  const [device, setDevice] = useState<Device>(initial);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const sync = () => setDevice(mq.matches ? 'mobile' : 'desktop');
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);
  return device;
}
