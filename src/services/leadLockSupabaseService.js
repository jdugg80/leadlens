import { supabase } from '../lib/supabase';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';
import * as ImageManipulator from 'expo-image-manipulator';

/**
 * Service to handle LeadLock server-side intelligence via Supabase.
 */
export const LeadLockSupabaseService = {
  /**
   * Uploads a capture image to Supabase Storage and creates a capture record.
   */
  async createCapture({
    imageUri,
    rawOcrText,
    location,
    heading,
    zoomLevel,
    captureType,
    deviceConfidence
  }) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // 1. Create the capture record first to get an ID
      const numericHeading = typeof heading === 'object' && heading !== null
        ? (heading.trueHeading ?? heading.magHeading ?? 0)
        : (parseFloat(heading) || 0);

      let numericZoom = 1;
      if (typeof zoomLevel === 'number') {
        numericZoom = zoomLevel;
      } else if (typeof zoomLevel === 'string') {
        numericZoom = parseFloat(zoomLevel.replace(/[^\d.]/g, '')) || 1;
      } else if (typeof zoomLevel === 'object' && zoomLevel !== null) {
        numericZoom = zoomLevel.displayZoom ?? zoomLevel.value ?? 1;
      }

      const { data: capture, error: dbError } = await supabase
        .from('leadlock_captures')
        .insert({
          user_id: user.id,
          raw_ocr_text: rawOcrText,
          latitude: location?.latitude,
          longitude: location?.longitude,
          location: location ? `POINT(${location.longitude} ${location.latitude})` : null,
          heading: numericHeading,
          zoom_level: numericZoom,
          capture_type: captureType,
          device_confidence: deviceConfidence,
          processing_status: 'pending',
          metadata: {
            raw_heading: heading,
            raw_zoom: zoomLevel,
            location_accuracy: location?.accuracy
          }
        })
        .select()
        .single();

      if (dbError) {
        console.error('[LeadLockSupabase] Capture DB insertion failed:', dbError.message, dbError.details);
        throw dbError;
      }

      // 2. Upload image to Storage
      // Path: {user_id}/{capture_id}.jpg
      const filePath = `${user.id}/${capture.id}.jpg`;

      let uploadUri = imageUri;
      try {
        // Safe resize/compress of the image before uploading to Supabase Storage
        const manipulated = await ImageManipulator.manipulateAsync(
          imageUri,
          [{ resize: { width: 1200 } }],
          { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG }
        );
        uploadUri = manipulated.uri;
      } catch (manipErr) {
        console.warn('[LeadLockSupabase] Image manipulation failed, uploading original:', manipErr);
      }

      const base64 = await FileSystem.readAsStringAsync(uploadUri, { encoding: FileSystem.EncodingType.Base64 });

      const { error: uploadError } = await supabase.storage
        .from('leadlock-captures')
        .upload(filePath, decode(base64), {
          contentType: 'image/jpeg',
          upsert: true
        });

      if (uploadError) {
        console.warn('[LeadLockSupabase] Storage Upload Error:', uploadError);
      }

      // 3. Update record with image path
      await supabase
        .from('leadlock_captures')
        .update({ image_path: filePath })
        .eq('id', capture.id);

      return capture.id;
    } catch (err) {
      console.error('[LeadLockSupabase] createCapture failed:', err);
      return null;
    }
  },

  /**
   * Triggers server-side processing and returns matches.
   */
  async processCapture(captureId) {
    try {
      const { data, error } = await supabase.functions.invoke('process-leadlock-capture', {
        body: { capture_id: captureId }
      });

      if (error) throw error;
      return data; // { ok, status, matches }
    } catch (err) {
      console.error('[LeadLockSupabase] processCapture failed:', err);
      return { ok: false, error: err.message };
    }
  },

  /**
   * Saves user feedback to improve matching.
   */
  async saveFeedback({ captureId, action, matchedId, notes }) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('leadlock_match_feedback')
        .insert({
          capture_id: captureId,
          user_id: user.id,
          action,
          matched_id: matchedId,
          feedback_notes: notes
        });

      if (error) {
        console.error('[LeadLockSupabase] Feedback insertion failed:', error.message);
        throw error;
      }
      return true;
    } catch (err) {
      console.error('[LeadLockSupabase] saveFeedback failed:', err.message);
      return false;
    }
  },

  /**
   * Adds multiple detected regions to a capture.
   */
  async addDetectedRegions(captureId, regions = []) {
    try {
      const rows = regions.map(r => ({
        capture_id: captureId,
        box_json: r.boundingBox,
        label: r.label || 'Detection',
        confidence: r.confidence || 0,
        ocr_text: r.ocrText || '',
        detected_name: r.businessName || ''
      }));

      const { error } = await supabase
        .from('leadlock_detected_regions')
        .insert(rows);

      if (error) throw error;
      return true;
    } catch (err) {
      console.error('[LeadLockSupabase] addDetectedRegions failed:', err);
      return false;
    }
  }
};
