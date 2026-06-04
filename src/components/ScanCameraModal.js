/**
 * ScanCameraModal
 * In-app camera using expo-camera's CameraView — same mechanism as LeadLock.
 * No external Android intents, no activity switching, no result delivery issues.
 *
 * Usage:
 *   <ScanCameraModal
 *     visible={cameraOpen}
 *     onCapture={(uri) => handlePhoto(uri)}
 *     onClose={() => setCameraOpen(false)}
 *   />
 */

import React, { useRef, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ActivityIndicator, Alert, Linking,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';

export default function ScanCameraModal({ visible, onCapture, onClose }) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [capturing, setCapturing] = useState(false);
  const insets = useSafeAreaInsets();

  const handleTakePhoto = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });

      // Resize + compress before handing off — prevents OOM on high-res photos
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      // Return both URI and base64 so CaptureScreen doesn't need to re-read the file
      onCapture({ uri: manipulated.uri, base64: manipulated.base64 });
    } catch (err) {
      console.error('[ScanCameraModal] Capture error:', err);
      Alert.alert('Camera Error', err.message || 'Could not capture photo.');
    } finally {
      setCapturing(false);
    }
  };

  if (!visible) return null;

  // Permission not yet determined
  if (!permission) {
    return (
      <Modal visible animationType="slide">
        <View style={s.center}>
          <ActivityIndicator color="#00C9FF" />
        </View>
      </Modal>
    );
  }

  // Permission denied
  if (!permission.granted) {
    const canAskAgain = permission?.canAskAgain !== false;
    return (
      <Modal visible animationType="slide">
        <View style={s.center}>
          <Text style={s.permText}>Camera permission required</Text>
          <TouchableOpacity
            style={s.permBtn}
            onPress={() => {
              if (canAskAgain) {
                requestPermission();
              } else {
                Linking.openSettings().catch(() => {});
              }
            }}
          >
            <Text style={s.permBtnText}>{canAskAgain ? 'Grant Permission' : 'Open Settings'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.permBtn, { backgroundColor: 'transparent', marginTop: 8 }]} onPress={onClose}>
            <Text style={[s.permBtnText, { color: '#B8BDD0' }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide">
      <View style={s.container}>
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
        />

        {/* Close button */}
        <TouchableOpacity
          style={[s.closeBtn, { top: insets.top + 12 }]}
          onPress={onClose}
        >
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>

        {/* Hint */}
        <Text style={[s.hint, { top: insets.top + 60 }]}>
          Business card · Storefront · Sign · Anything
        </Text>

        {/* Capture button */}
        <View style={[s.footer, { paddingBottom: insets.bottom + 24 }]}>
          <TouchableOpacity
            style={[s.captureBtn, capturing && { opacity: 0.5 }]}
            onPress={handleTakePhoto}
            disabled={capturing}
            activeOpacity={0.8}
          >
            {capturing
              ? <ActivityIndicator color="#080A0F" />
              : <View style={s.captureDot} />
            }
          </TouchableOpacity>
          <Text style={s.captureLabel}>
            {capturing ? 'Capturing...' : 'Tap to scan'}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, backgroundColor: '#080A0F', alignItems: 'center', justifyContent: 'center', padding: 32 },
  permText: { color: '#fff', fontSize: 16, marginBottom: 20, textAlign: 'center' },
  permBtn: { backgroundColor: '#00C9FF', paddingHorizontal: 28, paddingVertical: 12, borderRadius: 10 },
  permBtnText: { color: '#080A0F', fontWeight: '700', fontSize: 14 },
  closeBtn: {
    position: 'absolute', left: 16,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  closeBtnText: { color: '#fff', fontSize: 20, fontWeight: '600' },
  hint: {
    position: 'absolute', alignSelf: 'center',
    color: 'rgba(255,255,255,0.7)', fontSize: 12,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 12,
    paddingVertical: 4, borderRadius: 8, zIndex: 10,
  },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    alignItems: 'center',
    backgroundColor: 'rgba(8,10,15,0.85)',
    paddingTop: 20,
  },
  captureBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: '#00C9FF',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  captureDot: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#080A0F' },
  captureLabel: { color: '#B8BDD0', fontSize: 12 },
});
