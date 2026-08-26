import { MoneyDayEndSchema, MoneyOverviewSchema, type MoneyDayEnd, type MoneyOverview } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  PARA UÇLARI — `/api/v1/money/*` (21.12 · M1/M2). SALT OKUMA: bu dosyada POST yoktur ve olmayacak —
  tasarımın altın kuralı ("'bakiye düzeltme' diye bir kavram yok"). Rol kapısı `accounting|admin`.
*/

export function fetchMoneyOverview(): Promise<ApiResult<MoneyOverview>> {
  return authorizedFetch('/api/v1/money/overview', MoneyOverviewSchema);
}

export function fetchMoneyDayEnd(): Promise<ApiResult<MoneyDayEnd>> {
  return authorizedFetch('/api/v1/money/day-end', MoneyDayEndSchema);
}
