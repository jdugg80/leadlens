import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '../constants';
import {
  getTargetLensProfiles,
  getTargetLensCategories,
  getTargetLensProfilesByCategory,
  TargetLensProfile,
  TargetLensSearchMode
} from '../config/targetLensProfiles';
import { storageBridge as AsyncStorage } from '../utils/storage';
import { TARGET_LENS_PROFILES_KEY, TARGET_LENS_SEARCH_MODE_KEY } from '../constants';

interface Props {
  onProfileChange?: (profile: TargetLensProfile | null, mode: TargetLensSearchMode) => void;
}

export default function TargetLensProfileSelector({ onProfileChange }: Props) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [activeProfile, setActiveProfile] = useState<TargetLensProfile | null>(null);
  const [searchMode, setSearchMode] = useState<TargetLensSearchMode>('Strict');

  const categories = getTargetLensCategories();

  useEffect(() => {
    // Load saved profile and mode on mount
    Promise.all([
      AsyncStorage.getItem(TARGET_LENS_PROFILES_KEY),
      AsyncStorage.getItem(TARGET_LENS_SEARCH_MODE_KEY)
    ]).then(([profileVal, modeVal]) => {
      let savedProfile: TargetLensProfile | null = null;
      let savedMode: TargetLensSearchMode = 'Strict';

      if (profileVal) {
        savedProfile = JSON.parse(profileVal) as TargetLensProfile;
        setSelectedCategory(savedProfile.category);
        setSelectedProfileId(savedProfile.id);
        setActiveProfile(savedProfile);
      }

      if (modeVal) {
        savedMode = modeVal as TargetLensSearchMode;
        setSearchMode(savedMode);
      }

      if (onProfileChange) onProfileChange(savedProfile, savedMode);
    });
  }, []);

  const handleSelectProfile = async (profile: TargetLensProfile) => {
    const isDeselecting = selectedProfileId === profile.id;
    const nextProfile = isDeselecting ? null : profile;

    setSelectedProfileId(nextProfile?.id || null);
    setActiveProfile(nextProfile);

    if (nextProfile) {
      await AsyncStorage.setItem(TARGET_LENS_PROFILES_KEY, JSON.stringify(nextProfile));
    } else {
      await AsyncStorage.removeItem(TARGET_LENS_PROFILES_KEY);
    }

    if (onProfileChange) onProfileChange(nextProfile, searchMode);
  };

  const handleSelectMode = async (mode: TargetLensSearchMode) => {
    setSearchMode(mode);
    await AsyncStorage.setItem(TARGET_LENS_SEARCH_MODE_KEY, mode);
    if (onProfileChange) onProfileChange(activeProfile, mode);
  };

  return (
    <View style={s.container}>
      <Text style={s.label}>TargetLens™ Profile</Text>
      <Text style={s.helperText}>
        Tell LeadLens what you sell or service. TargetLens helps find prospects most likely to need it.
      </Text>

      {/* Category Section */}
      <Text style={s.fieldLabel}>Category</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.categoryRow}
      >
        {categories.map(cat => (
          <TouchableOpacity
            key={cat}
            style={[s.categoryBtn, selectedCategory === cat && s.categoryBtnActive]}
            onPress={() => setSelectedCategory(cat)}
          >
            <Text style={[s.categoryText, selectedCategory === cat && s.categoryTextActive]}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Profile Section */}
      <Text style={s.fieldLabel}>Profile</Text>
      <View style={s.profileGrid}>
        {(selectedCategory ? getTargetLensProfilesByCategory(selectedCategory) : getTargetLensProfiles()).map(profile => {
          const isActive = selectedProfileId === profile.id;
          return (
            <TouchableOpacity
              key={profile.id}
              style={[s.profileCard, isActive && s.profileCardActive]}
              onPress={() => handleSelectProfile(profile)}
            >
              <View style={s.profileHeader}>
                <Text style={s.profileLabel}>{profile.label}</Text>
                {isActive && <Text style={s.activeBadge}>Active</Text>}
              </View>
              <Text style={s.profileDesc} numberOfLines={2}>{profile.description}</Text>
              <View style={s.tagRow}>
                <View style={s.tag}><Text style={s.tagText}>{profile.division}</Text></View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {activeProfile && activeProfile.category !== 'Pest Control' && (
        <View style={s.modeSection}>
          <Text style={s.fieldLabel}>Search Mode</Text>
          <View style={s.modeRow}>
            {(['Strict', 'Expanded', 'Referral'] as TargetLensSearchMode[]).map(mode => (
              <TouchableOpacity
                key={mode}
                style={[s.modeBtn, searchMode === mode && s.modeBtnActive]}
                onPress={() => handleSelectMode(mode)}
              >
                <Text style={[s.modeText, searchMode === mode && s.modeTextActive]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={s.modeHint}>
            {searchMode === 'Strict' && 'Strict: primary prospects only'}
            {searchMode === 'Expanded' && 'Expanded: primary + secondary prospects'}
            {searchMode === 'Referral' && 'Referral: primary + secondary + referral partners'}
          </Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: {
    marginVertical: 10,
  },
  label: {
    color: COLORS.label,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  helperText: {
    color: COLORS.textDim,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  fieldLabel: {
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  categoryRow: {
    paddingBottom: 12,
    gap: 8,
  },
  categoryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  categoryBtnActive: {
    backgroundColor: 'rgba(0,201,255,0.12)',
    borderColor: COLORS.accent,
  },
  categoryText: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  categoryTextActive: {
    color: COLORS.accent,
  },
  profileGrid: {
    gap: 8,
  },
  profileCard: {
    backgroundColor: COLORS.surface2,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  profileCardActive: {
    borderColor: COLORS.accent,
    backgroundColor: 'rgba(0,201,255,0.04)',
  },
  profileHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  profileLabel: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '800',
  },
  activeBadge: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  profileDesc: {
    color: COLORS.textDim,
    fontSize: 11,
    lineHeight: 15,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    gap: 6,
  },
  tag: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: {
    color: COLORS.muted,
    fontSize: 9,
    fontWeight: '700',
  },
  modeSection: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  modeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  modeBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  modeBtnActive: {
    backgroundColor: 'rgba(0,201,255,0.12)',
    borderColor: COLORS.accent,
  },
  modeText: {
    color: COLORS.textDim,
    fontSize: 12,
    fontWeight: '700',
  },
  modeTextActive: {
    color: COLORS.accent,
  },
  modeHint: {
    color: COLORS.muted,
    fontSize: 11,
    fontStyle: 'italic',
  },
  infoBox: {
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(0,201,255,0.05)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,201,255,0.15)',
  },
  infoText: {
    color: COLORS.textDim,
    fontSize: 11,
    lineHeight: 16,
    fontStyle: 'italic',
    textAlign: 'center',
  }
});
