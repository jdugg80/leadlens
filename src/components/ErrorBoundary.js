import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../constants';

/**
 * ErrorBoundary component to catch and suppress errors from nested components
 * Prevents "Cannot read property 'interpolate' of undefined" from crashing the entire map
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    console.warn('[ErrorBoundary] Caught error:', error?.message || String(error));
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Full error info:', errorInfo);
  }

  render() {
    const { hasError, error } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      if (fallback) return fallback;
      
      // Default fallback - show minimal error
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>⚠️ Component Error</Text>
          <Text style={styles.errorDetail}>{error?.message?.substring(0, 80) || 'Unknown error'}</Text>
        </View>
      );
    }

    return children;
  }
}

const styles = StyleSheet.create({
  errorContainer: {
    padding: 12,
    backgroundColor: 'rgba(204, 16, 64, 0.1)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CC1040',
  },
  errorText: {
    color: '#FF3B5C',
    fontSize: 12,
    fontWeight: '700',
  },
  errorDetail: {
    color: '#FF3B5C',
    fontSize: 10,
    marginTop: 4,
    opacity: 0.8,
  },
});
