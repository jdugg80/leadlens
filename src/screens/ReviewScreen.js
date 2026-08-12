import { useState, useEffect } from 'react';
import TargetLocationConfirmCard from '../components/TargetLocationConfirmCard';
import {
  confirmProjectedTarget,
  confirmCapturePointAsTarget,
} from '../utils/geoTargetConfirmation';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Linking,
  Image,
  ActivityIndicator,
} from 'react-native';
import GeoTargetAutoModeCard from '../components/GeoTargetAutoModeCard';
import { applyAutoTargetModeToLead } from '../utils/geoTargetAutoMode';
import TargetDistanceSelector from '../components/TargetDistanceSelector';
import { applyTargetDistanceToLead } from '../utils/applyTargetDistanceToLead';
import { applyAddressCandidateToProspect } from '../utils/leadLockUpdates';
import {
  buildProspectUpdatesFromLookup,
  normalizeContactCandidates,
  enrichBusinessWithPublicSources,
} from '../utils/enrichmentNormalizer';
import { storageBridge as AsyncStorage } from '../utils/storage';
import {
  sendIntroEmail as composeIntroEmail,
  sendOutlookEmail,
} from '../utils/emailPicker';
import {
  COLORS,
  LEADS_STORAGE_KEY,
  STATUS_OPTIONS,
  INDUSTRY_VERTICALS,
  AUTO_INTRO_KEY,
} from '../constants';
import {
  ScreenHeader,
  FieldInput,
  PrimaryButton,
  Card,
  SectionLabel,
} from '../components/UI';
import AddressRow from '../components/AddressRow';
import { screenHeight } from '../utils/responsive';
import {
  applyRequiredPlaceholders,
  findDuplicateInLeads,
  inferVertical,
  normalizeLead,
  ensureLeadCreatedAt,
  calculateLeadViability,
  matchLeadByAnyId,
  getLeadId,
} from '../utils/leadHelpers';
import {
  applyTemplate,
  buildTemplateContext,
  getIntroTemplates,
} from '../utils/templateSettings';
import { recordUserActivityEvent } from '../utils/userLearning';
import { playSoundEffect } from '../utils/soundManager';
import { logOutreachActivity, OUTREACH_TYPES, formatOutreachDate } from '../utils/outreachUtils';
import * as Contacts from 'expo-contacts';
import {
  extractSocialLinksFromWebsite,
  leadFieldsToSocialLinks,
  mergeSocialFieldsIntoLead,
  enrichMissingPOC
} from '../utils/socialEnrichment';
import { showThemedAlert } from '../components/ThemedAlert';
import { searchGooglePlacesByText, enrichMissingBusinessAddress, parseAddressComponents } from '../utils/nearbySearch';
import { getCurrentCoords } from '../utils/geoEnrich';

const GOOGLE_PLACES_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_PLACES_API_KEY;

import { getStyledMessage } from '../utils/aiPersonality';
import { upsertProspect, deleteProspect } from '../utils/backendSync';
import Constants from 'expo-constants';
import BetaTracker from '../../utils/betaTracker';

const getGoogleMapsKey = () => {
  const config = Constants?.expoConfig || Constants?.manifest || {};
  return (
    config.extra?.googlePlacesApiKey ||
    config.android?.config?.googleMaps?.apiKey ||
    GOOGLE_PLACES_API_KEY
  );
};

export default function ReviewScreen({ navigation, route }) {
  const params = route?.params || {};
  const user = params.user || {};
  const initialLead = params.lead || {};
  const editIdx = params.editIdx ?? null;

  const [lead, setLead] = useState(
    normalizeLead({
      status: STATUS_OPTIONS?.[0] || 'New',
      vertical: INDUSTRY_VERTICALS?.[0] || 'Other',
      propertyType: 'Commercial',
      ...initialLead,
    })
  );

  const [autoIntro, setAutoIntro] = useState(true);
  const [templates, setTemplates] = useState(null);
  const [imageExpanded, setImageExpanded] = useState(false);
  const [businessProfile, setBusinessProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [socialScanLoading, setSocialScanLoading] = useState(false);
  const isEditing = editIdx !== null && editIdx !== undefined;
  const [targetDistanceFields, setTargetDistanceFields] = useState({
    target_distance_key: lead?.target_distance_key || 'across_lot',
    target_distance_label: lead?.target_distance_label || 'Across Lot',
    target_distance_meters: lead?.target_distance_meters || 125,
    target_distance_source: lead?.target_distance_source || 'user_preset',
    target_distance_confirmed: lead?.target_distance_confirmed ?? true,
  });

  const [targetConfirmationFields, setTargetConfirmationFields] = useState({
    target_confirmed: !!lead?.target_confirmed,
    confirmed_target_latitude: lead?.confirmed_target_latitude ?? null,
    confirmed_target_longitude: lead?.confirmed_target_longitude ?? null,
    confirmed_target_source: lead?.confirmed_target_source || '',
    confirmed_target_note: lead?.confirmed_target_note || '',
    target_confirmed_at: lead?.target_confirmed_at || null,
    target_correction_distance_meters:
      lead?.target_correction_distance_meters ?? null,
    capture_to_confirmed_target_meters:
      lead?.capture_to_confirmed_target_meters ?? null,
    confirmed_target_error: lead?.confirmed_target_error || null,
  });

  const [targetPreviewLead, setTargetPreviewLead] = useState({
    ...lead,
    ...targetDistanceFields,
    ...targetConfirmationFields,
  });
  const [showGeoTargetAdvanced, setShowGeoTargetAdvanced] = useState(false);

  const applyTargetConfirmation = (confirmedLead = {}) => {
    setTargetConfirmationFields({
      target_confirmed: !!confirmedLead.target_confirmed,
      confirmed_target_latitude:
        confirmedLead.confirmed_target_latitude ?? null,
      confirmed_target_longitude:
        confirmedLead.confirmed_target_longitude ?? null,
      confirmed_target_source:
        confirmedLead.confirmed_target_source || '',
      confirmed_target_note:
        confirmedLead.confirmed_target_note || '',
      target_confirmed_at:
        confirmedLead.target_confirmed_at || null,
      target_correction_distance_meters:
        confirmedLead.target_correction_distance_meters ?? null,
      capture_to_confirmed_target_meters:
        confirmedLead.capture_to_confirmed_target_meters ?? null,
      confirmed_target_error:
        confirmedLead.confirmed_target_error || null,
    });

    setTargetPreviewLead((prev) => ({
      ...prev,
      ...confirmedLead,
    }));
  };

  const fetchBusinessProfile = async () => {
    if (!lead.businessName) {
      showThemedAlert('Missing Name', 'Enter a business name first to look up its profile.');
      return;
    }

    setProfileLoading(true);

    try {
      const enriched = await enrichBusinessWithPublicSources(lead, {
        photoZip: lead.photo_zip || lead.zip || null,
        locationSource: lead.location_source || null,
        locationConfidence: lead.location_confidence ?? null,
      });
      if (enriched) {
        // enriched has normalized phone/email/contacts at the top level.
        // rawLookup is just the raw sources array — don't use it for updates.
        setBusinessProfile(enriched);

        const updates = buildProspectUpdatesFromLookup(lead, enriched);
        setLead(updates);

        if (enriched.website) runBackgroundSocialScan(enriched);

        showThemedAlert('Profile Enriched', 'Business profile updated.');
      } else {
        showThemedAlert('No Results', 'No additional business info found.');
      }
    } catch (error) {
      console.error('[ReviewScreen] Enrichment failed:', error);
      BetaTracker.crash('ReviewScreen', error);
      showThemedAlert('Enrichment Error', 'Unable to look up business profile at this time.');
    } finally {
      setProfileLoading(false);
    }
  };

  const runBackgroundSocialScan = (profile) => {
    extractSocialLinksFromWebsite(profile.website, {
      deep: false,
      pocFirst: lead.pocFirst || '',
      pocLast:  lead.pocLast  || '',
    })
      .then((scanResult) => {
        if (scanResult) {
          const updates = { ...scanResult };
          if (!lead.email && scanResult.bestEmail) updates.email = scanResult.bestEmail;
          setBusinessProfile(prev => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});
  };

  useEffect(() => {
  BetaTracker.screen('ReviewScreen');
}, []);

  useEffect(() => {
    AsyncStorage.getItem(AUTO_INTRO_KEY).then((v) => {
      if (v !== null) setAutoIntro(v === 'true');
    });
    getIntroTemplates().then(setTemplates);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const buildPreview = async () => {
      const previewInput = {
        ...lead,
        ...targetDistanceFields,
        ...targetConfirmationFields,
      };

      try {
        const preview = showGeoTargetAdvanced
          ? await applyTargetDistanceToLead(previewInput, {
              key: targetDistanceFields.target_distance_key,
              label: targetDistanceFields.target_distance_label,
              distanceMeters: targetDistanceFields.target_distance_meters,
            })
          : await applyAutoTargetModeToLead(previewInput, {
              forceAuto: true,
            });

        if (!cancelled) {
          setTargetPreviewLead(preview);
        }
      } catch (err) {
        console.warn('[Review] Auto-target preview failed, using raw input:', err?.message || String(err));
        if (!cancelled) {
          setTargetPreviewLead(previewInput);
        }
      }
    };

    buildPreview();

    return () => {
      cancelled = true;
    };
  }, [lead, targetDistanceFields, targetConfirmationFields, showGeoTargetAdvanced]);

  useEffect(() => {
    const returnedFields = route?.params?.targetConfirmationFields;

    if (!returnedFields) return;

    setTargetConfirmationFields((prev) => ({
      ...prev,
      ...returnedFields,
    }));

    setLead((prev) => ({
      ...prev,
      ...(route?.params?.lead || {}),
      ...returnedFields,
    }));
  }, [route?.params?.targetConfirmationFields]);

  const update = (key, val) =>
    setLead((p) => ({
      ...p,
      [key]: key === 'propertyType' ? 'Commercial' : val,
    }));

  const cycleStatus = () => {
    const currentIndex = STATUS_OPTIONS.indexOf(lead.status);
    const nextIndex =
      currentIndex === -1 || currentIndex === STATUS_OPTIONS.length - 1
        ? 0
        : currentIndex + 1;
    update('status', STATUS_OPTIONS[nextIndex]);
  };

  const cycleVertical = () => {
    const currentIndex = INDUSTRY_VERTICALS.indexOf(lead.vertical);
    const nextIndex =
      currentIndex === -1 || currentIndex === INDUSTRY_VERTICALS.length - 1
        ? 0
        : currentIndex + 1;
    update('vertical', INDUSTRY_VERTICALS[nextIndex]);
  };

  const offerIntroOutreach = (savedLead) => {
    const name =
      [savedLead.pocFirst, savedLead.pocLast].filter(Boolean).join(' ') ||
      savedLead.businessName ||
      'them';

    const options = [];
    if (savedLead.email) {
      options.push({
        text: '✉️ Send Intro Email',
        onPress: () => sendIntro(savedLead),
      });
      options.push({
        text: '📧 Send via Outlook',
        onPress: () => sendIntroOutlook(savedLead),
      });
    }
    if (savedLead.phone) {
      options.push({
        text: '💬 Send Intro Text',
        onPress: () => sendIntroText(savedLead),
      });
    }

    options.push({
      text: 'Done',
      style: 'cancel',
      onPress: () => navigation.navigate('Dashboard', { user }),
    });

    showThemedAlert('Lead Saved', `Want to send a quick intro to ${name}?`, options);
    BetaTracker.track('feature_use', { feature: 'Review', action: 'prospect_reviewed', screen: 'ReviewScreen' });
  };

  const sendIntro = async (savedLead) => {
    const currentTemplates = templates || (await getIntroTemplates());
    const context = buildTemplateContext(savedLead, user);

    await composeIntroEmail({
      to: savedLead.email,
      subject: applyTemplate(currentTemplates.emailSubject, context),
      body: applyTemplate(currentTemplates.emailBody, context),
    });

    recordUserActivityEvent('intro_email_sent', {
      prospect_id: savedLead.id,
      zip_code: savedLead.zip,
      business_type: savedLead.vertical || savedLead.industry || savedLead.businessType || null,
    }).catch(() => {});

    navigation.navigate('Dashboard', { user });
  };

  const sendIntroOutlook = async (savedLead) => {
    const currentTemplates = templates || (await getIntroTemplates());
    const context = buildTemplateContext(savedLead, user);

    await sendOutlookEmail({
      to: savedLead.email,
      subject: applyTemplate(currentTemplates.emailSubject, context),
      body: applyTemplate(currentTemplates.emailBody, context),
    });

    recordUserActivityEvent('intro_email_sent', {
      prospect_id: savedLead.id,
      zip_code: savedLead.zip,
      business_type: savedLead.vertical || savedLead.industry || savedLead.businessType || null,
      method: 'outlook'
    }).catch(() => {});

    navigation.navigate('Dashboard', { user });
  };

  const sendIntroText = async (savedLead) => {
    try {
      const currentTemplates = templates || (await getIntroTemplates());
      const context = buildTemplateContext(savedLead, user);
      const msg = encodeURIComponent(
        applyTemplate(currentTemplates.smsBody, context)
      );
      const phone = String(savedLead.phone || '').replace(/\D/g, '');
      await Linking.openURL(`sms:${phone}?body=${msg}`);
      recordUserActivityEvent('intro_text_sent', {
        prospect_id: savedLead.id,
        zip_code: savedLead.zip,
        business_type: savedLead.vertical || savedLead.industry || savedLead.businessType || null,
      }).catch(() => {});
    } catch {
      showThemedAlert('Could not open messaging app');
    } finally {
      navigation.navigate('Dashboard', { user });
    }
  };
const persistLead = async (ignoreDuplicate = false) => {
    // Read through storageBridge so we get the reconciled MMKV + AsyncStorage value.
    let leads = [];
    try {
      const parsed = await AsyncStorage.getJSON(LEADS_STORAGE_KEY, []);
      if (Array.isArray(parsed)) leads = parsed;
      console.log('[Review] Read', leads.length, 'existing leads');
    } catch (e) {
      console.warn('[Review] leads read failed:', e.message);
    }

    const baseNormalized = applyRequiredPlaceholders({
      ...normalizeLead({ ...lead, propertyType: 'Commercial' }),
      ...inferVertical(lead),
      ...targetDistanceFields,
      ...targetConfirmationFields,
      reviewed: true,
      id: lead.id || `lead_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      repName: user.repName,
      employeeNum: user.employeeNum,
      branchNum: user.branchNum,
      updatedAt: new Date().toISOString(),
    });

    const normalized = showGeoTargetAdvanced
      ? await applyTargetDistanceToLead(baseNormalized, {
          key: targetDistanceFields.target_distance_key,
          label: targetDistanceFields.target_distance_label,
          distanceMeters: targetDistanceFields.target_distance_meters,
        })
      : await applyAutoTargetModeToLead(baseNormalized, {
          forceAuto: true,
        });

    if (!isEditing) {
      const duplicate = findDuplicateInLeads(normalized, leads);

      if (duplicate && !ignoreDuplicate) {
        showThemedAlert(
          duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate',
          `${normalized.businessName || 'This lead'} appears to already be in your queue because of ${duplicate.reason}.`,
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Keep Anyway', onPress: () => persistLead(true) },
          ]
        );
        return;
      }

      const initialLead = ensureLeadCreatedAt({
        ...normalized,
        savedAt: new Date().toISOString(),
        collectedAt: new Date().toISOString(),
        queueStatus: 'new',
        queueSortGroup: 0,
        duplicateWarning: duplicate
          ? `${duplicate.confidence === 'high' ? 'Likely duplicate' : 'Possible duplicate'}: ${duplicate.reason}`
          : '',
      });
      const newLead = { ...initialLead, ...calculateLeadViability(initialLead) };
      leads.push(newLead);

      recordUserActivityEvent('prospect_added', {
        prospect_id: newLead.id,
        zip: newLead.zip,
        business_type: newLead.vertical || newLead.industry || newLead.businessType,
        source_type: newLead.captureMethod
      }).catch(() => {});
    } else {
      const baseLead = ensureLeadCreatedAt({
        ...normalized,
        createdAt: lead.createdAt || lead.savedAt || lead.capturedAt || lead.created_at_client || new Date().toISOString(),
        savedAt: lead.savedAt || new Date().toISOString(),
        reviewedAt: new Date().toISOString(),
        lastEditedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        queueStatus: 'reviewed',
        queueSortGroup: 1,
      });

      // Find actual position in raw storage array by unique ID.
      // Uses getLeadId() which checks id, leadId, queueId, createdAt, etc.
      let storageIdx = matchLeadByAnyId(leads, lead);

      // If ID match fails, try matching by business name + zip as a heuristic
      if (storageIdx === -1 && lead.businessName) {
        storageIdx = leads.findIndex(l =>
          l.businessName &&
          l.businessName.toLowerCase().trim() === String(lead.businessName).toLowerCase().trim() &&
          (l.zip || '') === (lead.zip || '')
        );
      }

      if (storageIdx !== -1) {
        leads.splice(storageIdx, 1);
      }

      // Always push the updated lead to the end of the array so it moves to the "bottom"
      leads.push({ ...baseLead, ...calculateLeadViability(baseLead) });
    }

    // Write through storageBridge so both MMKV and AsyncStorage stay in sync.
    await AsyncStorage.setJSON(LEADS_STORAGE_KEY, leads);

    // AUTO-SYNC to Supabase
    try {
      const supaRaw = await AsyncStorage.getItem('@leadlens_supabase_settings');
      const settings = supaRaw ? JSON.parse(supaRaw) : {};
      const savedLead = leads[leads.length - 1];
      const syncResult = await upsertProspect(savedLead, user, settings);
      if (!syncResult?.ok) {
        console.warn('[Review] Auto-sync issue (saved locally):', syncResult?.reason || 'unknown');
        if (isEditing) {
          showThemedAlert('Sync Issue', `Saved locally, but could not sync to the cloud: ${syncResult?.reason || 'unknown error'}. Your data is safe and will sync later.`);
        }
      } else {
        console.log('[Review] Auto-sync successful for:', savedLead.businessName);
      }
    } catch (err) {
      console.warn('[Review] Auto-sync error (saved locally):', err.message);
    }

    // Fire-and-forget enrichment for manual entries — runs in background after save
    if (normalized.captureMethod === 'manual' && normalized.businessName) {
      const enrichmentLead = { ...normalized };
      enrichBusinessWithPublicSources(enrichmentLead, {
        photoZip: normalized.zip || null,
        locationSource: 'manual_entry',
        locationConfidence: null,
      }).then(async (enriched) => {
        if (!enriched) return;
        try {
          const merged = buildProspectUpdatesFromLookup(enrichmentLead, enriched);
          const currentLeads = await AsyncStorage.getJSON(LEADS_STORAGE_KEY, leads);
          const updatedLeads = (Array.isArray(currentLeads) ? currentLeads : leads).map(l =>
            (l.id && l.id === merged.id) || (l.businessName === merged.businessName && l.zip === merged.zip)
              ? { ...l, ...merged }
              : l
          );
          AsyncStorage.setJSON(LEADS_STORAGE_KEY, updatedLeads).catch((err) =>
            console.warn('[Review] Failed to persist background enrichment updates:', err)
          );
        } catch (e) {
          console.warn('[Review] Background enrichment merge failed:', e.message);
        }
      }).catch((e) => {
        console.warn('[Review] Background enrichment failed:', e.message);
      });
    }

    // Soft confirmation sound after a successful save
    playSoundEffect('prospect-added').catch(() => {});

    if (!isEditing) {
      const msg = await getStyledMessage('prospectAdded');
      if (msg) {
        showThemedAlert('Prospect Saved', msg);
      }
    }

    const hasContact = !!(normalized.email || normalized.phone);
    if (!isEditing && hasContact && autoIntro) {
      offerIntroOutreach(normalized);
    } else {
      navigation.navigate('Dashboard', { user });
    }
  };

  const saveToContacts = async () => {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      showThemedAlert('Permission required', 'Please allow contacts access to save this prospect.');
      return;
    }

      const phoneNumbers = lead.phone
        ? [{ label: 'Work', number: lead.phone }]
        : [];
      const emails = lead.email
        ? [{ label: 'Work', email: lead.email }]
        : [];

      const contact = {
        [Contacts.Fields.FirstName]: lead.pocFirst || '',
        [Contacts.Fields.LastName]: lead.pocLast || '',
        [Contacts.Fields.Company]: lead.businessName || '',
        [Contacts.Fields.PhoneNumbers]: phoneNumbers,
        [Contacts.Fields.Emails]: emails,
        [Contacts.Fields.Addresses]: (lead.streetName || lead.city)
          ? [{
              label: 'Work',
              street: [
                [lead.streetNumber, lead.streetName].filter(Boolean).join(' '),
                lead.addressLine2
              ].filter(Boolean).join(', '),
              city: lead.city || '',
              region: lead.state || '',
              postalCode: lead.zip || '',
              country: 'US',
            }]
          : [],
      };

    try {
      await Contacts.addContactAsync(contact);
      recordUserActivityEvent('contact_created', {
        prospect_id: lead.id,
        zip: lead.zip,
        business_type: lead.vertical || lead.industry || lead.businessType
      }).catch(() => {});
      showThemedAlert('Saved to Contacts', `${lead.businessName || [lead.pocFirst, lead.pocLast].filter(Boolean).join(' ') || 'Prospect'} has been added to your contacts.`);
    } catch (err) {
    BetaTracker.crash('ReviewScreen', err);
      playSoundEffect('error').catch(() => {});
      showThemedAlert('Could not save contact', err.message || 'Please try again.');
    }
  };

  const handleDelete = async () => {
    if (!isEditing) return;

    showThemedAlert('Delete Lead', 'Remove this lead from the queue?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          recordUserActivityEvent('prospect_deleted', {
            prospect_id: lead.id,
            zip: lead.zip,
            business_type: lead.vertical || lead.industry || lead.businessType
          }).catch(() => {});

          // AUTO-SYNC Delete
          try {
            const supaRaw = await AsyncStorage.getItem('@leadlens_supabase_settings');
            const settings = supaRaw ? JSON.parse(supaRaw) : {};
            await deleteProspect(lead.id, settings);
          } catch (err) {
            console.warn('[Review] Auto-sync delete failed:', err.message);
          }

          navigation.navigate('Dashboard', { user });
        },
      },
    ]);
  };

  const currentSocialLinks = leadFieldsToSocialLinks(lead);

  const handleScanWebsiteSocials = async () => {
    if (!lead.website) {
      showThemedAlert('Website needed', 'Add the company website before scanning for social links.');
      return;
    }

    setSocialScanLoading(true);
    try {
      const result = await extractSocialLinksFromWebsite(lead.website, { deep: true });
      const foundCount = Object.keys(result.socialLinks || {}).length;
      setLead((prev) => mergeSocialFieldsIntoLead(prev, result));
      showThemedAlert(
        foundCount ? 'Social links found' : 'No social links found',
        foundCount
          ? `Found ${foundCount} social profile link(s) from the company website.`
          : 'No public social links were found on the homepage, common pages, or sitemap. Some sites hide these behind JavaScript or do not list them.'
      );
    } catch (err) {
    BetaTracker.crash('ReviewScreen', err);
      playSoundEffect('error').catch(() => {});
      showThemedAlert('Scan failed', err?.message || 'Could not scan this website.');
    } finally {
      setSocialScanLoading(false);
    }
  };

  const applyBusinessProfileSocials = () => {
    if (!businessProfile?.socialLinks) return;
    setLead((prev) => mergeSocialFieldsIntoLead(prev, businessProfile));
  };

  const contactCandidatesNormalized = normalizeContactCandidates(
    lead?.contactCandidates?.length
      ? { contacts: lead.contactCandidates }
      : lead?.enrichment?.rawLookup || lead?.enrichment || lead
  );

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScreenHeader
        title={isEditing ? 'Edit Prospect' : 'Review Prospect'}
        badge={lead.captureMethod === 'image' ? 'AI EXTRACTED' : 'MANUAL'}
        onBack={() => navigation.goBack()}
      />

      <ScrollView
        style={s.scroll}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {!!lead.imageUri && (
          <TouchableOpacity
            style={s.cardImageWrap}
            onPress={() => setImageExpanded(prev => !prev)}
            activeOpacity={0.85}
          >
            <Image
              source={{ uri: lead.imageUri }}
              style={[s.cardImage, imageExpanded && s.cardImageExpanded]}
              resizeMode="contain"
            />
            <Text style={s.cardImageHint}>
              {imageExpanded ? 'Tap to collapse' : 'Tap to expand captured image'}
            </Text>
          </TouchableOpacity>
        )}

        {!!lead.duplicateWarning && (
          <View style={s.warningBanner}>
            <Text style={s.warningText}>{String(lead.duplicateWarning)}</Text>
          </View>
        )}

        {(lead.locationSource ||
          lead.locationNeedsReview ||
          lead.ocrSummary ||
          (lead.reviewLabels || []).length > 0) && (
          <Card>
            <Text style={s.infoTitle}>Capture Intelligence</Text>

            {(lead.reviewLabels || []).length > 0 && (
              <Text style={s.infoText}>
                Labels: {(lead.reviewLabels || []).map(String).join(' • ')}
              </Text>
            )}

            {!!lead.captureSourceType && (
              <Text style={s.infoText}>
                Source-aware type: {String(lead.captureSourceType)}
              </Text>
            )}

            {!!lead.locationSource && (
              <Text style={s.infoText}>
                Location source: {String(lead.locationSource)}
              </Text>
            )}

            {!!lead.locationConfidence && (
              <Text style={s.infoText}>
                Confidence: {String(lead.locationConfidence)}
              </Text>
            )}

            {!!lead.matchedDisplayName && (
              <Text style={s.infoText}>
                Matched place: {String(lead.matchedDisplayName)}
              </Text>
            )}

            {!!lead.locationNeedsReview && (
              <Text style={s.infoWarn}>
                Needs Review: address or state should be confirmed before relying on this lead.
              </Text>
            )}

            {(lead.reviewWarnings || []).map((warning, idx) => (
              <Text key={idx} style={s.infoWarn}>
                {String(warning)}
              </Text>
            ))}

            {!!lead.ocrSummary && (
              <Text style={s.infoText}>
                OCR clues: {String(lead.ocrSummary)}
              </Text>
            )}
          </Card>
        )}

        <SectionLabel>Business Info</SectionLabel>
        <Card>
          <FieldInput
            label="Business Name"
            value={lead.businessName}
            onChangeText={(v) => update('businessName', v)}
          />
          <View style={[s.row, { marginTop: 10 }]}>
            <FieldInput
              label="POC First Name"
              value={lead.pocFirst}
              onChangeText={(v) => update('pocFirst', v)}
            />
            <View style={{ width: 10 }} />
            <FieldInput
              label="POC Last Name"
              value={lead.pocLast}
              onChangeText={(v) => update('pocLast', v)}
            />
          </View>
        </Card>

        <SectionLabel>Contact</SectionLabel>
        <Card>
          <FieldInput
            label="Phone"
            value={lead.phone}
            onChangeText={(v) => update('phone', v)}
            keyboardType="phone-pad"
          />
          <View style={{ marginTop: 10 }}>
            <FieldInput
              label="Email"
              value={lead.email}
              onChangeText={(v) => update('email', v)}
              autoCapitalize="none"
              keyboardType="email-address"
            />
          </View>
        </Card>

        <SectionLabel>Online Presence</SectionLabel>
        <Card>
          <FieldInput
            label="Company Website"
            value={lead.website}
            onChangeText={(v) => update('website', v)}
            autoCapitalize="none"
            keyboardType="url"
          />
          <TouchableOpacity
            style={[s.socialScanBtn, socialScanLoading && { opacity: 0.65 }]}
            onPress={handleScanWebsiteSocials}
            disabled={socialScanLoading}
          >
            <Text style={s.socialScanBtnText}>{socialScanLoading ? 'Scanning Website...' : 'Scan Website for Social Links'}</Text>
          </TouchableOpacity>
          {!!lead.socialSource && (
            <Text style={s.socialMeta}>Source: {lead.socialSource} · Confidence: {lead.socialConfidence || 'none'}</Text>
          )}
          {Object.keys(currentSocialLinks).length > 0 && (
            <View style={s.socialWrap}>
              <Text style={s.hoursTitle}>Saved Social Links:</Text>
              <View style={s.socialRow}>
                {Object.entries(currentSocialLinks).map(([key, { url, icon, label }]) => (
                  <TouchableOpacity
                    key={key}
                    style={s.socialBtn}
                    onPress={() => Linking.openURL(url).catch(() => {})}
                  >
                    <Text style={s.socialIcon}>{icon}</Text>
                    <Text style={s.socialLabel}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
        </Card>

        <SectionLabel>Address</SectionLabel>
        <Card>
          <View style={s.row}>
            <View style={{ width: 80 }}>
              <FieldInput
                label="St #"
                value={lead.streetNumber}
                onChangeText={(v) => update('streetNumber', v)}
              />
            </View>
            <View style={{ width: 10 }} />
            <FieldInput
              label="Street Name"
              value={lead.streetName}
              onChangeText={(v) => update('streetName', v)}
            />
          </View>

          <View style={{ marginTop: 10 }}>
            <FieldInput
              label="Address Line 2"
              value={lead.addressLine2}
              onChangeText={(v) => update('addressLine2', v)}
            />
          </View>

          <AddressRow
            renderField={(props) => <FieldInput {...props} />}
            city={lead.city}
            onCityChange={(v) => update('city', v)}
            state={lead.state}
            onStateChange={(v) => update('state', String(v).toUpperCase())}
            zip={lead.zip}
            onZipChange={(v) => update('zip', v)}
          />
        </Card>

        <SectionLabel>Classification</SectionLabel>
        <Card>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.pickerLabel}>Status</Text>
              <TouchableOpacity
                style={[s.pickerWrap, s.selectorBtn]}
                onPress={cycleStatus}
                activeOpacity={0.85}
              >
                <Text style={s.selectorText}>
                  {String(lead.status || STATUS_OPTIONS?.[0] || 'New')}
                </Text>
                <Text style={s.selectorHint}>Tap to change</Text>
              </TouchableOpacity>
            </View>

            <View style={{ width: 10 }} />

            <View style={{ flex: 1 }}>
              <Text style={s.pickerLabel}>Property Type</Text>
              <View style={[s.pickerWrap, s.staticValueWrap]}>
                <Text style={s.selectorText}>Commercial</Text>
              </View>
            </View>
          </View>

          <View style={{ marginTop: 10 }}>
            <Text style={s.pickerLabel}>Industry Vertical</Text>
            <TouchableOpacity
              style={[s.pickerWrap, s.selectorBtn]}
              onPress={cycleVertical}
              activeOpacity={0.85}
            >
              <Text style={s.selectorText}>
                {String(lead.vertical || INDUSTRY_VERTICALS?.[0] || 'Other')}
              </Text>
              <Text style={s.selectorHint}>Tap to change</Text>
            </TouchableOpacity>
          </View>
        </Card>

        {!isEditing && (
          <>
            <SectionLabel>Intro Settings</SectionLabel>
            <Card>
              <View style={s.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={s.toggleLabel}>Auto-Send Introduction</Text>
                  <Text style={s.toggleSub}>
                    {autoIntro
                      ? 'Intro prompt shows automatically after saving'
                      : 'Save quietly and decide later'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[s.toggle, autoIntro && s.toggleOn]}
                  onPress={async () => {
                    const next = !autoIntro;
                    setAutoIntro(next);
                    await AsyncStorage.setItem(AUTO_INTRO_KEY, String(next));
                  }}
                >
                  <View style={[s.toggleThumb, autoIntro && s.toggleThumbOn]} />
                </TouchableOpacity>
              </View>
            </Card>
          </>
        )}

        {isEditing && (
          <>
            <SectionLabel>Business Profile</SectionLabel>
            <Card>
              {!businessProfile && !profileLoading && (
                <TouchableOpacity style={s.profileLookupBtn} onPress={fetchBusinessProfile}>
                  <Text style={s.profileLookupIcon}>🔍</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={s.profileLookupTitle}>Look Up Business Profile</Text>
                    <Text style={s.profileLookupSub}>Fetch hours, rating, phone & website from Google</Text>
                  </View>
                  <Text style={s.profileLookupArrow}>→</Text>
                </TouchableOpacity>
              )}
              {profileLoading && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 }}>
                  <ActivityIndicator size="small" color={COLORS.accent} />
                  <Text style={s.profileLookupSub}>Looking up business...</Text>
                </View>
              )}
              {!!businessProfile && (
                <View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Text style={s.profileName}>{businessProfile.name}</Text>
                    <TouchableOpacity onPress={() => setBusinessProfile(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={{ color: COLORS.muted, fontSize: 14 }}>↺</Text>
                    </TouchableOpacity>
                  </View>
                  {!!businessProfile.business_status && (
                    <Text style={[s.profileStatus, { color: businessProfile.business_status === 'OPERATIONAL' ? COLORS.success : COLORS.accent2 }]}>
                      {businessProfile.business_status === 'OPERATIONAL' ? '● Open' : '● ' + businessProfile.business_status}
                    </Text>
                  )}
                  {!!businessProfile.rating && (
                    <Text style={s.profileDetail}>⭐ {businessProfile.rating} ({businessProfile.user_ratings_total} reviews)</Text>
                  )}
                  {!!(businessProfile.formatted_phone_number || businessProfile.phone) && (
                    <TouchableOpacity onPress={() => { update('phone', businessProfile.formatted_phone_number || businessProfile.phone); }}>
                      <Text style={s.profileDetail}>📞 {businessProfile.formatted_phone_number || businessProfile.phone} <Text style={{ color: COLORS.accent, fontSize: 11 }}>tap to apply</Text></Text>
                    </TouchableOpacity>
                  )}
                  {!!businessProfile.website && (
                    <TouchableOpacity onPress={() => { update('website', businessProfile.website); }}>
                      <Text style={s.profileDetail} numberOfLines={1}>🌐 {businessProfile.website} <Text style={{ color: COLORS.accent, fontSize: 11 }}>tap to apply</Text></Text>
                    </TouchableOpacity>
                  )}
                  {!!businessProfile.opening_hours?.weekday_text?.length && (
                    <View style={s.hoursWrap}>
                      <Text style={s.hoursTitle}>Hours:</Text>
                      {businessProfile.opening_hours.weekday_text.map((h, i) => (
                        <Text key={i} style={s.hoursLine}>{h}</Text>
                      ))}
                    </View>
                  )}

                  {/* Phone candidates */}
                  {!!(businessProfile.phoneCandidates?.length > 0) && (
                    <View style={s.emailWrap}>
                      <Text style={s.hoursTitle}>📞 Phone Candidates:</Text>
                      <Text style={s.emailSub}>Tap to apply to lead</Text>
                      {businessProfile.phoneCandidates.map((item, i) => (
                        <TouchableOpacity
                          key={`${item.phone}-${i}`}
                          style={[s.emailRow, lead.phone === item.phone && s.emailRowActive]}
                          onPress={() => update('phone', item.phone)}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[s.emailText, lead.phone === item.phone && s.emailTextActive]} numberOfLines={1}>
                              {item.phone}
                            </Text>
                            {!!item.source && <Text style={{ color: COLORS.muted, fontSize: 9 }}>Source: {item.source}</Text>}
                          </View>
                          {lead.phone === item.phone && (
                            <Text style={s.emailApplied}>Applied</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Email candidates */}
                  {!!(businessProfile.emailCandidates?.length > 0) && (
                    <View style={s.emailWrap}>
                      <Text style={s.hoursTitle}>📧 Email Candidates:</Text>
                      <Text style={s.emailSub}>Tap to apply to lead</Text>
                      {businessProfile.emailCandidates.map((email, i) => (
                        <TouchableOpacity
                          key={email}
                          style={[s.emailRow, String(lead.email || '').toLowerCase().trim() === String(email).toLowerCase().trim() && s.emailRowActive]}
                          onPress={() => update('email', String(email).toLowerCase().trim())}
                        >
                          <Text style={[s.emailText, String(lead.email || '').toLowerCase().trim() === String(email).toLowerCase().trim() && s.emailTextActive]} numberOfLines={1}>
                            {i === 0 && businessProfile.discoveredEmails?.includes(email) ? '✓ ' : '◦ '}
                            {email}
                          </Text>
                          {String(lead.email || '').toLowerCase().trim() === String(email).toLowerCase().trim() && (
                            <Text style={s.emailApplied}>Applied</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}

                  {/* Discovered POC candidates */}
                  <View style={s.emailWrap}>
                    <Text style={s.hoursTitle}>👤 Discovered Contacts:</Text>
                    <Text style={s.emailSub}>ContactSignal Enrichment</Text>

                    {(!contactCandidatesNormalized || contactCandidatesNormalized.length === 0) && (
                      <View style={{ padding: 16, backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 10, marginTop: 8, alignItems: 'center' }}>
                        <Text style={{ color: COLORS.muted, fontSize: 13, textAlign: 'center' }}>No verified contacts found yet.{"\n"}Try Look Up Business Information again or add one manually.</Text>
                      </View>
                    )}

                    {contactCandidatesNormalized && contactCandidatesNormalized.map((poc, i) => (
                      <View key={`${poc.id}-${i}`} style={{ marginTop: 12, marginBottom: 12, padding: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10, borderWidth: 1, borderColor: COLORS.border }}>
                        <Text style={{ color: COLORS.text, fontWeight: '800', fontSize: 14 }}>
                          {poc.name || 'Unknown contact'} <Text style={{ color: COLORS.accent, fontWeight: '600' }}>{poc.title ? `(${poc.title})` : '(No title found)'}</Text>
                        </Text>

                        <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 4 }}>📞 {poc.phone || 'No phone found'}</Text>
                        <Text style={{ color: COLORS.muted, fontSize: 12, marginTop: 2 }}>✉️ {poc.email || 'No email found'}</Text>

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
                          <Text style={{ color: COLORS.muted, fontSize: 11 }}>Source: {poc.source || 'Lookup'}</Text>
                          {!!poc.confidence && (
                            <Text style={{ color: String(poc.confidence).toLowerCase() === 'high' ? COLORS.success : String(poc.confidence).toLowerCase() === 'medium' ? '#f5b041' : COLORS.muted, fontSize: 11, fontWeight: '700' }}>
                              {String(poc.confidence).toUpperCase()} CONFIDENCE
                            </Text>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', marginTop: 12, gap: 10 }}>
                          <TouchableOpacity
                            style={{ flex: 1, backgroundColor: (lead.pocFirst && poc.name?.includes(lead.pocFirst)) ? COLORS.surface2 : COLORS.accent, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' }}
                            onPress={() => {
                              const nameParts = (poc.name || '').split(' ');
                              const first = nameParts[0] || '';
                              const last = nameParts.slice(1).join(' ') || '';
                              setLead(prev => ({
                                ...prev,
                                pocFirst: first,
                                pocLast: last,
                                title: poc.title || prev.title,
                                phone: poc.phone || prev.phone,
                                email: poc.email || prev.email,
                              }));
                            }}
                            disabled={!!(lead.pocFirst && poc.name?.includes(lead.pocFirst))}
                          >
                            <Text style={{ color: (lead.pocFirst && poc.name?.includes(lead.pocFirst)) ? COLORS.muted : '#000', fontSize: 12, fontWeight: '800' }}>
                              {(lead.pocFirst && poc.name?.includes(lead.pocFirst)) ? '✓ Applied' : 'Use Contact'}
                            </Text>
                          </TouchableOpacity>

                          {!!poc.sourceUrl && (
                            <TouchableOpacity
                              style={{ flex: 1, backgroundColor: COLORS.surface2, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center', justifyContent: 'center' }}
                              onPress={() => Linking.openURL(poc.sourceUrl).catch(()=>{})}
                            >
                              <Text style={{ color: COLORS.textDim, fontSize: 12, fontWeight: '700' }}>View Source</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ))}
                  </View>

                  {/* Social media links */}
                  {!!businessProfile.socialLinks && Object.keys(businessProfile.socialLinks).length > 0 && (
                    <View style={s.socialWrap}>
                      <Text style={s.hoursTitle}>Social Media:</Text>
                      {!!businessProfile.socialSource && (
                        <Text style={s.socialMeta}>Source: {businessProfile.socialSource} · Confidence: {businessProfile.socialConfidence || 'none'}</Text>
                      )}
                      <View style={s.socialRow}>
                        {Object.entries(businessProfile.socialLinks).map(([key, { url, icon, label }]) => (
                          <TouchableOpacity
                            key={key}
                            style={s.socialBtn}
                            onPress={() => Linking.openURL(url).catch(() => {})}
                          >
                            <Text style={s.socialIcon}>{icon}</Text>
                            <Text style={s.socialLabel}>{label}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                      <TouchableOpacity style={s.socialApplyBtn} onPress={applyBusinessProfileSocials}>
                        <Text style={s.socialApplyText}>Apply Social Links to Lead</Text>
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Enrichment confidence */}
                  {!!businessProfile.enrichment_confidence && (
                    <View style={{ marginTop: 12, padding: 10, backgroundColor: 'rgba(0,201,255,0.05)', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(0,201,255,0.2)' }}>
                      <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '700', marginBottom: 4 }}>ENRICHMENT CONFIDENCE</Text>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: COLORS.muted, fontSize: 11 }}>
                          Score: {businessProfile.enrichment_confidence_score ?? '—'}
                        </Text>
                        <Text style={{
                          color: businessProfile.enrichment_confidence === 'High' ? COLORS.success : businessProfile.enrichment_confidence === 'Medium' ? '#f5b041' : COLORS.accent2,
                          fontSize: 11, fontWeight: '700'
                        }}>
                          {businessProfile.enrichment_confidence?.toUpperCase()}
                        </Text>
                      </View>
                      {!!businessProfile.business_match_label && (
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                          <Text style={{ color: COLORS.muted, fontSize: 11 }}>Business Match:</Text>
                          <Text style={{
                            color: businessProfile.business_match_label === 'High' ? COLORS.success : businessProfile.business_match_label === 'Medium' ? '#f5b041' : COLORS.accent2,
                            fontSize: 11, fontWeight: '700'
                          }}>
                            {businessProfile.business_match_label?.toUpperCase()}
                          </Text>
                        </View>
                      )}
                      {businessProfile.enrichment_confidence === 'Low' || businessProfile.enrichment_confidence === 'Missing' ? (
                        <Text style={{ color: COLORS.accent2, fontSize: 10, fontWeight: '600', marginTop: 4 }}>
                          ⚠ Low-confidence match. Review before export.
                        </Text>
                      ) : null}
                      {!!businessProfile.enrichment_notes && (
                        <Text style={{ color: COLORS.muted, fontSize: 9, marginTop: 4 }}>{businessProfile.enrichment_notes}</Text>
                      )}
                    </View>
                  )}

                  {/* Property details */}
                  {!!businessProfile.enrichment?.propertyRisk?.property && (() => {
                    const prop = businessProfile.enrichment.propertyRisk.property;
                    const src = lead?.property_records_source ?? businessProfile.enrichment?.propertyRisk?.dataSource ?? null;
                    const isHcad = src === 'hcad';
                    const displayAge = prop.yearBuilt || prop.buildingAge || prop.estimatedAge;
                    const ageLabel = prop.yearBuilt ? `Built ${prop.yearBuilt}` : prop.buildingAge ? `${prop.buildingAge} yrs old` : prop.estimatedAge ? `~${prop.estimatedAge} yrs old (est.)` : null;
                    return (
                      <View style={{ marginTop: 12, padding: 10, backgroundColor: isHcad ? 'rgba(46,204,113,0.05)' : 'rgba(241,196,15,0.05)', borderRadius: 8, borderWidth: 1, borderColor: isHcad ? 'rgba(46,204,113,0.2)' : 'rgba(241,196,15,0.2)' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                          <Text style={{ color: COLORS.accent, fontSize: 11, fontWeight: '700' }}>PROPERTY DETAILS</Text>
                          <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: isHcad ? 'rgba(46,204,113,0.15)' : 'rgba(241,196,15,0.15)' }}>
                            <Text style={{ color: isHcad ? COLORS.success : '#f1c40f', fontSize: 9, fontWeight: '700' }}>
                              {isHcad ? 'HCAD VERIFIED' : 'AI ESTIMATED'}
                            </Text>
                          </View>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                          {!!ageLabel && (
                            <View>
                              <Text style={{ color: COLORS.muted, fontSize: 9 }}>Age</Text>
                              <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '600' }}>{ageLabel}</Text>
                            </View>
                          )}
                          {!!prop.squareFeet && (
                            <View>
                              <Text style={{ color: COLORS.muted, fontSize: 9 }}>Square Feet</Text>
                              <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '600' }}>{Number(prop.squareFeet).toLocaleString()}</Text>
                            </View>
                          )}
                          {!!prop.stories && (
                            <View>
                              <Text style={{ color: COLORS.muted, fontSize: 9 }}>Stories</Text>
                              <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '600' }}>{prop.stories}</Text>
                            </View>
                          )}
                          {!!prop.propertyType && prop.propertyType !== 'COMMERCIAL' && (
                            <View>
                              <Text style={{ color: COLORS.muted, fontSize: 9 }}>Type</Text>
                              <Text style={{ color: COLORS.text, fontSize: 11, fontWeight: '600' }}>{prop.propertyType}</Text>
                            </View>
                          )}
                        </View>
                        {!!prop.landUse && (
                          <Text style={{ color: COLORS.muted, fontSize: 10, marginTop: 4 }}>Land Use: {prop.landUse}</Text>
                        )}
                        {!isHcad && (
                          <Text style={{ color: '#f1c40f', fontSize: 9, fontWeight: '600', marginTop: 4 }}>
                            Estimate only — not from county records. Verify before sharing with homeowner.
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                </View>
              )}
            </Card>
          </>
        )}

        {isEditing && (
          <>
            <SectionLabel>Outreach History</SectionLabel>
            <Card>
              <View style={s.outreachBtnRow}>
                {Object.values(OUTREACH_TYPES).map(type => (
                  <TouchableOpacity
                    key={type.key}
                    style={s.outreachBtn}
                    onPress={async () => {
                      if (!lead.id) return;
                      await logOutreachActivity(lead.id, type.key);
                      // Refresh lead state to show new entry
                      const leads_ = await AsyncStorage.getJSON(LEADS_STORAGE_KEY, []);
                      const updated = leads_.find(l => l.id === lead.id);
                      if (updated) setLead(prev => ({ ...prev, outreachHistory: updated.outreachHistory, lastOutreachAt: updated.lastOutreachAt }));
                    }}
                  >
                    <Text style={s.outreachBtnIcon}>{type.icon}</Text>
                    <Text style={s.outreachBtnLabel}>{type.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {Array.isArray(lead.outreachHistory) && lead.outreachHistory.length > 0 ? (
                <View style={s.historyList}>
                  {lead.outreachHistory.slice(0, 10).map((entry, idx) => {
                    const typeInfo = Object.values(OUTREACH_TYPES).find(t => t.key === entry.type);
                    return (
                      <View key={entry.id || idx} style={[s.historyItem, idx < lead.outreachHistory.slice(0, 10).length - 1 && s.historyItemBorder]}>
                        <Text style={s.historyIcon}>{typeInfo?.icon || '📋'}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={s.historyLabel}>{typeInfo?.label || entry.type}</Text>
                          {!!entry.note && <Text style={s.historyNote}>{entry.note}</Text>}
                        </View>
                        <Text style={s.historyTime}>{formatOutreachDate(entry.timestamp)}</Text>
                      </View>
                    );
                  })}
                </View>
              ) : (
                <Text style={s.historyEmpty}>No outreach logged yet. Tap an action above to record it.</Text>
              )}
            </Card>
          </>
        )}

        <SectionLabel>GeoTarget</SectionLabel>
        <GeoTargetAutoModeCard
          lead={targetPreviewLead}
          advancedVisible={showGeoTargetAdvanced}
          onToggleAdvanced={() => setShowGeoTargetAdvanced((prev) => !prev)}
        />

        {showGeoTargetAdvanced && (
          <>
            <TargetDistanceSelector
              valueKey={targetDistanceFields.target_distance_key}
              valueMeters={targetDistanceFields.target_distance_meters}
              onChange={(fields) => {
                setTargetDistanceFields({
                  ...fields,
                  target_distance_source: 'user_preset',
                  target_distance_confirmed: true,
                });
              }}
            />

            <TargetLocationConfirmCard
              lead={targetPreviewLead}
              onConfirmProjection={() => {
                const confirmed = confirmProjectedTarget(targetPreviewLead);
                applyTargetConfirmation(confirmed);
              }}
              onConfirmCapturePoint={() => {
                const confirmed = confirmCapturePointAsTarget(targetPreviewLead);
                applyTargetConfirmation(confirmed);
              }}
              onClear={() => {
                setTargetConfirmationFields({
                  target_confirmed: false,
                  confirmed_target_latitude: null,
                  confirmed_target_longitude: null,
                  confirmed_target_source: null,
                  confirmed_target_note: '',
                  target_confirmed_at: null,
                  target_correction_distance_meters: null,
                  capture_to_confirmed_target_meters: null,
                  confirmed_target_error: null,
                });
              }}
              onOpenMap={() => {
                navigation.navigate('TargetMapAdjuster', {
                  user,
                  lead: targetPreviewLead,
                  editIdx,
                  returnScreen: 'Review',
                });
              }}
            />
          </>
        )}

        <PrimaryButton
          title={isEditing ? 'Update Lead ✔' : 'Save to Queue ✔'}
          onPress={() => persistLead(false)}
          style={{ marginTop: 20 }}
        />
        {(lead.phone || lead.email) && (
          <TouchableOpacity style={s.contactsBtn} onPress={saveToContacts}>
            <Text style={s.contactsBtnText}>👤 Save to Contacts</Text>
          </TouchableOpacity>
        )}

        {isEditing && (
          <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}>
            <Text style={s.deleteText}>Delete Lead</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { flex: 1, paddingHorizontal: 16 },
  row: { flexDirection: 'row' },

  // Captured image
  cardImageWrap: {
    marginTop: 16, borderRadius: 14, overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.borderLit,
    backgroundColor: COLORS.surface,
  },
  cardImage: { width: '100%', height: screenHeight * 0.19 },
  cardImageExpanded: { height: screenHeight * 0.37 },
  cardImageHint: {
    color: COLORS.muted, fontSize: 11,
    textAlign: 'center', paddingVertical: 7,
    backgroundColor: COLORS.surface2,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },

  // Duplicate warning
  warningBanner: {
    marginTop: 14, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(204,16,64,0.35)',
    backgroundColor: 'rgba(204,16,64,0.07)',
  },
  warningText: { color: COLORS.accent2, fontSize: 12, lineHeight: 18 },

  // Classification selectors — rotary/dial style
  pickerLabel: {
    fontSize: 10, fontWeight: '700', color: COLORS.label,
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
  },
  pickerWrap: {
    backgroundColor: COLORS.surface2, borderWidth: 1,
    borderColor: COLORS.border, borderRadius: 10, minHeight: 52,
    position: 'relative', overflow: 'hidden',
  },
  selectorBtn: {
    justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10,
    borderColor: COLORS.borderLit,
  },
  staticValueWrap: { justifyContent: 'center', paddingHorizontal: 14 },
  selectorText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  selectorHint: { color: COLORS.muted, fontSize: 10, marginTop: 3, letterSpacing: 0.5 },

  // Auto-intro toggle
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  toggleLabel: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  toggleSub: { color: COLORS.muted, fontSize: 12, marginTop: 4, lineHeight: 17 },
  toggle: {
    width: 52, height: 28, borderRadius: 999,
    backgroundColor: COLORS.surface2, borderWidth: 1,
    borderColor: COLORS.border, padding: 3,
  },
  toggleOn: {
    backgroundColor: 'rgba(123,63,190,0.2)',
    borderColor: 'rgba(123,63,190,0.5)',
  },
  toggleThumb: { width: 20, height: 20, borderRadius: 999, backgroundColor: COLORS.muted },
  toggleThumbOn: { backgroundColor: COLORS.purple, marginLeft: 24 },

  // Business profile
  profileLookupBtn: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  profileLookupIcon: { fontSize: 22 },
  profileLookupTitle: { color: COLORS.text, fontWeight: '700', fontSize: 14 },
  profileLookupSub: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  profileLookupArrow: { color: COLORS.accent, fontSize: 18, fontWeight: '700' },
  profileName: { color: COLORS.text, fontSize: 15, fontWeight: '800', flex: 1 },
  profileStatus: { fontSize: 12, fontWeight: '700', marginTop: 4 },
  profileDetail: { color: COLORS.textDim, fontSize: 13, marginTop: 6 },

  // Social links
  socialWrap: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  socialRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  socialBtn: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7,
    alignItems: 'center', gap: 4, flexDirection: 'row',
  },
  socialIcon: { fontSize: 14 },
  socialLabel: { color: COLORS.textDim, fontSize: 11, fontWeight: '600' },
  socialScanBtn: {
    marginTop: 12,
    backgroundColor: COLORS.surface2,
    borderWidth: 1,
    borderColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  socialScanBtnText: { color: COLORS.accent, fontWeight: '800', fontSize: 12 },
  socialMeta: { color: COLORS.muted, fontSize: 11, marginTop: 6, lineHeight: 16 },
  socialApplyBtn: {
    marginTop: 10,
    backgroundColor: COLORS.accent,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  socialApplyText: { color: '#000', fontWeight: '800', fontSize: 12 },

  // Hours
  emailWrap: {
    marginTop: 12, paddingTop: 12,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  emailSub: { color: COLORS.muted, fontSize: 10, marginBottom: 6 },
  emailRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8,
    marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  emailRowActive: {
    backgroundColor: 'rgba(0,201,255,0.1)',
    borderColor: COLORS.accent,
  },
  emailText: { color: COLORS.textDim, fontSize: 12, flex: 1 },
  emailTextActive: { color: COLORS.accent, fontWeight: '700' },
  emailApplied: {
    color: COLORS.accent, fontSize: 10, fontWeight: '800',
    marginLeft: 8,
  },
  hoursWrap: { marginTop: 10, borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 8 },
  hoursTitle: {
    color: COLORS.muted, fontSize: 10, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 4,
  },
  hoursLine: { color: COLORS.textDim, fontSize: 11, lineHeight: 18 },

  // Outreach
  outreachBtnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  outreachBtn: {
    backgroundColor: COLORS.surface2, borderWidth: 1, borderColor: COLORS.borderLit,
    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    alignItems: 'center', gap: 4, minWidth: 60,
  },
  outreachBtnIcon: { fontSize: 18 },
  outreachBtnLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },

  // Outreach history
  historyList: { borderTopWidth: 1, borderTopColor: COLORS.border, paddingTop: 4 },
  historyItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  historyItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.border },
  historyIcon: { fontSize: 16 },
  historyLabel: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  historyNote: { color: COLORS.muted, fontSize: 12, marginTop: 2 },
  historyTime: { color: COLORS.muted, fontSize: 11 },
  historyEmpty: { color: COLORS.muted, fontSize: 12, textAlign: 'center', paddingVertical: 8 },

  // Capture intelligence card
  infoTitle: { color: COLORS.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  infoText: { color: COLORS.muted, fontSize: 12, lineHeight: 18, marginBottom: 3 },
  infoWarn: { color: COLORS.accent2, fontSize: 12, lineHeight: 18, marginTop: 2 },

  // Action buttons
  contactsBtn: {
    marginTop: 10, alignItems: 'center', padding: 13,
    borderWidth: 1, borderColor: 'rgba(123,63,190,0.35)',
    borderRadius: 12, backgroundColor: 'rgba(123,63,190,0.08)',
  },
  contactsBtnText: { color: COLORS.purple, fontWeight: '700', fontSize: 14 },
  deleteBtn: { marginTop: 14, alignItems: 'center', padding: 12 },
  deleteText: { color: COLORS.danger, fontWeight: '700', fontSize: 14 },
});
