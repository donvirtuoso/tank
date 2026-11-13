/**
 * Stable component identifiers. These are persisted/serialised by other parts
 * of the app (selection, annotations…) so they must never be renamed lightly.
 * `node` is the human-meaningful Object3D name in the scene graph.
 */
export const TANK_COMPONENTS = {
  root: { id: 'tank-root', node: 'TankRoot' },
  chassis: { id: 'chassis', node: 'Chassis' },
  hull: { id: 'hull', node: 'Hull' },
  driverHatch: { id: 'driver-hatch', node: 'DriverHatchPivot' },
  engineCompartment: { id: 'engine-compartment', node: 'EngineCompartment' },
  engineCover: { id: 'engine-cover', node: 'EngineCoverPivot' },
  powertrain: { id: 'powertrain', node: 'Powertrain' },
  interior: { id: 'interior', node: 'Interior' },
  turret: { id: 'turret', node: 'TurretRotationPivot' },
  gun: { id: 'gun', node: 'GunElevationPivot' },
  barrel: { id: 'barrel', node: 'Barrel' },
  commanderHatch: { id: 'commander-hatch', node: 'CommanderHatchPivot' },
  runningGearLeft: { id: 'running-gear-left', node: 'RunningGearLeft' },
  runningGearRight: { id: 'running-gear-right', node: 'RunningGearRight' },
  roadWheelsLeft: { id: 'road-wheels-left', node: 'RoadWheelsLeft' },
  roadWheelsRight: { id: 'road-wheels-right', node: 'RoadWheelsRight' },
  trackLeft: { id: 'track-left', node: 'TrackLeft' },
  trackRight: { id: 'track-right', node: 'TrackRight' },
  sprocketLeft: { id: 'sprocket-left', node: 'DriveSprocketLeft' },
  sprocketRight: { id: 'sprocket-right', node: 'DriveSprocketRight' },
  idlerLeft: { id: 'idler-left', node: 'IdlerLeft' },
  idlerRight: { id: 'idler-right', node: 'IdlerRight' },
  skirtLeft: { id: 'skirt-left', node: 'SideSkirtLeft' },
  skirtRight: { id: 'skirt-right', node: 'SideSkirtRight' },
  accessories: { id: 'accessories', node: 'Accessories' },
  smokeLaunchers: { id: 'smoke-launchers', node: 'SmokeLaunchers' },
  toolbox: { id: 'toolbox', node: 'Toolbox' },
  antenna: { id: 'antenna', node: 'Antenna' },
  headlights: { id: 'headlights', node: 'Headlights' },
  spareTracks: { id: 'spare-tracks', node: 'SpareTracks' },
} as const;

export type TankComponentKey = keyof typeof TANK_COMPONENTS;
export type TankComponentId = (typeof TANK_COMPONENTS)[TankComponentKey]['id'];

export type Side = 'left' | 'right';
