import { describe, expect, it } from 'vitest';
import { colors, semantic } from './index';

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

// WCAG 2.2 AA: 4.5:1 for body text, 3:1 for large text and UI components.
describe('contrast (WCAG 2.2 AA)', () => {
  it.each([
    ['text on background', semantic.text, semantic.background, 4.5],
    ['text on surface', semantic.text, semantic.surface, 4.5],
    ['muted text on surface', semantic.textMuted, semantic.surface, 4.5],
    ['muted text on background', semantic.textMuted, semantic.background, 4.5],
    ['on-primary on primary', semantic.onPrimary, semantic.primary, 4.5],
    ['on-primary on primary hover', semantic.onPrimary, semantic.primaryHover, 4.5],
    ['primary as text on surface', semantic.primary, semantic.surface, 4.5],
    ['accent as text on surface', semantic.accent, semantic.surface, 4.5],
    ['brand text on brand-50', colors.brand[800], colors.brand[50], 4.5],
    ['warning text on warning bg', colors.warning[700], colors.warning[100], 4.5],
    ['focus ring on surface', semantic.focusRing, semantic.surface, 3],
  ])('%s', (_label, fg, bg, minimum) => {
    expect(contrast(fg, bg)).toBeGreaterThanOrEqual(minimum);
  });
});
