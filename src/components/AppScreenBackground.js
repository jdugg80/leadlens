import React from 'react';
import OriginalPlainBackground from './backgrounds/OriginalPlainBackground';

/**
 * Compatibility wrapper.
 *
 * Existing screens may pass variant="premium" or variant="scifi".
 * This ignores the variant and restores the original-style dark background.
 */
export const DEFAULT_BACKGROUND_VARIANT = 'original';

export default function AppScreenBackground({ children, style }) {
  return <OriginalPlainBackground style={style}>{children}</OriginalPlainBackground>;
}
