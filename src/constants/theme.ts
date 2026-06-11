export const COLORS = {
  bg:          '#07070F',
  surface:     '#0F0F1A',
  surfaceAlt:  '#16162A',
  border:      '#1E1E35',

  accent:      '#3ED9B8',
  accentDim:   'rgba(62, 217, 184, 0.15)',
  accentSoft:  'rgba(62, 217, 184, 0.10)',

  text:        '#F5F4F2',
  textMuted:   '#8888A0',
  textDim:     '#555570',

  success:     '#3ED9B8',
  warning:     '#F5A623',
  error:       '#FF4D6A',
  pending:     '#A78BFA',

  // Soft fills for badges + banner cards
  warningSoft: 'rgba(245, 166, 35, 0.10)',
  errorSoft:   'rgba(255, 77, 106, 0.10)',
  pendingSoft: 'rgba(167, 139, 250, 0.12)',
} as const;

export const FONTS = {
  sans: 'System',
  mono: 'SpaceMono',
} as const;

export const SPACING = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  xxl: 48,
} as const;

export const RADIUS = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 9999,
} as const;
