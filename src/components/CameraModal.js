import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Linking,
  Dimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';
import { detectObjectsInImage } from '../services/objectDetectionService';
import useToast from '../hooks/useToast';

const COLORS = {
  bg: '#080A0F',
  surface: '#111318',
  accent: '#00C9FF',
  accent2: '#CC1040',
  text: '#FFFFFF',
  muted: '#B8BDD0',
};

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

/**
 * Dynamic Bounding Box for object detection results
 */
function BoundingBoxOverlay({ detections }) {
  if (!detections || detections.length === 0) {
    return null;
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {detections.map((detection, idx) => {
        const { box, class: className, score } = detection;
        if (!box) return null;

        // box format: [x, y, width, height] in normalized coordinates
        const left = box[0] * screenWidth;
        const top = box[1] * screenHeight;
        const width = box[2] * screenWidth;
        const height = box[3] * screenHeight;

        return (
          <View
            key={idx}
            style={{
              position: 'absolute',
              left,
              top,
              width,
              height,
              borderColor: className === 'business card' ? '#FF6B6B' : '#00C9FF',
              borderWidth: 2,
            }}
          >
            {/* Label */}
            {score && (
              <View
                style={{
                  position: 'absolute',
                  top: -24,
                  left: 0,
                  backgroundColor: className === 'business card' ? '#FF6B6B' : '#00C9FF',
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}
              >
                <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.bg }}>
                  {className} {Math.round(score * 100)}%
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/**
 * CameraModal - Real-time object detection with dynamic bounding boxes
 */
export default function CameraModal({
  visible,
  onClose,
  onCapture,
  title = 'Camera',
  mode = 'portrait',
  subtitle = 'Position your subject in the frame',
  quality = 0.85,
}) {
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [zoom, setZoom] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [detections, setDetections] = useState([]);
  const insets = useSafeAreaInsets();
  const { showToast } = useToast();

  const initialDistRef = useRef(null);
  const initialZoomRef = useRef(0);
  const detectionIntervalRef = useRef(null);

  // Initialize object detection on mount
  // NOTE: Disabled auto-detection loop to prevent interference with capture flow
  // The continuous photo-taking (every 800ms) was causing unexpected behavior
  useEffect(() => {
    if (!visible) {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
      // Clear detections and reset capturing state when modal closes
      setDetections([]);
      setCapturing(false);
      return;
    }

    // Auto-detection disabled - users will get bounding box hints after they capture
    // This prevents the camera from continuously taking photos in the background

    return () => {
      if (detectionIntervalRef.current) {
        clearInterval(detectionIntervalRef.current);
        detectionIntervalRef.current = null;
      }
    };
  }, [visible]);

  const handleTouchStart = (event) => {
    const touches = event.nativeEvent.touches;
    if (touches && touches.length === 2) {
      const touch1 = touches[0];
      const touch2 = touches[1];
      const dx = touch1.pageX - touch2.pageX;
      const dy = touch1.pageY - touch2.pageY;
      initialDistRef.current = Math.sqrt(dx * dx + dy * dy);
      initialZoomRef.current = zoom;
    } else {
      initialDistRef.current = null;
    }
  };

  const handleTouchMove = (event) => {
    const touches = event.nativeEvent.touches;
    if (touches && touches.length === 2 && initialDistRef.current !== null) {
      const touch1 = touches[0];
      const touch2 = touches[1];
      const dx = touch1.pageX - touch2.pageX;
      const dy = touch1.pageY - touch2.pageY;
      const currentDist = Math.sqrt(dx * dx + dy * dy);
      const diff = currentDist - initialDistRef.current;
      const scale = 0.002;
      const newZoom = Math.max(0, Math.min(1, initialZoomRef.current + diff * scale));
      setZoom(newZoom);
    }
  };

  const handleTouchEnd = () => {
    initialDistRef.current = null;
  };

  const handleTakePhoto = async () => {
    if (!cameraRef.current || capturing) {
      console.warn('[CameraModal] Capture already in progress or camera ref missing');
      return;
    }

    try {
      setCapturing(true);
      console.log('[CameraModal] Starting capture...');

      const photo = await cameraRef.current.takePictureAsync({
        quality: quality,
      });

      // Resize and compress
      const manipulated = await ImageManipulator.manipulateAsync(
        photo.uri,
        [{ resize: { width: 1200 } }],
        { compress: 0.82, format: ImageManipulator.SaveFormat.JPEG, base64: true }
      );

      console.log('[CameraModal] Capture successful, calling onCapture');
      
      // Call onCapture and immediately close to prevent duplicate calls
      onCapture({
        uri: manipulated.uri,
        base64: manipulated.base64,
      });

      // Close the modal after successful capture
      // The useEffect will reset capturing when visible becomes false
      onClose();
    } catch (error) {
      console.error('[CameraModal] Capture error:', error);
      setCapturing(false); // Reset capturing state on error
      showToast(`Capture Error: ${error.message || 'Failed to capture photo'}`, 'error');
    }
  };

  if (!visible) return null;

  if (!permission) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={[s.container, { backgroundColor: 'rgba(0,0,0,0.8)' }]}>
          <View style={s.permissionBox}>
            <Text style={s.permissionText}>Camera permission required</Text>
            <TouchableOpacity style={s.btn} onPress={requestPermission}>
              <Text style={s.btnText}>Grant Permission</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancel} onPress={onClose}>
              <Text style={s.btnCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    const canAskAgain = permission?.canAskAgain !== false;
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View style={[s.container, { backgroundColor: 'rgba(0,0,0,0.8)' }]}> 
          <View style={s.permissionBox}>
            <Text style={s.permissionText}>Camera permission denied</Text>
            <Text style={s.permissionSub}>Enable in Settings → Apps → LeadLens</Text>
            <TouchableOpacity
              style={s.btn}
              onPress={() => {
                if (canAskAgain) {
                  requestPermission();
                } else {
                  Linking.openSettings().catch(() => {});
                }
              }}
            >
              <Text style={s.btnText}>{canAskAgain ? 'Grant Permission' : 'Open Settings'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnCancel} onPress={onClose}>
              <Text style={s.btnCancelText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={s.container}>
        <CameraView
          ref={cameraRef}
          style={s.camera}
          facing="back"
          zoom={zoom}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          {/* Dynamic bounding boxes from object detection */}
          <BoundingBoxOverlay detections={detections} />

          {/* Header */}
          <View style={[s.header, { paddingTop: insets.top + 12 }]}>
            <TouchableOpacity onPress={onClose} style={s.closeBtn}>
              <Text style={s.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <View style={s.titleSection}>
              <Text style={s.title}>{title}</Text>
              <Text style={s.subtitle}>{subtitle}</Text>
            </View>
            <View style={{ width: 40 }} />
          </View>

          {/* Detection status */}
          {detections.length > 0 && (
            <View style={s.detectionStatus}>
              <Text style={s.detectionText}>
                {detections.length} object{detections.length !== 1 ? 's' : ''} detected
              </Text>
            </View>
          )}

          {/* Footer with capture button */}
          <View style={[s.footer, { paddingBottom: insets.bottom + 16 }]}>
            <TouchableOpacity
              style={[s.captureBtn, capturing && s.captureBtnDisabled]}
              onPress={handleTakePhoto}
              disabled={capturing}
              activeOpacity={0.7}
            >
              {capturing ? (
                <ActivityIndicator size="large" color={COLORS.bg} />
              ) : (
                <View style={s.captureBtnInner} />
              )}
            </TouchableOpacity>
            <Text style={s.captureLabel}>
              {capturing ? 'Capturing...' : 'Tap to capture'}
            </Text>
          </View>
        </CameraView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  camera: {
    flex: 1,
  },
  boundingBox: {
    position: 'absolute',
    borderColor: COLORS.accent,
    borderWidth: 2,
  },
  corner: {
    position: 'absolute',
    backgroundColor: COLORS.accent,
    width: 12,
    height: 12,
  },
  topLeft: {
    top: -6,
    left: -6,
  },
  topRight: {
    top: -6,
    right: -6,
  },
  bottomLeft: {
    bottom: -6,
    left: -6,
  },
  bottomRight: {
    bottom: -6,
    right: -6,
  },
  label: {
    position: 'absolute',
    top: -24,
    left: 0,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  labelText: {
    fontSize: 10,
    fontWeight: '600',
    color: COLORS.bg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: 'rgba(8, 10, 15, 0.9)',
  },
  titleSection: {
    flex: 1,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  closeBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  closeBtnText: {
    fontSize: 24,
    color: COLORS.text,
  },
  detectionStatus: {
    position: 'absolute',
    top: 120,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0, 201, 255, 0.2)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.accent,
  },
  detectionText: {
    fontSize: 12,
    color: COLORS.accent,
    fontWeight: '500',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingVertical: 16,
    backgroundColor: 'rgba(8, 10, 15, 0.9)',
  },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  captureBtnDisabled: {
    opacity: 0.5,
  },
  captureBtnInner: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.bg,
  },
  captureLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
  },
  permissionBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  permissionText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  permissionSub: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 24,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  btnText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.bg,
  },
  btnCancel: {
    borderWidth: 1,
    borderColor: COLORS.muted,
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  btnCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
});
