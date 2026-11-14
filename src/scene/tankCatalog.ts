import type { ComponentInfo } from '@/stores/useSelectionStore';
import type { ExplodePartSpec } from './animations/explode';
import type { Vec3 } from './animations/transformEngine';

/**
 * Danh mục bộ phận của xe tăng procedural (id khớp `scene/components/componentIds.ts`),
 * dùng cho cây bộ phận / panel thông tin ở chế độ Khám phá.
 */
export const TANK_CATALOG: readonly ComponentInfo[] = [
  { id: 'chassis', nameVi: 'Khung gầm', nameEn: 'Chassis', group: 'hull', parentId: null, education: 'Phần dưới của xe: thân, hệ chạy và các phụ kiện gắn ngoài.' },
  { id: 'hull', nameVi: 'Thân xe', nameEn: 'Hull', group: 'hull', parentId: 'chassis', education: 'Khung vỏ thép chính, chứa kíp lái, khoang chiến đấu và khoang động cơ.', relatedIds: ['turret', 'engine-compartment'] },
  { id: 'driver-hatch', nameVi: 'Nắp lái xe', nameEn: "Driver's hatch", group: 'hull', parentId: 'hull', education: 'Cửa ra vào của lái xe ở phía trước thân.' },
  { id: 'interior', nameVi: 'Khoang chiến đấu', nameEn: 'Fighting compartment', group: 'hull', parentId: 'hull', education: 'Không gian bên trong cho kíp xe và đạn dược.' },
  { id: 'engine-compartment', nameVi: 'Khoang động cơ', nameEn: 'Engine compartment', group: 'mobility', parentId: 'hull', education: 'Khoang phía sau chứa cụm động lực.', relatedIds: ['powertrain', 'engine-cover'] },
  { id: 'powertrain', nameVi: 'Cụm động lực', nameEn: 'Powerpack', group: 'mobility', parentId: 'engine-compartment', education: 'Động cơ và hộp số, truyền lực tới bánh xích chủ động.', relatedIds: ['sprocket-left', 'sprocket-right'] },
  { id: 'engine-cover', nameVi: 'Nắp khoang động cơ', nameEn: 'Engine deck cover', group: 'hull', parentId: 'engine-compartment', education: 'Tấm che phía trên khoang động cơ, mở ra để bảo dưỡng.' },
  { id: 'running-gear-left', nameVi: 'Hệ chạy bên trái', nameEn: 'Left running gear', group: 'mobility', parentId: 'chassis' },
  { id: 'road-wheels-left', nameVi: 'Bánh chịu tải trái', nameEn: 'Left road wheels', group: 'mobility', parentId: 'running-gear-left', education: 'Đỡ trọng lượng xe và lăn trên dải xích.' },
  { id: 'sprocket-left', nameVi: 'Bánh xích chủ động trái', nameEn: 'Left drive sprocket', group: 'mobility', parentId: 'running-gear-left', education: 'Nhận lực từ cụm động lực để kéo dải xích.' },
  { id: 'idler-left', nameVi: 'Bánh dẫn hướng trái', nameEn: 'Left idler', group: 'mobility', parentId: 'running-gear-left', education: 'Dẫn hướng và căng dải xích.' },
  { id: 'track-left', nameVi: 'Xích trái', nameEn: 'Left track', group: 'mobility', parentId: 'running-gear-left', education: 'Dải xích giúp xe đi trên địa hình mềm, gồ ghề.' },
  { id: 'running-gear-right', nameVi: 'Hệ chạy bên phải', nameEn: 'Right running gear', group: 'mobility', parentId: 'chassis' },
  { id: 'road-wheels-right', nameVi: 'Bánh chịu tải phải', nameEn: 'Right road wheels', group: 'mobility', parentId: 'running-gear-right', education: 'Đỡ trọng lượng xe và lăn trên dải xích.' },
  { id: 'sprocket-right', nameVi: 'Bánh xích chủ động phải', nameEn: 'Right drive sprocket', group: 'mobility', parentId: 'running-gear-right', education: 'Nhận lực từ cụm động lực để kéo dải xích.' },
  { id: 'idler-right', nameVi: 'Bánh dẫn hướng phải', nameEn: 'Right idler', group: 'mobility', parentId: 'running-gear-right', education: 'Dẫn hướng và căng dải xích.' },
  { id: 'track-right', nameVi: 'Xích phải', nameEn: 'Right track', group: 'mobility', parentId: 'running-gear-right', education: 'Dải xích giúp xe đi trên địa hình mềm, gồ ghề.' },
  { id: 'skirt-left', nameVi: 'Váy xích trái', nameEn: 'Left side skirt', group: 'hull', parentId: 'chassis', education: 'Tấm che bảo vệ hệ chạy bên hông.' },
  { id: 'skirt-right', nameVi: 'Váy xích phải', nameEn: 'Right side skirt', group: 'hull', parentId: 'chassis', education: 'Tấm che bảo vệ hệ chạy bên hông.' },
  { id: 'accessories', nameVi: 'Phụ kiện thân xe', nameEn: 'Hull accessories', group: 'accessories', parentId: 'chassis' },
  { id: 'toolbox', nameVi: 'Hộp dụng cụ', nameEn: 'Toolbox', group: 'accessories', parentId: 'accessories' },
  { id: 'headlights', nameVi: 'Đèn pha', nameEn: 'Headlights', group: 'accessories', parentId: 'accessories' },
  { id: 'spare-tracks', nameVi: 'Mắt xích dự phòng', nameEn: 'Spare track links', group: 'accessories', parentId: 'accessories' },
  { id: 'turret', nameVi: 'Tháp pháo', nameEn: 'Turret', group: 'turret', parentId: null, education: 'Phần xoay được phía trên, mang pháo chính và các thiết bị quan sát.', relatedIds: ['gun', 'commander-hatch'] },
  { id: 'gun', nameVi: 'Cụm pháo chính', nameEn: 'Main gun', group: 'turret', parentId: 'turret', education: 'Nâng/hạ quanh trục chốt để thay đổi góc bắn.', relatedIds: ['barrel'] },
  { id: 'barrel', nameVi: 'Nòng pháo', nameEn: 'Barrel', group: 'turret', parentId: 'gun' },
  { id: 'commander-hatch', nameVi: 'Nắp trưởng xe', nameEn: "Commander's hatch", group: 'turret', parentId: 'turret' },
  { id: 'smoke-launchers', nameVi: 'Ống phóng lựu khói', nameEn: 'Smoke launchers', group: 'turret', parentId: 'turret' },
  { id: 'antenna', nameVi: 'Ăng-ten', nameEn: 'Antenna', group: 'accessories', parentId: 'turret' },
];

export const TANK_GROUP_LABELS: Readonly<Record<string, string>> = {
  hull: 'Thân xe',
  turret: 'Tháp pháo',
  mobility: 'Hệ chạy & động lực',
  accessories: 'Phụ kiện',
};

/** Bộ phận ở cấp gốc được mở sẵn trong cây. */
export const TANK_CATALOG_EXPANDED = ['chassis', 'hull', 'turret'];

/** `target` của bước hướng dẫn lắp ráp (lessons.json) → id bộ phận trong scene. */
export const TUTORIAL_TARGETS: Readonly<Record<string, readonly string[]>> = {
  hull: ['hull'],
  'road-wheels': ['road-wheels-left', 'road-wheels-right'],
  tracks: ['track-left', 'track-right'],
  powerpack: ['powertrain'],
  turret: ['turret'],
  'main-gun': ['gun'],
};

export function tutorialTargetIds(target: string | null | undefined): readonly string[] {
  if (!target) return [];
  return TUTORIAL_TARGETS[target] ?? [target];
}

const UP: Vec3 = [0, 1, 0];

/**
 * Thứ tự tách của exploded view (6 giai đoạn của `EXPLODE_STAGES`). Bộ phận không có `direction`
 * sẽ tách theo hướng từ tâm xe ra tâm bộ phận (tính từ bounds lúc chạy).
 */
export const TANK_EXPLODE_PARTS: readonly Omit<ExplodePartSpec, 'bounds'>[] = [
  { id: 'driver-hatch', stage: 1, direction: UP, distance: 0.8 },
  { id: 'commander-hatch', stage: 1, direction: UP, distance: 0.8 },
  { id: 'engine-cover', stage: 1, direction: UP, distance: 1 },
  { id: 'skirt-left', stage: 2, distance: 1.2 },
  { id: 'skirt-right', stage: 2, distance: 1.2 },
  { id: 'accessories', stage: 2, direction: UP, distance: 0.6 },
  { id: 'gun', stage: 3, distance: 1.6 },
  { id: 'turret', stage: 4, direction: UP, distance: 2 },
  { id: 'powertrain', stage: 5, direction: UP, distance: 2.4 },
  { id: 'running-gear-left', stage: 6, distance: 1.8 },
  { id: 'running-gear-right', stage: 6, distance: 1.8 },
];
