import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';
import { LensSignal } from './lenssignalTypes';
import { LensSignalBadge } from './LensSignalBadge';

interface Props {
  signal: LensSignal;
  onPress: (signal: LensSignal) => void;
}

export const LensSignalMapMarker = ({ signal, onPress }: Props) => {
  const isRed = signal.alert_level === 'red' || signal.alert_level === 'Priority Review';

  return (
    <Marker
      coordinate={{ latitude: signal.latitude, longitude: signal.longitude }}
      onPress={() => onPress(signal)}
      tracksViewChanges={false}
    >
      <View style={styles.pin}>
        <Text style={styles.icon}>📡</Text>
        {signal.pest_indicator && <LensSignalBadge type="pest" />}
        {signal.signal_layer === 'Opening Signal' && <LensSignalBadge type="opening" />}
        {isRed && <LensSignalBadge type="danger" />}
      </View>
    </Marker>
  );
};

const styles = StyleSheet.create({
  pin: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(124, 58, 237, 0.9)',
    borderWidth: 2, borderColor: '#fff',
    alignItems: 'center', justifyContent: 'center',
  },
  icon: { fontSize: 20 },
});
