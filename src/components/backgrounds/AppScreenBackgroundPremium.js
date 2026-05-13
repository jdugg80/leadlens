import React from 'react';
import OriginalPlainBackground from './OriginalPlainBackground';

/**
 * Rollback compatibility file.
 * Replaces the premium chrome/circuit background with the original-style black background.
 */
export default function AppScreenBackgroundPremium({ children, style }) {
  return <OriginalPlainBackground style={style}>{children}</OriginalPlainBackground>;
}
