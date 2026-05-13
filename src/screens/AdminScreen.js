import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { storageBridge as AsyncStorage } from '../utils/storage';
import {
  COLORS,
  EXPORT_MODES,
  LEADS_STORAGE_KEY,
  STATUS_OPTIONS,
  INDUSTRY_VERTICALS,
  ROLES,
  SUPABASE_SETTINGS_KEY,
} from '../constants';
import { ScreenHeader } from '../components/UI';
import { exportLeadsToXLSX } from '../utils/exportXlsx';
import { getExportSettings } from '../utils/templateSettings';
import { loadExportProfiles } from '../utils/exportProfiles';
import { sendPasswordReset } from '../utils/auth';
import { recordUserActivityEvent } from '../utils/userLearning';
import { showThemedAlert } from '../components/ThemedAlert';
import BetaTracker from '../../utils/betaTracker';

const ADMIN_PIN_KEY = '@leadlens_admin_pin';
const DISABLED_USERS_KEY = '@leadlens_disabled_users';
const DEFAULT_PIN = '1234';

export default function AdminScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('AdminScreen');
  }, []);

  const { user } = route.params || {};
  const isAM = user?.role === ROLES.ACCOUNT_MANAGER;
  const isBM = user?.role === ROLES.BRANCH_MANAGER;
  const isRM = user?.role === ROLES.REGIONAL_MANAGER;

  const [unlocked, setUnlocked] = useState(isAM);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [leads, setLeads] = useState([]);
  const prospects = leads; // alias for UI references
  const [tab, setTab] = useState('stats');
  const [adminPin, setAdminPin] = useState(DEFAULT_PIN);
  const [changingPin, setChangingPin] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [filterVertical, setFilterVertical] = useState('All');
  const [resetEmail, setResetEmail] = useState('');
  const [disableEmail, setDisableEmail] = useState('');
  const [disableReason, setDisableReason] = useState('');
  const [disabledUsers, setDisabledUsers] = useState({});

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const savedPin = await AsyncStorage.getItem(ADMIN_PIN_KEY);
        if (mounted && savedPin) setAdminPin(savedPin);

        const rawDisabled = await AsyncStorage.getItem(DISABLED_USERS_KEY);
        if (mounted && rawDisabled) {
          try {
            const parsed = JSON.parse(rawDisabled);
            setDisabledUsers(parsed && typeof parsed === 'object' ? parsed : {});
          } catch {
            setDisabledUsers({});
          }
        }
      } catch {
        if (mounted) setDisabledUsers({});
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!unlocked || !user) return;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
        const all = raw ? JSON.parse(raw) : [];

        let filtered = all;
        if (isAM) {
          filtered = all.filter((l) => l.employeeNum === user.employeeNum);
        } else if (isBM) {
          filtered = all.filter((l) => l.branchNum === user.branchNum);
        }

        setLeads(Array.isArray(filtered) ? filtered : []);
      } catch {
        setLeads([]);
      }
    })();
  }, [unlocked, isAM, isBM, user?.employeeNum, user?.branchNum, user]);

  const handleUnlock = () => {
    if (!user) {
      showThemedAlert('Admin unavailable', 'No user context was supplied.');
      return;
    }
    if (pin === adminPin) {
      setUnlocked(true);
      setError('');
    } else {
      setError('Incorrect PIN');
      setPin('');
    }
  };

  if (!user) {
    return (
      <View style={s.root}>
        <ScreenHeader title="Admin" onBack={() => navigation.goBack()} />
        <View style={s.emptyState}>
          <Text style={s.emptyText}>Admin access requires a logged-in user profile.</Text>
        </View>
      </View>
    );
  }

  const handleChangePin = async () => {
    if (newPin.length < 4) {
      showThemedAlert('PIN must be at least 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      showThemedAlert('PINs do not match');
      return;
    }

    try {
      await AsyncStorage.setItem(ADMIN_PIN_KEY, newPin);
      setAdminPin(newPin);
      setChangingPin(false);
      setNewPin('');
      setConfirmPin('');
      showThemedAlert('PIN updated');
    } catch (e) {
    BetaTracker.crash('AdminScreen', e);
      showThemedAlert('Could not save PIN', e?.message || 'Unknown issue');
    }
  };

  const handleDeleteLead = (idx) => {
    showThemedAlert('Delete Lead', `Remove "${leads[idx]?.businessName || 'this lead'}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
            const all = raw ? JSON.parse(raw) : [];
            const target = leads[idx];

            const updated = all.filter(
              (l) =>
                !(
                  l.businessName === target.businessName &&
                  l.employeeNum === target.employeeNum &&
                  l.phone === target.phone
                )
            );

            await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(updated));
            setLeads((prev) => prev.filter((_, i) => i !== idx));
            recordUserActivityEvent('prospect_deleted', {
              prospect_id: target.id,
              zip_code: target.zip,
              business_type: target.vertical || target.industry || target.businessType || null,
            }).catch(() => {});
          } catch (e) {
    BetaTracker.crash('AdminScreen', e);
            showThemedAlert('Delete failed', e?.message || 'Unknown issue');
          }
        },
      },
    ]);
  };

  const handleManagerReset = async () => {
    const email = resetEmail.trim();
    if (!email) {
      showThemedAlert('Need an email', 'Enter the user email that should receive the reset link.');
      return;
    }

    try {
      const raw = await AsyncStorage.getItem(SUPABASE_SETTINGS_KEY);
      const settings = raw ? JSON.parse(raw) : {};
      const result = await sendPasswordReset(settings, email);

      if (!result.ok) {
        showThemedAlert('Reset failed', result.reason || 'Unknown issue');
      } else {
        showThemedAlert(
          'Reset sent',
          `A password reset email was requested for ${email}.`
        );
        setResetEmail('');
      }
    } catch (e) {
    BetaTracker.crash('AdminScreen', e);
      showThemedAlert('Reset failed', e?.message || 'Unknown issue');
    }
  };

  const persistDisabledUsers = async (next) => {
    try {
      setDisabledUsers(next);
      await AsyncStorage.setItem(DISABLED_USERS_KEY, JSON.stringify(next));
      return true;
    } catch (e) {
    BetaTracker.crash('AdminScreen', e);
      showThemedAlert('Save failed', e?.message || 'Could not update disabled users.');
      return false;
    }
  };

  const handleDisableUser = async () => {
    const email = disableEmail.trim().toLowerCase();
    if (!email) {
      showThemedAlert('Need an email', 'Enter the user email that should be disabled.');
      return;
    }

    const next = {
      ...disabledUsers,
      [email]: {
        disabledAt: new Date().toISOString(),
        disabledBy: user.repName,
        reason: disableReason.trim(),
      },
    };

    const ok = await persistDisabledUsers(next);
    if (!ok) return;

    setDisableEmail('');
    setDisableReason('');
    showThemedAlert('Account disabled', `${email} will be blocked until re-enabled.`);
  };

  const handleEnableUser = async (email) => {
    const next = { ...disabledUsers };
    delete next[email];
    await persistDisabledUsers(next);
  };

  const handleExport = async () => {
    if (!prospects.length) {
      showThemedAlert('No prospects to export');
      return;
    }

    try {
      const exportSettings = await getExportSettings();
      let options = {};

      if (exportSettings.mode === EXPORT_MODES.STANDARD) {
        options = { mode: 'standard' };
      } else if (exportSettings.mode === EXPORT_MODES.SALES_TEMPLATE) {
        options = { mode: 'template' };
      } else if (exportSettings.mode === EXPORT_MODES.CUSTOM && exportSettings.profileName) {
        const profiles = await loadExportProfiles();
        const profile = profiles.find((item) => item.name === exportSettings.profileName);
        if (profile) {
          options = {
            mode: 'custom',
            templateUri: profile.templateUri,
            mapping: profile.mapping,
            startRow: profile.startRow,
            fileBaseName: profile.fileBaseName,
            name: profile.name,
          };
        }
      }

      await exportLeadsToXLSX(leads, user, options);
    } catch (e) {
    BetaTracker.crash('AdminScreen', e);
      showThemedAlert('Export failed', e?.message || 'Unknown issue');
    }
  };

  const visibleProspects =
    filterVertical === 'All'
      ? prospects
      : prospects.filter((l) => l.vertical === filterVertical);

  const statBy = (arr, key, options) =>
    options
      .map((o) => ({ label: o, count: arr.filter((l) => l[key] === o).length }))
      .filter((x) => x.count > 0);

  const byStatus = statBy(visibleProspects, 'status', STATUS_OPTIONS);
  const byVertical = statBy(visibleProspects, 'vertical', INDUSTRY_VERTICALS);
  const byRep = [...new Set(prospects.map((l) => l.repName || user.repName))]
    .map((rep) => ({
      label: rep,
      count: visibleProspects.filter((l) => (l.repName || user.repName) === rep).length,
    }))
    .filter((x) => x.count > 0);

  const byBranch = isRM
    ? [...new Set(prospects.map((l) => l.branchNum))]
        .map((b) => ({
          label: `Branch ${b}`,
          count: visibleProspects.filter((l) => l.branchNum === b).length,
        }))
        .filter((x) => x.count > 0)
    : [];

  const roleLabel = isAM ? 'My Leads' : isBM ? `Branch ${user.branchNum}` : 'All Branches';
  const roleColor = isAM ? COLORS.accent : isBM ? COLORS.accent2 : COLORS.success;

  if (!unlocked) {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader title="Manager Access" onBack={() => navigation.goBack()} />
        <View style={s.pinWrap}>
          <Text style={s.pinLockIcon}>{isBM ? '🏢' : '🌐'}</Text>
          <Text style={s.pinTitle}>{user.role}</Text>
          <Text style={s.pinSub}>Enter PIN to access {roleLabel}</Text>
          <TextInput
            style={[s.pinInput, error && { borderColor: COLORS.danger }]}
            placeholder="Enter PIN"
            placeholderTextColor={COLORS.muted}
            value={pin}
            onChangeText={(v) => {
              setPin(v);
              setError('');
            }}
            keyboardType="numeric"
            secureTextEntry
            maxLength={8}
            autoFocus
          />
          {!!error && <Text style={s.pinError}>{error}</Text>}
          <TouchableOpacity style={s.pinBtn} onPress={handleUnlock}>
            <Text style={s.pinBtnText}>Unlock →</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (changingPin) {
    return (
      <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScreenHeader title="Change PIN" onBack={() => setChangingPin(false)} />
        <View style={s.pinWrap}>
          <TextInput
            style={s.pinInput}
            placeholder="New PIN (min 4 digits)"
            placeholderTextColor={COLORS.muted}
            value={newPin}
            onChangeText={setNewPin}
            keyboardType="numeric"
            secureTextEntry
            maxLength={8}
            autoFocus
          />
          <TextInput
            style={[s.pinInput, { marginTop: 12 }]}
            placeholder="Confirm PIN"
            placeholderTextColor={COLORS.muted}
            value={confirmPin}
            onChangeText={setConfirmPin}
            keyboardType="numeric"
            secureTextEntry
            maxLength={8}
          />
          <TouchableOpacity style={s.pinBtn} onPress={handleChangePin}>
            <Text style={s.pinBtnText}>Save PIN</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={s.root}>
      <ScreenHeader title={isAM ? 'My Stats' : 'Manager View'} onBack={() => navigation.goBack()} />

      <View style={[s.roleBanner, { backgroundColor: `${roleColor}11`, borderColor: `${roleColor}33` }]}>
        <Text style={[s.roleBannerText, { color: roleColor }]}>
          {isAM ? '👤' : isBM ? '🏢' : '🌐'} {user.role} · {roleLabel} · {visibleProspects.length} prospects
        </Text>
      </View>

      <View style={s.tabBar}>
        {['stats', 'leads'].map((t) => (
          <TouchableOpacity
            key={t}
            style={[s.tabBtn, tab === t && s.tabBtnActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.tabBtnText, tab === t && s.tabBtnTextActive]}>
              {t === 'stats' ? '📊 Stats' : `📋 Leads (${visibleProspects.length})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 40 }}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.filterScroll}
          contentContainerStyle={s.filterRow}
        >
          {['All', ...INDUSTRY_VERTICALS].map((v) => (
            <TouchableOpacity
              key={v}
              style={[s.filterChip, filterVertical === v && s.filterChipActive]}
              onPress={() => setFilterVertical(v)}
            >
              <Text style={[s.filterChipText, filterVertical === v && s.filterChipTextActive]}>
                {v === 'All' ? '🔵 All' : v}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {tab === 'stats' && (
          <>
            <View style={s.totalCard}>
              <Text style={[s.totalNum, { color: roleColor }]}>{visibleProspects.length}</Text>
              <Text style={s.totalLabel}>
                {filterVertical === 'All' ? 'Total Leads' : filterVertical} · {roleLabel}
              </Text>
            </View>

            {isRM && byBranch.length > 0 && (
              <StatSection title="By Branch" data={byBranch} total={visibleProspects.length} color={COLORS.success} />
            )}

            {(isBM || isRM) && byRep.length > 0 && (
              <StatSection title="By Sales Rep" data={byRep} total={visibleProspects.length} color={COLORS.accent2} />
            )}

            <StatSection title="By Status" data={byStatus} total={visibleProspects.length} color={COLORS.accent} />
            <StatSection title="By Industry Vertical" data={byVertical} total={visibleProspects.length} color={COLORS.accent2} />

            <Text style={s.sectionLabel}>Actions</Text>

            <TouchableOpacity style={s.actionRow} onPress={handleExport}>
              <Text style={s.actionIcon}>📤</Text>
              <Text style={s.actionLabel}>
                Export {filterVertical === 'All' ? 'All' : filterVertical} to Excel
              </Text>
              <Text style={s.actionArrow}>›</Text>
            </TouchableOpacity>

            {!isAM && (
              <TouchableOpacity style={s.actionRow} onPress={() => setChangingPin(true)}>
                <Text style={s.actionIcon}>🔑</Text>
                <Text style={s.actionLabel}>Change Manager PIN</Text>
                <Text style={s.actionArrow}>›</Text>
              </TouchableOpacity>
            )}

            {!isAM && (
              <View style={[s.actionRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <Text style={[s.actionLabel, { marginBottom: 10 }]}>Trigger User Password Reset</Text>
                <TextInput
                  style={s.inlineInput}
                  placeholder="user@company.com"
                  placeholderTextColor={COLORS.muted}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity style={[s.miniBtn, { marginTop: 10 }]} onPress={handleManagerReset}>
                  <Text style={s.miniBtnText}>Send Reset Email</Text>
                </TouchableOpacity>
              </View>
            )}

            {!isAM && (
              <View style={[s.actionRow, { flexDirection: 'column', alignItems: 'stretch' }]}>
                <Text style={[s.actionLabel, { marginBottom: 10 }]}>User Access Control</Text>
                <TextInput
                  style={s.inlineInput}
                  placeholder="user@company.com"
                  placeholderTextColor={COLORS.muted}
                  value={disableEmail}
                  onChangeText={setDisableEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TextInput
                  style={[s.inlineInput, { marginTop: 10 }]}
                  placeholder="Reason (optional)"
                  placeholderTextColor={COLORS.muted}
                  value={disableReason}
                  onChangeText={setDisableReason}
                />
                <TouchableOpacity
                  style={[s.miniBtn, { marginTop: 10, backgroundColor: COLORS.danger }]}
                  onPress={handleDisableUser}
                >
                  <Text style={s.miniBtnText}>Disable User Email</Text>
                </TouchableOpacity>

                {Object.keys(disabledUsers).length > 0 && (
                  <View style={{ marginTop: 12, gap: 8 }}>
                    {Object.entries(disabledUsers).map(([email, info]) => (
                      <View key={email} style={s.disabledRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.disabledEmail}>{email}</Text>
                          {!!info?.reason && <Text style={s.disabledReason}>{info.reason}</Text>}
                        </View>
                        <TouchableOpacity onPress={() => handleEnableUser(email)}>
                          <Text style={s.enableText}>Re-enable</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            {(isBM || isRM) && (
              <TouchableOpacity
                style={[s.actionRow, { borderColor: 'rgba(255,59,92,0.3)' }]}
                onPress={() =>
                  showThemedAlert('Clear Leads', `Clear all ${visibleProspects.length} visible leads?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Clear',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          const raw = await AsyncStorage.getItem(LEADS_STORAGE_KEY);
                          const all = raw ? JSON.parse(raw) : [];
                          const kept = all.filter(
                            (l) =>
                              !visibleProspects.some(
                                (v) =>
                                  v.businessName === l.businessName &&
                                  v.employeeNum === l.employeeNum &&
                                  v.phone === l.phone
                              )
                          );
                          await AsyncStorage.setItem(LEADS_STORAGE_KEY, JSON.stringify(kept));
                          setLeads(kept);
                        } catch (e) {
    BetaTracker.crash('AdminScreen', e);
                          showThemedAlert('Clear failed', e?.message || 'Unknown issue');
                        }
                      },
                    },
                  ])
                }
              >
                <Text style={s.actionIcon}>🗑️</Text>
                <Text style={[s.actionLabel, { color: COLORS.danger }]}>Clear Visible Leads</Text>
                <Text style={s.actionArrow}>›</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {tab === 'leads' &&
          (visibleProspects.length === 0 ? (
            <Text style={s.empty}>No prospects matching current filter.</Text>
          ) : (
            visibleProspects.map((lead, idx) => (
              <View key={idx} style={s.leadCard}>
                <View style={{ flex: 1 }}>
                  <Text style={s.leadBiz}>{lead.businessName || 'Unnamed'}</Text>
                  <Text style={s.leadContact}>
                    {[lead.pocFirst, lead.pocLast].filter(Boolean).join(' ')}
                    {lead.phone ? ` · ${lead.phone}` : ''}
                  </Text>
                  <View style={s.leadMeta}>
                    <Text style={s.leadMetaText}>{lead.status}</Text>
                    <Text style={s.dot}>·</Text>
                    <Text style={s.leadMetaText}>{lead.vertical || lead.propertyType}</Text>
                    {(isBM || isRM) && !!lead.repName && (
                      <>
                        <Text style={s.dot}>·</Text>
                        <Text style={s.leadMetaText}>{lead.repName}</Text>
                      </>
                    )}
                    {isRM && !!lead.branchNum && (
                      <>
                        <Text style={s.dot}>·</Text>
                        <Text style={s.leadMetaText}>Br {lead.branchNum}</Text>
                      </>
                    )}
                  </View>
                </View>

                {(isBM || isRM) && (
                  <TouchableOpacity style={s.deleteBtn} onPress={() => handleDeleteLead(idx)}>
                    <Text style={s.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))
          ))}
      </ScrollView>
    </View>
  );
}

function StatSection({ title, data, total, color }) {
  if (!data.length) return null;

  return (
    <>
      <Text style={s.sectionLabel}>{title}</Text>
      <View style={s.statCard}>
        {data.map(({ label, count }) => (
          <View key={label} style={s.statRow}>
            <Text style={s.statLabel} numberOfLines={1}>
              {label}
            </Text>
            <View style={s.statBarWrap}>
              <View
                style={[
                  s.statBar,
                  {
                    width: `${Math.round((count / total) * 100)}%`,
                    backgroundColor: color,
                  },
                ]}
              />
            </View>
            <Text style={s.statCount}>{count}</Text>
          </View>
        ))}
      </View>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  roleBanner: { borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  roleBannerText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },

  // PIN screen
  pinWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 16 },
  pinLockIcon: { fontSize: 48 },
  pinTitle: { fontSize: 20, fontWeight: '800', color: COLORS.text },
  pinSub: { fontSize: 13, color: COLORS.muted, textAlign: 'center', lineHeight: 19 },
  pinInput: {
    width: '100%', backgroundColor: COLORS.surface2,
    borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14,
    color: COLORS.text, fontSize: 20, textAlign: 'center', letterSpacing: 8,
  },
  pinError: { color: COLORS.danger, fontSize: 13 },
  pinBtn: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.purple,
    borderRadius: 12, paddingVertical: 14, paddingHorizontal: 40,
    width: '100%', alignItems: 'center',
  },
  pinBtnText: { color: COLORS.purple, fontSize: 16, fontWeight: '800', letterSpacing: 1 },

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  tabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabBtnActive: { borderBottomWidth: 2, borderBottomColor: COLORS.purple },
  tabBtnText: { fontSize: 12, fontWeight: '600', color: COLORS.muted },
  tabBtnTextActive: { color: COLORS.purple },

  // Filter chips
  filterScroll: { marginTop: 12 },
  filterRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  filterChipActive: { borderColor: 'rgba(123,63,190,0.5)', backgroundColor: 'rgba(123,63,190,0.1)' },
  filterChipText: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  filterChipTextActive: { color: COLORS.purple },

  // Total card
  totalCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 14, padding: 24, alignItems: 'center', marginTop: 12,
    position: 'relative', overflow: 'hidden',
  },
  totalNum: { fontSize: 52, fontWeight: '900', lineHeight: 56 },
  totalLabel: { fontSize: 13, color: COLORS.muted, marginTop: 4, textAlign: 'center' },

  sectionLabel: {
    fontSize: 10, fontWeight: '700', color: COLORS.label,
    letterSpacing: 1.8, textTransform: 'uppercase', marginBottom: 10, marginTop: 18,
  },

  // Stat bars
  statCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 14, padding: 14, gap: 10,
  },
  statRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statLabel: { fontSize: 12, color: COLORS.textDim, width: 130 },
  statBarWrap: { flex: 1, height: 5, backgroundColor: COLORS.surface2, borderRadius: 3, overflow: 'hidden' },
  statBar: { height: '100%', borderRadius: 3 },
  statCount: { fontSize: 12, fontWeight: '700', color: COLORS.text, width: 28, textAlign: 'right' },

  // Action rows
  actionRow: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 12, padding: 14, flexDirection: 'row',
    alignItems: 'center', gap: 12, marginBottom: 8,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: COLORS.text },
  actionArrow: { fontSize: 18, color: COLORS.muted },
  inlineInput: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12, color: COLORS.text,
  },
  miniBtn: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.accent2,
    borderRadius: 10, paddingVertical: 10, alignItems: 'center',
  },
  miniBtnText: { color: COLORS.accent2, fontWeight: '800', fontSize: 12 },

  // Lead cards
  leadCard: {
    backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border,
    borderRadius: 12, padding: 12, flexDirection: 'row',
    alignItems: 'center', marginBottom: 8,
  },
  leadBiz: { fontSize: 14, fontWeight: '700', color: COLORS.text },
  leadContact: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  leadMeta: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  leadMetaText: { fontSize: 10, color: COLORS.muted },
  dot: { fontSize: 10, color: COLORS.border },
  deleteBtn: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(255,59,92,0.1)', borderWidth: 1,
    borderColor: 'rgba(255,59,92,0.25)',
    alignItems: 'center', justifyContent: 'center',
  },
  deleteBtnText: { color: COLORS.danger, fontSize: 13, fontWeight: '700' },

  // Disabled users
  disabledRow: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 10, padding: 10, backgroundColor: COLORS.surface2,
  },
  disabledEmail: { color: COLORS.text, fontSize: 12, fontWeight: '700' },
  emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  emptyText: { color: COLORS.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  disabledReason: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  enableText: { color: COLORS.success, fontWeight: '700', fontSize: 12 },
  empty: { textAlign: 'center', color: COLORS.muted, fontSize: 13, marginTop: 24 },
});