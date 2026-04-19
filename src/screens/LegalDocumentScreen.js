import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { COLORS, PRIVACY_POLICY_TEXT, TERMS_OF_USE_TEXT } from '../constants';
import { ScreenHeader } from '../components/UI';

export default function LegalDocumentScreen({ navigation, route }) {
  const { title, type } = route.params || {};
  const content = type === 'terms' ? TERMS_OF_USE_TEXT : PRIVACY_POLICY_TEXT;

  return (
    <View style={s.root}>
      <ScreenHeader title={title || 'Legal'} onBack={() => navigation.goBack()} />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        <Text style={s.body}>{content}</Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },
  body: { color: COLORS.text, fontSize: 13, lineHeight: 22 },
});
