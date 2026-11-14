import { useMemo } from 'react';
import type { ComponentInfo } from '@/stores/useSelectionStore';
import { useRegisteredIds } from './sceneRegistry';
import { filterCatalog, TANK_CATALOG } from './tankCatalog';

/** Danh mục bộ phận của mô hình đang hiển thị (dựng sẵn hoặc GLB). */
export function useSceneCatalog(): ComponentInfo[] {
  const ids = useRegisteredIds();
  return useMemo(() => filterCatalog(TANK_CATALOG, ids), [ids]);
}
