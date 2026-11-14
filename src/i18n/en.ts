import type { Dictionary } from './config';

/** English dictionary — must mirror the key structure of `viMessages`. */
export const enMessages: Dictionary = {
  app: {
    title: 'Tank Workshop',
    subtitle: 'Interactive 3D viewer',
    loading: 'Loading…',
    loadingViewport: 'Initializing 3D viewport…',
  },
  nav: {
    label: 'Working mode',
  },
  modes: {
    explore: {
      label: 'Explore',
      description: 'Orbit, zoom and learn about every part of the tank.',
      leftTitle: 'Parts',
      leftEmpty: 'No model loaded yet.',
      rightTitle: 'Details',
      rightEmpty: 'Select a part to see its details.',
    },
    assembly: {
      label: 'Assembly',
      description: 'Assemble the tank step by step with guidance.',
      leftTitle: 'Assembly steps',
      leftEmpty: 'No assembly sequence yet.',
      rightTitle: 'Instructions',
      rightEmpty: 'Select a step to see its instructions.',
    },
    design: {
      label: 'Design',
      description: 'Customize configuration, paint and equipment.',
      leftTitle: 'Part library',
      leftEmpty: 'The library is empty.',
      rightTitle: 'Properties',
      rightEmpty: 'Select a part to edit its properties.',
    },
    compare: {
      label: 'Compare',
      description: 'Put models side by side to compare specifications.',
      leftTitle: 'Vehicles',
      leftEmpty: 'No vehicles selected for comparison.',
      rightTitle: 'Specifications',
      rightEmpty: 'Add at least two vehicles to compare.',
    },
  },
  panels: {
    collapseLeft: 'Collapse left panel',
    expandLeft: 'Expand left panel',
    collapseRight: 'Collapse right panel',
    expandRight: 'Expand right panel',
  },
  viewport: {
    label: '3D viewport',
    placeholder: 'The 3D viewport will appear here',
    mode: 'Mode',
    environment: 'Environment',
    displayMode: 'Display',
    model: 'Model',
    modelProcedural: 'Built-in',
    modelGlb: 'GLB file',
    modelToggle: 'Switch displayed model',
    glbNote: 'The GLB model has no separated parts: selecting, exploding and opening hatches only work with the built-in model.',
  },
  toolbar: {
    label: 'Toolbar',
    displayMode: 'Display mode',
    environment: 'Environment',
    resetView: 'Reset view',
    viewReset: 'View has been reset',
  },
  displayModes: {
    shaded: 'Shaded',
    wireframe: 'Wireframe',
    xray: 'X-ray',
  },
  environments: {
    studio: 'Studio',
    desert: 'Desert',
    forest: 'Forest',
    night: 'Night',
  },
  settings: {
    title: 'Settings',
    open: 'Open settings',
    close: 'Close settings',
    language: 'Language',
    languageChanged: 'Switched to English',
  },
  languages: {
    vi: 'Tiếng Việt',
    en: 'English',
  },
  toast: {
    region: 'Notifications',
    dismiss: 'Dismiss notification',
  },
  smallScreen: {
    title: 'Screen too small',
    message: 'This app needs a screen at least {width}px wide to display properly.',
    hint: 'Please use a computer, rotate your device or enlarge the browser window.',
  },
};
