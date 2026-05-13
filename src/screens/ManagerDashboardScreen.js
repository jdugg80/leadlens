import { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, INDUSTRY_VERTICALS, ROLES, STATUS_OPTIONS } from '../constants';
import { Card, SectionLabel } from '../components/UI';
import { ThemedAlertHost, showThemedAlert } from '../components/ThemedAlert';
import BetaTracker from '../../utils/betaTracker';

const DATE_FILTERS = [
  { key: 'all', label: 'All Time' },
  { key: '7d', label: '7 Days' },
  { key: '30d', label: '30 Days' },
  { key: '90d', label: '90 Days' },
];

function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inRange(lead, dateFilter) {
  if (dateFilter === 'all') return true;
  const source = normalizeDate(lead.createdAt || lead.updatedAt || lead.capturedAt || lead.created_at_client);
  if (!source) return false;
  const now = Date.now();
  const diffDays = (now - source.getTime()) / 86400000;
  if (dateFilter === '7d') return diffDays <= 7;
  if (dateFilter === '30d') return diffDays <= 30;
  if (dateFilter === '90d') return diffDays <= 90;
  return true;
}

function groupCounts(items, getKey) {
  const map = new Map();
  items.forEach((item) => {
    const key = getKey(item);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return Array.from(map.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function recentDays(leads, days = 7) {
  const slots = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const key = d.toISOString().slice(5, 10);
    slots.push({ key, label: key, count: 0 });
  }
  const index = new Map(slots.map((s) => [s.key, s]));
  leads.forEach((lead) => {
    const dt = normalizeDate(lead.createdAt || lead.updatedAt || lead.capturedAt || lead.created_at_client);
    if (!dt) return;
    const key = dt.toISOString().slice(5, 10);
    const slot = index.get(key);
    if (slot) slot.count += 1;
  });
  return slots;
}

function StatBars({ title, rows, color }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <>
      <SectionLabel>{title}</SectionLabel>
      <Card>
        {rows.map((row) => (
          <View key={row.label} style={s.barRow}>
            <Text style={s.barLabel} numberOfLines={1}>{row.label}</Text>
            <View style={s.barTrack}>
              <View style={[s.barFill, { width: `${Math.max(8, (row.count / max) * 100)}%`, backgroundColor: color }]} />
            </View>
            <Text style={s.barCount}>{row.count}</Text>
          </View>
        ))}
      </Card>
    </>
  );
}

function KpiCard({ label, value, accent }) {
  return (
    <View style={[s.kpiCard, accent && { borderColor: accent }]}> 
      <Text style={[s.kpiValue, accent && { color: accent }]}>{value}</Text>
      <Text style={s.kpiLabel}>{label}</Text>
    </View>
  );
}

export default function ManagerDashboardScreen({ user, navigation, leads = [] }) {
  useEffect(() => {
    BetaTracker.screen('ManagerDashboardScreen');
  }, []);

  const prospects = leads; // alias for UI references
  const insets = useSafeAreaInsets();
  const isBranch = user?.role === ROLES.BRANCH_MANAGER;
  const isRegional = user?.role === ROLES.REGIONAL_MANAGER;
  const [verticalFilter, setVerticalFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('30d');
  const [repFilter, setRepFilter] = useState('All');
  const [branchFilter, setBranchFilter] = useState('All');

  const scopedLeads = useMemo(() => {
    let items = Array.isArray(leads) ? leads : [];
    if (isBranch) items = items.filter((lead) => String(lead.branchNum || '') === String(user?.branchNum || ''));
    return items;
  }, [leads, isBranch, user?.branchNum]);

  const reps = useMemo(
    () => ['All', ...Array.from(new Set(scopedLeads.map((lead) => lead.repName).filter(Boolean))).sort()],
    [scopedLeads]
  );

  const branches = useMemo(
    () => ['All', ...Array.from(new Set(scopedLeads.map((lead) => String(lead.branchNum || '')).filter(Boolean))).sort()],
    [scopedLeads]
  );

  const filtered = useMemo(() => {
    return scopedLeads.filter((lead) => {
      if (verticalFilter !== 'All' && (lead.vertical || 'Other') !== verticalFilter) return false;
      if (statusFilter !== 'All' && (lead.status || 'Suspect') !== statusFilter) return false;
      if (repFilter !== 'All' && (lead.repName || '') !== repFilter) return false;
      if (branchFilter !== 'All' && String(lead.branchNum || '') !== branchFilter) return false;
      if (!inRange(lead, dateFilter)) return false;
      return true;
    });
  }, [scopedLeads, verticalFilter, statusFilter, repFilter, branchFilter, dateFilter]);

  const reviewedCount = filtered.filter((lead) => (lead.status || '').toLowerCase() !== 'suspect' && (lead.status || '').toLowerCase() !== 'new').length;
  const duplicateCount = filtered.filter((lead) => lead.possibleDuplicate || lead.duplicateFlag || lead.duplicate_flag).length;
  const exportCount = filtered.filter((lead) => lead.exportedAt || lead.exportStatus === 'exported' || lead.sentAt).length;
  const repBreakdown = groupCounts(filtered, (lead) => lead.repName || user?.repName || 'Unknown Rep');
  const branchBreakdown = groupCounts(filtered, (lead) => lead.branchNum ? `Entity ${lead.branchNum}` : 'No Entity');
  const statusBreakdown = groupCounts(filtered, (lead) => lead.status || 'Suspect');
  const verticalBreakdown = groupCounts(filtered, (lead) => lead.vertical || 'Other');
  const trend = recentDays(filtered, 7);
  const activeBranches = new Set(filtered.map((lead) => String(lead.branchNum || '')).filter(Boolean)).size;
  const activeReps = new Set(filtered.map((lead) => lead.repName).filter(Boolean)).size;
  const recentActivity = [...filtered]
    .sort((a, b) => {
      const aTime = normalizeDate(a.createdAt || a.updatedAt || a.capturedAt || a.created_at_client)?.getTime() || 0;
      const bTime = normalizeDate(b.createdAt || b.updatedAt || b.capturedAt || b.created_at_client)?.getTime() || 0;
      return bTime - aTime;
    })
    .slice(0, 10);

  return (
    <View style={s.root}>
      <ThemedAlertHost />
      <View style={[s.topBar, { paddingTop: insets.top + 10 }]}>
        <View style={s.topBarInner}>
          <Text style={s.topTitle}>LeadLens Manager View</Text>
          <View style={s.topRight}>
            <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('Settings', { user })}><Text style={s.iconText}>⚙️</Text></TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('FAQ', { user })}><Text style={s.iconText}>❓</Text></TouchableOpacity>
            <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('Support', { user })}><Text style={s.iconText}>🛟</Text></TouchableOpacity>
            <TouchableOpacity
              style={s.iconBtn}
              onPress={() => {
                if (!user) {
                  showThemedAlert('Admin unavailable', 'Your account information is not available.');
                  return;
                }
                navigation.navigate('Admin', { user });
              }}
            >
              <Text style={s.iconText}>🔒</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={s.topAccentLine}>
          <View style={s.topAccentL} /><View style={s.topAccentR} />
        </View>
      </View>

      <ScrollView style={s.scroll} contentContainerStyle={{ paddingBottom: 36 }}>
        <Card style={s.heroCard}>
          <Text style={s.heroTitle}>{user?.role}</Text>
          <Text style={s.heroSub}>
            {isRegional ? 'Regional activity tracking with branch-level visibility.' : `Branch/Dept/Team ${user?.branchNum || '—'} activity tracking and rep oversight.`}
          </Text>
        </Card>

        <SectionLabel>Filters</SectionLabel>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroller} contentContainerStyle={s.filterRow}>
          {DATE_FILTERS.map((item) => (
            <TouchableOpacity key={item.key} style={[s.chip, dateFilter === item.key && s.chipActive]} onPress={() => setDateFilter(item.key)}>
              <Text style={[s.chipText, dateFilter === item.key && s.chipTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroller} contentContainerStyle={s.filterRow}>
          {['All', ...STATUS_OPTIONS].map((item) => (
            <TouchableOpacity key={item} style={[s.chip, statusFilter === item && s.chipActive]} onPress={() => setStatusFilter(item)}>
              <Text style={[s.chipText, statusFilter === item && s.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroller} contentContainerStyle={s.filterRow}>
          {['All', ...INDUSTRY_VERTICALS].map((item) => (
            <TouchableOpacity key={item} style={[s.chip, verticalFilter === item && s.chipActive]} onPress={() => setVerticalFilter(item)}>
              <Text style={[s.chipText, verticalFilter === item && s.chipTextActive]}>{item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroller} contentContainerStyle={s.filterRow}>
          {reps.map((item) => (
            <TouchableOpacity key={item} style={[s.chip, repFilter === item && s.chipActive]} onPress={() => setRepFilter(item)}>
              <Text style={[s.chipText, repFilter === item && s.chipTextActive]}>{item === 'All' ? 'All Reps' : item}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {isRegional && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroller} contentContainerStyle={s.filterRow}>
            {branches.map((item) => (
              <TouchableOpacity key={item} style={[s.chip, branchFilter === item && s.chipActive]} onPress={() => setBranchFilter(item)}>
                <Text style={[s.chipText, branchFilter === item && s.chipTextActive]}>{item === 'All' ? 'All Branches' : `Branch ${item}`}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        <SectionLabel>KPI Snapshot</SectionLabel>
        <View style={s.kpiGrid}>
          <KpiCard label="Total Leads" value={filtered.length} accent={COLORS.accent} />
          <KpiCard label="Reviewed" value={reviewedCount} accent={COLORS.success} />
          <KpiCard label="Unreviewed" value={Math.max(filtered.length - reviewedCount, 0)} accent={COLORS.accent2} />
          <KpiCard label="Duplicates" value={duplicateCount} accent={COLORS.danger} />
          <KpiCard label="Exports" value={exportCount} accent={COLORS.accent} />
          <KpiCard label={isRegional ? 'Active Entities' : 'Active Reps'} value={isRegional ? activeBranches : activeReps} accent={COLORS.success} />
        </View>

        <SectionLabel>Trend · Last 7 Days</SectionLabel>
        <Card>
          <View style={s.trendRow}>
            {trend.map((item) => {
              const max = Math.max(...trend.map((entry) => entry.count), 1);
              return (
                <View key={item.label} style={s.trendBarWrap}>
                  <View style={s.trendTrack}>
                    <View style={[s.trendFill, { height: `${Math.max(6, (item.count / max) * 100)}%` }]} />
                  </View>
                  <Text style={s.trendCount}>{item.count}</Text>
                  <Text style={s.trendLabel}>{item.label}</Text>
                </View>
              );
            })}
          </View>
        </Card>

        {isRegional && <StatBars title="Entity Comparison" rows={branchBreakdown} color={COLORS.success} />}
        <StatBars title="Rep Rollups" rows={repBreakdown} color={COLORS.accent2} />
        <StatBars title="Status Breakdown" rows={statusBreakdown} color={COLORS.accent} />
        <StatBars title="Vertical Breakdown" rows={verticalBreakdown} color={COLORS.accent2} />

        <SectionLabel>Recent Activity</SectionLabel>
        <Card>
          {!recentActivity.length ? (
            <Text style={s.emptyText}>No recent activity matches the current filters.</Text>
          ) : recentActivity.map((lead, idx) => (
            <View key={`${lead.id || lead.businessName || 'lead'}-${idx}`} style={[s.activityRow, idx < recentActivity.length - 1 && s.activityBorder]}>
              <View style={{ flex: 1 }}>
                <Text style={s.activityBiz}>{lead.businessName || 'Unnamed Business'}</Text>
                <Text style={s.activityMeta}>
                  {[lead.repName || user?.repName, lead.branchNum ? `Entity ${lead.branchNum}` : null, lead.vertical || 'Other', lead.status || 'Suspect']
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            </View>
          ))}
        </Card>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  topBar: { backgroundColor: COLORS.surface, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  topBarInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
  topAccentLine: { flexDirection: 'row', height: 2 },
  topAccentL: { flex: 1, backgroundColor: COLORS.purple, opacity: 0.75 },
  topAccentR: { flex: 1, backgroundColor: COLORS.accent2, opacity: 0.75 },
  topTitle: { color: COLORS.text, fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit, alignItems: 'center', justifyContent: 'center' },
  iconText: { fontSize: 15 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  heroCard: { marginTop: 16 },
  heroTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  heroSub: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginTop: 6 },
  filterScroller: { marginTop: 6 },
  filterRow: { gap: 8, paddingBottom: 4 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.border },
  chipActive: { borderColor: COLORS.purple, backgroundColor: 'rgba(123,63,190,0.1)' },
  chipText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  chipTextActive: { color: COLORS.purple },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  kpiCard: { width: '48%', backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.borderLit, borderRadius: 14, padding: 16, overflow: 'hidden', position: 'relative' },
  kpiValue: { color: COLORS.text, fontSize: 28, fontWeight: '900' },
  kpiLabel: { color: COLORS.muted, fontSize: 11, marginTop: 4, letterSpacing: 0.5 },
  trendRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', minHeight: 150, gap: 8 },
  trendBarWrap: { flex: 1, alignItems: 'center' },
  trendTrack: { height: 100, width: '100%', backgroundColor: COLORS.surface2, borderRadius: 10, justifyContent: 'flex-end', overflow: 'hidden' },
  trendFill: { width: '100%', backgroundColor: COLORS.purple, borderRadius: 10 },
  trendCount: { color: COLORS.text, fontSize: 11, fontWeight: '700', marginTop: 6 },
  trendLabel: { color: COLORS.muted, fontSize: 10, marginTop: 2 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  barLabel: { width: 116, color: COLORS.textDim, fontSize: 12 },
  barTrack: { flex: 1, height: 6, backgroundColor: COLORS.surface2, borderRadius: 3, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 3 },
  barCount: { width: 28, textAlign: 'right', color: COLORS.text, fontWeight: '700', fontSize: 12 },
  activityRow: { paddingVertical: 10 },
  activityBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  activityBiz: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  activityMeta: { color: COLORS.muted, fontSize: 11, marginTop: 4, lineHeight: 16 },
  emptyText: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
});