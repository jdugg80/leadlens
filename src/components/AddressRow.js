import { View } from 'react-native';
import { screenWidth } from '../utils/responsive';

const stateWidth = Math.max(50, Math.min(70, screenWidth * 0.15));
const zipWidth = Math.max(65, Math.min(90, screenWidth * 0.2));
const gap = 8;

export default function AddressRow({
  renderField,
  city, onCityChange,
  state, onStateChange,
  zip, onZipChange,
  cityOnVoice,
  stateOnVoice,
  zipOnVoice,
  stateMaxLength = 2,
  cityProps = {},
  stateProps = {},
  zipProps = {},
}) {
  return (
    <View style={{ flexDirection: 'row', marginTop: 10 }}>
      <View style={{ flex: 1 }}>
        {renderField({
          label: 'City',
          value: city,
          onChangeText: onCityChange,
          ...cityProps,
          onVoice: cityOnVoice,
        })}
      </View>
      <View style={{ width: gap }} />
      <View style={{ width: stateWidth }}>
        {renderField({
          label: 'State',
          value: state,
          onChangeText: onStateChange,
          maxLength: stateMaxLength,
          autoCapitalize: 'characters',
          ...stateProps,
          onVoice: stateOnVoice,
        })}
      </View>
      <View style={{ width: gap }} />
      <View style={{ width: zipWidth }}>
        {renderField({
          label: 'ZIP',
          value: zip,
          onChangeText: onZipChange,
          keyboardType: 'numeric',
          ...zipProps,
          onVoice: zipOnVoice,
        })}
      </View>
    </View>
  );
}
