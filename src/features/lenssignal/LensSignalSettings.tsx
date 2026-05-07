import React, { useState, useEffect } from 'react';
import { View, Text, Switch, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { COLORS } from '../../constants';

export const LensSignalSettings = ({ userId }: { userId: string }) => {
  const [prefs, setPrefs] = useState({
    enable_compliance_alerts: true,
    enable_opening_alerts: true,
    radius_miles: 5,
  });

  useEffect(() => {
    fetchPrefs();
  }, [userId]);

  const fetchPrefs = async () => {
    try {
      const { data, error } = await supabase
        .from('lenssignal_user_preferences')
        .select('*')
        .eq('user_id', userId)
        .single();
      if (data) setPrefs(data);
      if (error && error.code !== 'PGRST116') {
        console.error('[LensSignalSettings] Error fetching prefs:', error);
      }
    } catch (err) {
      console.error('[LensSignalSettings] Unexpected error:', err);
    }
  };

  const togglePref = async (key: string) => {
    const nextValue = !prefs[key as keyof typeof prefs];
    const nextPrefs = { ...prefs, [key]: nextValue };
    setPrefs(nextPrefs);

    try {
      await supabase.from('lenssignal_user_preferences').upsert({
        user_id: userId,
        ...nextPrefs,
        updated_at: new Date().toISOString()
      });
    } catch (err) {
      console.error('[LensSignalSettings] Error saving pref:', err);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>LensSignal Preferences</Text>

      <View style={styles.setting}>
        <Text style={styles.label}>Compliance Alerts</Text>
        <Switch
          value={prefs.enable_compliance_alerts}
          onValueChange={() => togglePref('enable_compliance_alerts')}
          trackColor={{ false: COLORS.border, true: COLORS.accent }}
        />
      </View>

      <View style={styles.setting}>
        <Text style={styles.label}>Opening Alerts</Text>
        <Switch
          value={prefs.enable_opening_alerts}
          onValueChange={() => togglePref('enable_opening_alerts')}
          trackColor={{ false: COLORS.border, true: COLORS.accent }}
        />
      </View>

      <Text style={styles.hint}>Proximity alerts based on your current location.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: COLORS.surface, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  title: { color: COLORS.text, fontSize: 16, fontWeight: '800', marginBottom: 16 },
  setting: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  label: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  hint: { color: COLORS.textDim, fontSize: 12, marginTop: 8 },
});
