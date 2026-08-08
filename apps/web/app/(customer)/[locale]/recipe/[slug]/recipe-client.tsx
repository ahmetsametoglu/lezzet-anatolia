'use client';

import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { RecipeDesktop } from './recipe.desktop';
import { RecipeMobile } from './recipe.mobile';
import type { RecipeViewProps } from './recipe-types';

interface RecipeClientProps extends RecipeViewProps {
  device: Device;
}

export function RecipeClient({ device, ...view }: RecipeClientProps) {
  const resolved = useDevice(device);
  return resolved === 'mobile' ? <RecipeMobile {...view} /> : <RecipeDesktop {...view} />;
}
