import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking } from 'react-native';

function getHomeownerPinIcon(prospect) {
  if (prospect.prospect_type === 'new_homeowner') return { emoji: '\uD83D\uDD11', color: '#00C9FF', label: 'New Owner' };
  if (prospect.prospect_type === 'rental') return { emoji: '\uD83D\uDCCB', color: '#CC1040', label: 'Rental' };
  return { emoji: '\uD83C\uDFE0', color: '#7B3FBE', label: 'Owner' };
}

function formatCurrency(val) {
  if (!val) return 'N/A';
  return '$' + Number(val).toLocaleString();
}

export default function HomeownerSignalCard({ prospect, onClose, onAddToQueue }) {
  if (!prospect) return null;

  const pin = getHomeownerPinIcon(prospect);
  const daysAgo = prospect.days_since_transfer;
  const isNew = prospect.prospect_type === 'new_homeowner';
  const signals = prospect.upgrade_signals || {};

  function callOwner() {
    if (prospect.owner_phone) {
      Linking.openURL('tel:' + prospect.owner_phone.replace(/\D/g, ''));
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.typeTag, { borderColor: pin.color, backgroundColor: pin.color + '22' }]}>
          <Text style={styles.typeTagIcon}>{pin.emoji}</Text>
          <Text style={[styles.typeTagText, { color: pin.color }]}>{pin.label}</Text>
          {isNew && daysAgo && (
            <Text style={[styles.typeTagText, { color: pin.color }]}> · {daysAgo}d ago</Text>
          )}
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.address}>{prospect.address}</Text>
        <Text style={styles.cityState}>{prospect.city}, {prospect.state} {prospect.zip}</Text>

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>OWNER</Text>
          <Text style={styles.fieldValue}>{prospect.grantee_name || prospect.owner_name || 'Unknown'}</Text>
          {prospect.grantor_name && (
            <Text style={styles.fieldSub}>Sold by: {prospect.grantor_name}</Text>
          )}
        </View>

        {prospect.deed_transfer_date && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>DEED TRANSFER</Text>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>Close Date</Text>
                <Text style={styles.fieldValue}>{new Date(prospect.deed_transfer_date).toLocaleDateString()}</Text>
              </View>
              <View style={styles.col}>
                <Text style={styles.fieldLabel}>Sale Price</Text>
                <Text style={styles.fieldValue}>{formatCurrency(prospect.deed_transfer_price || prospect.mls_close_price)}</Text>
              </View>
            </View>
            {prospect.lienholder_name && (
              <Text style={styles.fieldSub}>Lien: {prospect.lienholder_name} ({prospect.lienholder_type || 'bank'})</Text>
            )}
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>PROPERTY</Text>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Est. Value</Text>
              <Text style={styles.fieldValue}>{formatCurrency(prospect.home_value_estimated || prospect.home_value_assessed)}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Sq Ft</Text>
              <Text style={styles.fieldValue}>{prospect.home_sq_footage ? prospect.home_sq_footage.toLocaleString() : 'N/A'}</Text>
            </View>
          </View>
          <View style={styles.row}>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Year Built</Text>
              <Text style={styles.fieldValue}>{prospect.year_built || 'N/A'}</Text>
            </View>
            <View style={styles.col}>
              <Text style={styles.fieldLabel}>Type</Text>
              <Text style={styles.fieldValue}>{(prospect.property_class || 'single_family').replace('_', ' ')}</Text>
            </View>
          </View>
        </View>

        {Object.values(signals).some(Boolean) && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>UPGRADE SIGNALS</Text>
            <View style={styles.signalRow}>
              {Object.entries(signals).filter(([, v]) => v).map(([k]) => (
                <View key={k} style={styles.signalChip}>
                  <Text style={styles.signalChipText}>{k.charAt(0).toUpperCase() + k.slice(1)}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={styles.scoreRow}>
          <Text style={styles.scoreLabel}>Lead Score</Text>
          <View style={styles.scoreBadge}>
            <Text style={styles.scoreValue}>{prospect.efficiency_score || 50}</Text>
            <Text style={styles.scoreMax}>/100</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.actions}>
        {prospect.owner_phone ? (
          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={callOwner}>
            <Text style={styles.actionBtnText}>Call Owner</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.actionBtn, styles.actionBtnDisabled]}>
            <Text style={styles.actionBtnTextDim}>No Phone</Text>
          </View>
        )}
        <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => onAddToQueue(prospect)}>
          <Text style={styles.actionBtnText}>+ Add to Queue</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#0D1117',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderTopWidth: 1, borderColor: '#1E2530',
    maxHeight: '75%',
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  typeTag: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 20, borderWidth: 1,
  },
  typeTagIcon: { fontSize: 12 },
  typeTagText: { fontSize: 12, fontWeight: '700' },
  closeBtn: { padding: 8 },
  closeBtnText: { color: '#B8BDD0', fontSize: 16 },
  body: { paddingHorizontal: 16 },
  address: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 4 },
  cityState: { color: '#B8BDD0', fontSize: 13, marginBottom: 12 },
  section: { marginBottom: 12, paddingBottom: 12, borderBottomWidth: 1, borderColor: '#1E2530' },
  sectionLabel: { color: '#00C9FF', fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 12, marginBottom: 6 },
  col: { flex: 1 },
  fieldLabel: { color: '#B8BDD0', fontSize: 11, marginBottom: 2 },
  fieldValue: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  fieldSub: { color: '#B8BDD0', fontSize: 12, marginTop: 4 },
  signalRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  signalChip: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: '#7B3FBE33', borderWidth: 1, borderColor: '#7B3FBE' },
  signalChipText: { color: '#7B3FBE', fontSize: 11, fontWeight: '600' },
  scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 },
  scoreLabel: { color: '#B8BDD0', fontSize: 13 },
  scoreBadge: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreValue: { color: '#00C9FF', fontSize: 22, fontWeight: '800' },
  scoreMax: { color: '#B8BDD0', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  actionBtn: { flex: 1, paddingVertical: 13, borderRadius: 10, alignItems: 'center' },
  actionBtnPrimary: { backgroundColor: '#00C9FF22', borderWidth: 1, borderColor: '#00C9FF' },
  actionBtnSecondary: { backgroundColor: '#7B3FBE22', borderWidth: 1, borderColor: '#7B3FBE' },
  actionBtnDisabled: { backgroundColor: '#1E2530' },
  actionBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  actionBtnTextDim: { color: '#B8BDD0', fontSize: 14 },
});
