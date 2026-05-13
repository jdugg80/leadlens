import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Marker } from 'react-native-maps';
import { COLORS } from '../../constants';

interface Props {
  coordinate: { latitude: number; longitude: number };
  count: number;
  onPress: () => void;
  color?: string;
}

export const MapClusterMarker = ({ coordinate, count, onPress, color = COLORS.accent }: Props) => {
  // Scale size based on count
  const size = count < 10 ? 36 : count < 50 ? 44 : 52;
  const fontSize = count < 10 ? 14 : count < 50 ? 16 : 18;

  return (
    <Marker
      coordinate={coordinate}
      onPress={onPress}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
    >
      <View style={[
        styles.cluster,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          borderColor: '#fff',
        }
      ]}>
        <Text style={[styles.text, { fontSize }]}>{count}</Text>
      </View>
    </Marker>
  );
};

const styles = StyleSheet.create({
  cluster: {
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  text: {
    color: '#000',
    fontWeight: '900',
  }
});
