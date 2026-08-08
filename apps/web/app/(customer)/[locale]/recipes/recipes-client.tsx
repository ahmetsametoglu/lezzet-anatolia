'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { RecipesDesktop } from './recipes.desktop';
import { RecipesMobile } from './recipes.mobile';
import type { RecipesViewProps } from './recipes-types';

interface RecipesClientProps extends RecipesViewProps {
  device: Device;
}

export function RecipesClient({ device, ...view }: RecipesClientProps) {
  const resolved = useDevice(device);
  return resolved === 'mobile' ? <RecipesMobile {...view} /> : <RecipesDesktop {...view} />;
}
