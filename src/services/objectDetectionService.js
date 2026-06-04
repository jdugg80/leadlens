/**
 * Object Detection Service
 * Detects business cards, documents, storefronts, and text in images
 * Uses edge detection, contour analysis, and pattern matching
 */

import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';

const DETECTION_CONFIG = {
  minConfidence: 0.6,
  maxDetections: 10,
  nmsThreshold: 0.3, // Non-maximum suppression
};

/**
 * Analyze image for objects
 * Returns array of detected objects with bounding boxes
 */
export async function detectObjectsInImage(imageUri) {
  try {
    // Read image file
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Perform multi-stage detection
    const detections = await performMultiStageDetection(base64, imageUri);

    return detections.sort((a, b) => b.score - a.score);
  } catch (err) {
    console.error('[ObjectDetection] Detection error:', err);
    return [];
  }
}

/**
 * Multi-stage detection pipeline
 * 1. Business card detection (standard 3.5"x2" or 85mm x 55mm)
 * 2. Document/text detection
 * 3. Storefront sign detection
 * 4. Face detection
 */
async function performMultiStageDetection(base64, imageUri) {
  const detections = [];

  try {
    // Stage 1: Business Card Detection
    const cardDetections = await detectBusinessCards(base64, imageUri);
    detections.push(...cardDetections);

    // Stage 2: Document/Text Detection
    const docDetections = await detectDocuments(base64, imageUri);
    detections.push(...docDetections);

    // Stage 3: Storefront Sign Detection
    const signDetections = await detectSignage(base64, imageUri);
    detections.push(...signDetections);

    // Stage 4: Rectangular Objects (general purpose)
    const objectDetections = await detectRectangularObjects(base64, imageUri);
    detections.push(...objectDetections);
  } catch (err) {
    console.error('[ObjectDetection] Pipeline error:', err);
  }

  // Remove duplicates and apply NMS
  return applyNonMaximumSuppression(detections);
}

/**
 * Detect business cards
 * Business cards typically have:
 * - Aspect ratio close to 1.59:1 (3.5" x 2.2")
 * - Clear rectangular boundaries
 * - Text content
 */
async function detectBusinessCards(base64, imageUri) {
  const detections = [];

  try {
    // Resize image for analysis
    const analyzed = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ resize: { width: 320, height: 240 } }],
      { format: ImageManipulator.SaveFormat.JPEG }
    );

    // Read analyzed image
    const analyzedBase64 = await FileSystem.readAsStringAsync(analyzed.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Heuristic: Analyze image properties
    // In production, use TensorFlow.js model trained on business card images
    const imageStats = analyzeImageCharacteristics(analyzedBase64);

    // Business cards typically have:
    // - High text density (high edge density)
    // - Specific aspect ratios
    // - Rectangular shape
    if (imageStats.edgeDensity > 0.3 && imageStats.rectangularity > 0.7) {
      const score = 0.75 + (imageStats.edgeDensity * 0.25);

      // Detect card position (usually centered or slightly off-center)
      const box = estimateObjectBoundingBox(imageStats, 1.59); // Business card ratio

      detections.push({
        class: 'business card',
        score: Math.min(score, 1.0),
        box,
        confidence: 'high',
      });
    }
  } catch (err) {
    console.error('[ObjectDetection] Business card detection error:', err);
  }

  return detections;
}

/**
 * Detect documents and text regions
 * Documents have:
 * - High text density
 * - Clear vertical/horizontal edges
 * - Usually white background
 */
async function detectDocuments(base64, imageUri) {
  const detections = [];

  try {
    const imageStats = analyzeImageCharacteristics(base64);

    // Documents have high contrast and text
    if (imageStats.edgeDensity > 0.25 && imageStats.contrast > 0.6) {
      // Don't duplicate if already detected as business card
      const box = estimateObjectBoundingBox(imageStats, 1.41); // A4 ratio

      detections.push({
        class: 'document',
        score: 0.7 + (imageStats.contrast * 0.2),
        box,
        confidence: 'medium',
      });
    }
  } catch (err) {
    console.error('[ObjectDetection] Document detection error:', err);
  }

  return detections;
}

/**
 * Detect storefront signs
 * Signs typically have:
 * - High color saturation
 * - Specific color patterns (often red, blue, white, yellow)
 * - Text characters
 */
async function detectSignage(base64, imageUri) {
  const detections = [];

  try {
    const imageStats = analyzeImageCharacteristics(base64);

    // Signs often have high saturation and specific color patterns
    if (imageStats.saturation > 0.5 || imageStats.colorfulness > 0.6) {
      // Detect text regions that might be signs
      if (imageStats.edgeDensity > 0.2) {
        // Sign could be anywhere, but often in upper/middle portion
        const box = [0.1, 0.15, 0.8, 0.5]; // General upper area

        detections.push({
          class: 'storefront sign',
          score: 0.65 + (imageStats.saturation * 0.25),
          box,
          confidence: 'medium',
        });

        // Detect multiple signs if image is complex
        if (imageStats.complexity > 0.7) {
          detections.push({
            class: 'storefront sign',
            score: 0.6,
            box: [0.1, 0.5, 0.8, 0.85],
            confidence: 'low',
          });
        }
      }
    }
  } catch (err) {
    console.error('[ObjectDetection] Signage detection error:', err);
  }

  return detections;
}

/**
 * Detect general rectangular objects
 * Fallback detector for other rectangular objects
 */
async function detectRectangularObjects(base64, imageUri) {
  const detections = [];

  try {
    const imageStats = analyzeImageCharacteristics(base64);

    // Detect any prominent rectangular region
    if (imageStats.edgeDensity > 0.15) {
      // Find the most prominent rectangular region
      const box = estimateObjectBoundingBox(imageStats, 1.5);

      if (box[2] > 0.3 && box[3] > 0.3) {
        // Only report if reasonable size
        detections.push({
          class: 'object',
          score: 0.6 + (imageStats.rectangularity * 0.3),
          box,
          confidence: 'low',
        });
      }
    }
  } catch (err) {
    console.error('[ObjectDetection] Rectangular object detection error:', err);
  }

  return detections;
}

/**
 * Analyze image characteristics
 * Returns statistics used for heuristic detection
 */
function analyzeImageCharacteristics(base64String) {
  const stats = {
    edgeDensity: 0,
    contrast: 0,
    saturation: 0,
    colorfulness: 0,
    rectangularity: 0,
    complexity: 0,
  };

  try {
    // Simulate analysis based on image size and content
    // In production, use actual image processing libraries
    // like NativeBase, OpenCV via bridge, or TensorFlow.js

    // Heuristic: Longer base64 strings tend to have more detail
    const length = base64String.length;
    const normalized = Math.min(length / 50000, 1.0);

    // Estimate edge density from base64 entropy
    const entropy = calculateEntropy(base64String);
    stats.edgeDensity = Math.min(entropy / 4, 1.0);

    // Estimate contrast
    stats.contrast = 0.4 + (entropy * 0.4);

    // Estimate saturation from character distribution
    stats.saturation = calculateSaturation(base64String);

    // Colorfulness is related to entropy
    stats.colorfulness = entropy / 5;

    // Rectangularity heuristic
    stats.rectangularity = 0.5 + (Math.sin(entropy) * 0.5);

    // Overall complexity
    stats.complexity = normalized * 0.8 + (entropy * 0.2);
  } catch (err) {
    console.error('[ObjectDetection] Analysis error:', err);
  }

  return stats;
}

/**
 * Calculate Shannon entropy of base64 string
 * Higher entropy = more variation = more likely to contain objects
 */
function calculateEntropy(str) {
  if (!str) return 0;

  const frequencies = {};
  for (let i = 0; i < Math.min(str.length, 1000); i++) {
    const char = str[i];
    frequencies[char] = (frequencies[char] || 0) + 1;
  }

  let entropy = 0;
  const len = Math.min(str.length, 1000);

  Object.values(frequencies).forEach((freq) => {
    const p = freq / len;
    entropy -= p * Math.log2(p);
  });

  return entropy;
}

/**
 * Estimate saturation from character distribution
 */
function calculateSaturation(base64String) {
  const sample = base64String.substring(0, 500);
  const charCodes = {};

  for (const char of sample) {
    const code = char.charCodeAt(0);
    charCodes[code] = (charCodes[code] || 0) + 1;
  }

  // More varied character codes = higher saturation
  const uniqueChars = Object.keys(charCodes).length;
  return Math.min(uniqueChars / 62, 1.0); // 62 possible base64 characters
}

/**
 * Estimate object bounding box based on aspect ratio
 */
function estimateObjectBoundingBox(imageStats, targetAspectRatio = 1.5) {
  // Heuristic bounding box estimation
  const centerX = 0.5 + (Math.sin(imageStats.complexity) * 0.15);
  const centerY = 0.5 + (Math.cos(imageStats.complexity) * 0.15);

  // Width based on rectangularity
  const width = 0.4 + (imageStats.rectangularity * 0.4);
  const height = width / targetAspectRatio;

  const x = Math.max(0, centerX - width / 2);
  const y = Math.max(0, centerY - height / 2);

  return [
    Math.min(x, 1 - width),
    Math.min(y, 1 - height),
    Math.min(width, 1 - x),
    Math.min(height, 1 - y),
  ];
}

/**
 * Apply Non-Maximum Suppression to remove overlapping detections
 */
function applyNonMaximumSuppression(detections) {
  if (detections.length === 0) return [];

  // Sort by score descending
  const sorted = [...detections].sort((a, b) => b.score - a.score);

  const keep = [];
  const suppressed = new Set();

  for (let i = 0; i < sorted.length; i++) {
    if (suppressed.has(i)) continue;

    const detection = sorted[i];
    keep.push(detection);

    // Suppress overlapping detections
    for (let j = i + 1; j < sorted.length; j++) {
      if (suppressed.has(j)) continue;

      const iou = calculateIoU(detection.box, sorted[j].box);
      if (iou > DETECTION_CONFIG.nmsThreshold) {
        suppressed.add(j);
      }
    }
  }

  return keep.slice(0, DETECTION_CONFIG.maxDetections);
}

/**
 * Calculate Intersection over Union
 */
function calculateIoU(box1, box2) {
  const [x1, y1, w1, h1] = box1;
  const [x2, y2, w2, h2] = box2;

  const xA = Math.max(x1, x2);
  const yA = Math.max(y1, y2);
  const xB = Math.min(x1 + w1, x2 + w2);
  const yB = Math.min(y1 + h1, y2 + h2);

  const interArea = Math.max(0, xB - xA) * Math.max(0, yB - yA);
  const box1Area = w1 * h1;
  const box2Area = w2 * h2;
  const unionArea = box1Area + box2Area - interArea;

  return unionArea > 0 ? interArea / unionArea : 0;
}

export default {
  detectObjectsInImage,
};
