import { TypographyOptions, responsiveFontSizes } from '@mui/material/styles'; // v5.14.0

// System font stack with fallbacks for maximum compatibility
const FONT_FAMILY = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'";

// Monospace font stack for code and technical content
const FONT_FAMILY_MONO = "'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', Menlo, Courier, monospace";

// Font weight definitions for consistent usage across the application
const FONT_WEIGHTS = {
  light: 300,
  regular: 400,
  medium: 500,
  semiBold: 600,
  bold: 700,
} as const;

// Line height ratios optimized for readability
const LINE_HEIGHTS = {
  heading: 1.2, // Tighter for headings
  body: 1.5,    // Optimal for readability
  code: 1.4,    // Balanced for code blocks
} as const;

// Letter spacing adjustments for different text styles
const LETTER_SPACING = {
  heading: -0.02, // Slightly tighter for headings
  body: 0.01,     // Subtle expansion for body text
  button: 0.02,   // Wider for better button legibility
} as const;

// Base typography configuration following Material Design 3.0 specs
const baseTypography: TypographyOptions = {
  fontFamily: FONT_FAMILY,
  // Headers follow a modular scale with consistent visual hierarchy
  h1: {
    fontSize: '2.5rem', // 40px
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: LINE_HEIGHTS.heading,
    letterSpacing: LETTER_SPACING.heading,
  },
  h2: {
    fontSize: '2rem', // 32px
    fontWeight: FONT_WEIGHTS.bold,
    lineHeight: LINE_HEIGHTS.heading,
    letterSpacing: LETTER_SPACING.heading,
  },
  h3: {
    fontSize: '1.75rem', // 28px
    fontWeight: FONT_WEIGHTS.semiBold,
    lineHeight: LINE_HEIGHTS.heading,
    letterSpacing: LETTER_SPACING.heading,
  },
  h4: {
    fontSize: '1.5rem', // 24px
    fontWeight: FONT_WEIGHTS.semiBold,
    lineHeight: LINE_HEIGHTS.heading,
    letterSpacing: LETTER_SPACING.heading,
  },
  h5: {
    fontSize: '1.25rem', // 20px
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: LINE_HEIGHTS.heading,
    letterSpacing: LETTER_SPACING.heading,
  },
  h6: {
    fontSize: '1rem', // 16px
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: LINE_HEIGHTS.heading,
    letterSpacing: LETTER_SPACING.heading,
  },
  // Body text variants optimized for readability
  body1: {
    fontSize: '1rem', // 16px
    fontWeight: FONT_WEIGHTS.regular,
    lineHeight: LINE_HEIGHTS.body,
    letterSpacing: LETTER_SPACING.body,
  },
  body2: {
    fontSize: '0.875rem', // 14px
    fontWeight: FONT_WEIGHTS.regular,
    lineHeight: LINE_HEIGHTS.body,
    letterSpacing: LETTER_SPACING.body,
  },
  // Supporting text styles
  subtitle1: {
    fontSize: '1rem',
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: LINE_HEIGHTS.body,
    letterSpacing: LETTER_SPACING.body,
  },
  subtitle2: {
    fontSize: '0.875rem',
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: LINE_HEIGHTS.body,
    letterSpacing: LETTER_SPACING.body,
  },
  // Interactive element typography
  button: {
    fontSize: '0.875rem',
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: LINE_HEIGHTS.body,
    letterSpacing: LETTER_SPACING.button,
    textTransform: 'none', // Preserve case for better readability
  },
  // Utility text styles
  caption: {
    fontSize: '0.75rem', // 12px
    fontWeight: FONT_WEIGHTS.regular,
    lineHeight: LINE_HEIGHTS.body,
    letterSpacing: LETTER_SPACING.body,
  },
  overline: {
    fontSize: '0.75rem',
    fontWeight: FONT_WEIGHTS.medium,
    lineHeight: LINE_HEIGHTS.body,
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
  },
  // Custom code typography
  code: {
    fontFamily: FONT_FAMILY_MONO,
    fontSize: '0.8125rem', // 13px
    fontWeight: FONT_WEIGHTS.regular,
    lineHeight: LINE_HEIGHTS.code,
    letterSpacing: 0,
  },
};

/**
 * Creates responsive typography settings with proper scaling across different breakpoints.
 * Ensures text remains readable across all device sizes while maintaining visual hierarchy.
 * 
 * @param {TypographyOptions} baseTypography - Base typography configuration
 * @returns {TypographyOptions} Responsive typography configuration
 */
const createResponsiveTypography = (baseTypography: TypographyOptions): TypographyOptions => {
  return responsiveFontSizes({
    ...baseTypography,
  }, {
    breakpoints: ['sm', 'md', 'lg'],
    factor: 2.5,
    variants: [
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'subtitle1',
      'subtitle2',
      'body1',
      'body2',
    ],
  });
};

// Export the responsive typography configuration
export const typography = createResponsiveTypography(baseTypography);