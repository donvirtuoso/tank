import type { ComponentInfo } from '../../../stores/useSelectionStore';

/** Dữ liệu mẫu cho test: 16 linh kiện, 3 cấp, 4 nhóm. */
export const TANK_COMPONENTS: ComponentInfo[] = [
  { id: 'hull', nameVi: 'Thân xe', nameEn: 'Hull', group: 'hull', education: 'Khung chịu lực chính.' },
  { id: 'turret', nameVi: 'Tháp pháo', nameEn: 'Turret', group: 'turret', parentId: 'hull', relatedIds: ['gun', 'turret-ring'] },
  { id: 'gun', nameVi: 'Nòng pháo', nameEn: 'Main gun', group: 'turret', parentId: 'turret', properties: { 'Cỡ nòng': '125 mm' }, relatedIds: ['mantlet'] },
  { id: 'mantlet', nameVi: 'Mặt nạ pháo', nameEn: 'Gun mantlet', group: 'turret', parentId: 'turret' },
  { id: 'turret-ring', nameVi: 'Vành tháp pháo', nameEn: 'Turret ring', group: 'turret', parentId: 'hull' },
  { id: 'commander-hatch', nameVi: 'Nắp trưởng xe', nameEn: "Commander's hatch", group: 'turret', parentId: 'turret' },
  { id: 'periscope', nameVi: 'Kính tiềm vọng', nameEn: 'Periscope', group: 'optics', parentId: 'turret' },
  { id: 'driver-hatch', nameVi: 'Nắp lái xe', nameEn: "Driver's hatch", group: 'hull', parentId: 'hull' },
  { id: 'engine', nameVi: 'Động cơ', nameEn: 'Engine', group: 'mobility', parentId: 'hull', properties: { 'Công suất': '840 hp', 'Xi lanh': 12 }, education: 'Động cơ diesel đặt phía sau.', relatedIds: ['transmission', 'fuel-tank'] },
  { id: 'transmission', nameVi: 'Hộp số', nameEn: 'Transmission', group: 'mobility', parentId: 'hull', relatedIds: ['engine', 'sprocket'] },
  { id: 'fuel-tank', nameVi: 'Thùng nhiên liệu', nameEn: 'Fuel tank', group: 'mobility', parentId: 'hull' },
  { id: 'track-left', nameVi: 'Xích trái', nameEn: 'Left track', group: 'mobility', parentId: 'hull' },
  { id: 'track-right', nameVi: 'Xích phải', nameEn: 'Right track', group: 'mobility', parentId: 'hull' },
  { id: 'road-wheel', nameVi: 'Bánh chịu tải', nameEn: 'Road wheel', group: 'mobility', parentId: 'track-left' },
  { id: 'sprocket', nameVi: 'Bánh xích chủ động', nameEn: 'Drive sprocket', group: 'mobility', parentId: 'track-left' },
  { id: 'idler', nameVi: 'Bánh dẫn hướng', nameEn: 'Idler wheel', group: 'mobility', parentId: 'track-left' },
];
