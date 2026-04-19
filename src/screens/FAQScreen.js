import { useMemo } from 'react';
import { ScrollView, Text, StyleSheet, View } from 'react-native';
import { COLORS, FAQ_ITEMS } from '../constants';
import { Card, ScreenHeader, SectionLabel } from '../components/UI';

export default function FAQScreen({ navigation }) {
  const grouped = useMemo(() => {
    return FAQ_ITEMS.reduce((acc, item) => {
      if (!acc[item.category]) acc[item.category] = [];
      acc[item.category].push(item);
      return acc;
    }, {});
  }, []);

  return (
    <View style={s.root}>
      <ScreenHeader title="FAQ" onBack={() => navigation.goBack()} badge="HELP" />
      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 32 }}>
        {Object.entries(grouped).map(([category, items]) => (
          <View key={category}>
            <SectionLabel>{category}</SectionLabel>
            {items.map((item, idx) => (
              <Card key={`${category}-${idx}`} style={{ marginBottom: 10 }}>
                <Text style={s.question}>{item.question}</Text>
                <Text style={s.answer}>{item.answer}</Text>
              </Card>
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  question: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  answer: { color: COLORS.muted, fontSize: 12, lineHeight: 19, marginTop: 8 },
});
