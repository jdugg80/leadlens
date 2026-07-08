import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Image, TouchableOpacity,
  StyleSheet, Dimensions, Modal,
} from 'react-native';
import { storage as AsyncStorage } from '../utils/storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, LEADS_STORAGE_KEY } from '../constants';
import { ScreenHeader } from '../components/UI';
import { showThemedAlert } from '../components/ThemedAlert';
import BetaTracker from '../../utils/betaTracker';

const { width } = Dimensions.get('window');
const TILE_SIZE = (width - 48) / 3;

export default function CardGalleryScreen({ navigation, route }) {
  useEffect(() => {
    BetaTracker.screen('CardGalleryScreen');
  }, []);

  const { user } = route.params;
  const [cards, setCards] = useState([]);
  const [selectedCard, setSelectedCard] = useState(null);
  const [multiSelect, setMultiSelect] = useState(false);
  const [selectedCardIds, setSelectedCardIds] = useState([]);
  const [loading, setLoading] = useState(true);

  const isCardSelected = (cardId) => selectedCardIds.includes(cardId);

  useFocusEffect(useCallback(() => {
    loadCards();
  }, []));

  const loadCards = async () => {
    setLoading(true);
    try {
      // Load all prospects with imageUri - use sync API for instant loading
      const raw = AsyncStorage.getSync(LEADS_STORAGE_KEY);
      const leads = raw ? JSON.parse(raw) : [];

      const withImages = leads
        .filter(l => l.imageUri)
        .map(l => ({
          id: l.id,
          imageUri: l.imageUri,
          businessName: l.businessName || 'Unknown Business',
          captureMethod: l.captureMethod || 'image',
          savedAt: l.savedAt || '',
          lead: l,
        }))
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt));

      // Also scan card_images directory for any orphaned images
      try {
        const dir = `${FileSystem.documentDirectory}card_images/`;
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (dirInfo.exists) {
          const files = await FileSystem.readDirectoryAsync(dir);
          const existingUris = new Set(withImages.map(c => c.imageUri));
          for (const file of files) {
            const uri = `${dir}${file}`;
            if (!existingUris.has(uri)) {
              withImages.push({
                id: uri,
                imageUri: uri,
                businessName: 'Unlinked Card',
                captureMethod: 'image',
                savedAt: '',
                lead: null,
              });
            }
          }
        }
      } catch {}

      setCards(withImages);
    } catch (err) {
    BetaTracker.crash('CardGalleryScreen', err);
      showThemedAlert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCardPress = (card) => {
    if (multiSelect) {
      setSelectedCardIds(prev => prev.includes(card.id)
        ? prev.filter(id => id !== card.id)
        : [...prev, card.id]
      );
      return;
    }

    setSelectedCard(card);
  };

  const handleTileLongPress = (card) => {
    if (!multiSelect) {
      setMultiSelect(true);
      setSelectedCardIds([card.id]);
      setSelectedCard(null);
    }
  };

  const toggleMultiSelect = () => {
    if (multiSelect) {
      setSelectedCardIds([]);
      setMultiSelect(false);
      return;
    }
    setSelectedCard(null);
    setMultiSelect(true);
  };

  const handleDeleteSelected = () => {
    if (!selectedCardIds.length) return;
    showThemedAlert(
      'Delete selected images?',
      'This only removes the image files, not the lead records.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              const idsToRemove = new Set(selectedCardIds);
              const remaining = cards.filter(c => !idsToRemove.has(c.id));

              for (const card of cards.filter(c => idsToRemove.has(c.id))) {
                await FileSystem.deleteAsync(card.imageUri, { idempotent: true });
              }

              setCards(remaining);
              setSelectedCardIds([]);
              setMultiSelect(false);
            } catch (err) {
    BetaTracker.crash('CardGalleryScreen', err);
              showThemedAlert('Delete failed', err.message);
            }
          },
        },
      ]
    );
  };

  const handleViewLead = () => {
    if (!selectedCard?.lead) return;
    setSelectedCard(null);
    navigation.navigate('Review', { user, lead: selectedCard.lead, editIdx: null });
  };

  const handleDeleteCard = () => {
    showThemedAlert(
      'Delete image?',
      'This only removes the image file, not the lead record.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await FileSystem.deleteAsync(selectedCard.imageUri, { idempotent: true });
              setCards(prev => prev.filter(c => c.id !== selectedCard.id));
              setSelectedCard(null);
            } catch (err) {
    BetaTracker.crash('CardGalleryScreen', err);
              showThemedAlert('Delete failed', err.message);
            }
          },
        },
      ]
    );
  };

  const renderCard = ({ item }) => (
    <TouchableOpacity
      style={[
        s.tile,
        multiSelect && isCardSelected(item.id) && s.tileSelected,
      ]}
      onPress={() => handleCardPress(item)}
      onLongPress={() => handleTileLongPress(item)}
      activeOpacity={0.8}
    >
      <Image source={{ uri: item.imageUri }} style={s.tileImage} resizeMode="cover" />
      {multiSelect && (
        <View style={[
          s.selectBadge,
          isCardSelected(item.id) && s.selectBadgeActive,
        ]}>
          <Text style={s.selectBadgeText}>
            {isCardSelected(item.id) ? '✓' : '+'}
          </Text>
        </View>
      )}
      <View style={s.tileOverlay}>
        <Text style={s.tileName} numberOfLines={2}>{item.businessName}</Text>
        {!!item.captureMethod && (
          <Text style={s.tileMethod}>
            {item.captureMethod === 'geotarget' ? '⚡' :
             item.captureMethod === 'storefront' ? '🏢' : '📷'}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={s.root}>
      <ScreenHeader
        title="Card Gallery"
        badge={`${cards.length} CARDS`}
        onBack={() => navigation.goBack()}
      />

      {!loading && cards.length > 0 && (
        <View style={s.multiActionRow}>
          <TouchableOpacity style={s.multiActionBtn} onPress={toggleMultiSelect}>
            <Text style={s.multiActionBtnText}>
              {multiSelect ? 'Exit Multi-select' : 'Select Multiple'}
            </Text>
          </TouchableOpacity>
          {multiSelect && (
            <>
              <Text style={s.multiActionCount}>{selectedCardIds.length} selected</Text>
              <TouchableOpacity
                style={[s.multiActionBtn, s.multiActionBtnDanger]}
                onPress={handleDeleteSelected}
                disabled={!selectedCardIds.length}
              >
                <Text style={[s.multiActionBtnText, !selectedCardIds.length && s.multiActionBtnTextDisabled]}>
                  Delete Selected
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {loading ? (
        <Text style={s.empty}>Loading...</Text>
      ) : cards.length === 0 ? (
        <Text style={s.empty}>No captured images yet.{'\n'}Scan a business card or storefront to get started.</Text>
      ) : (
        <FlatList
          data={cards}
          keyExtractor={item => item.id || item.imageUri}
          renderItem={renderCard}
          numColumns={3}
          contentContainerStyle={s.grid}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Full-screen preview modal */}
      <Modal
        visible={!!selectedCard}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedCard(null)}
      >
        <View style={s.modalBg}>
          <TouchableOpacity style={s.modalClose} onPress={() => setSelectedCard(null)}>
            <Text style={s.modalCloseText}>✕</Text>
          </TouchableOpacity>

          {!!selectedCard && (
            <>
              <Image
                source={{ uri: selectedCard.imageUri }}
                style={s.modalImage}
                resizeMode="contain"
              />
              <View style={s.modalInfo}>
                <Text style={s.modalBizName}>{selectedCard.businessName}</Text>
                {!!selectedCard.savedAt && (
                  <Text style={s.modalDate}>
                    {new Date(selectedCard.savedAt).toLocaleDateString()}
                  </Text>
                )}
                <View style={s.modalActions}>
                  {!!selectedCard.lead && (
                    <TouchableOpacity style={s.modalBtn} onPress={handleViewLead}>
                      <Text style={s.modalBtnText}>View Lead →</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={[s.modalBtn, s.modalBtnDanger]} onPress={handleDeleteCard}>
                    <Text style={[s.modalBtnText, { color: COLORS.danger }]}>Delete Image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalBtn} onPress={() => Sharing.shareAsync(selectedCard.imageUri)}>
                    <Text style={s.modalBtnText}>Share...</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  grid: { padding: 16, gap: 4 },
  tile: {
    width: TILE_SIZE, height: TILE_SIZE,
    margin: 2, borderRadius: 8, overflow: 'hidden',
    backgroundColor: COLORS.surface,
  },
  tileSelected: {
    borderWidth: 2,
    borderColor: COLORS.accent,
  },
  tileImage: { width: '100%', height: '100%' },
  tileOverlay: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 4,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  selectBadge: {
    position: 'absolute', top: 8, right: 8,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center', justifyContent: 'center',
    zIndex: 10,
  },
  selectBadgeActive: {
    backgroundColor: COLORS.accent,
  },
  selectBadgeText: {
    color: '#fff', fontSize: 16, fontWeight: '800', lineHeight: 18,
  },
  tileName: { color: '#fff', fontSize: 9, fontWeight: '600', flex: 1 },
  tileMethod: { fontSize: 10 },
  multiActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.bg,
  },
  multiActionBtn: {
    backgroundColor: COLORS.surface,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  multiActionBtnDanger: {
    backgroundColor: COLORS.surface2,
    borderColor: COLORS.danger,
  },
  multiActionBtnText: {
    color: COLORS.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  multiActionBtnTextDisabled: {
    color: COLORS.muted,
  },
  multiActionCount: {
    color: COLORS.text,
    fontSize: 12,
    fontWeight: '700',
  },
  empty: {
    color: COLORS.muted, textAlign: 'center',
    marginTop: 60, fontSize: 13, lineHeight: 20,
    paddingHorizontal: 32,
  },

  modalBg: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalClose: {
    position: 'absolute', top: 52, right: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center', justifyContent: 'center',
  },
  modalCloseText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalImage: { width: '90%', height: '55%' },
  modalInfo: {
    width: '90%', marginTop: 20,
    backgroundColor: 'rgba(19,22,30,0.97)',
    borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalBizName: { color: COLORS.text, fontSize: 17, fontWeight: '800' },
  modalDate: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalBtn: {
    flex: 1, backgroundColor: COLORS.surface2,
    borderRadius: 10, paddingVertical: 10,
    alignItems: 'center', borderWidth: 1, borderColor: COLORS.border,
  },
  modalBtnDanger: { borderColor: 'rgba(255,59,92,0.3)' },
  modalBtnText: { color: COLORS.accent, fontWeight: '700', fontSize: 13 },
});