import { Image } from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';

export function getImageSize(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (error) => reject(error)
    );
  });
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildCropFromTargetBox(imageWidth, imageHeight, targetBox, paddingRatio = 0.08) {
  const normalizedX = clamp(safeNumber(targetBox?.normalizedX, 0), 0, 1);
  const normalizedY = clamp(safeNumber(targetBox?.normalizedY, 0), 0, 1);
  const normalizedWidth = clamp(safeNumber(targetBox?.normalizedWidth, 0.35), 0.05, 1);
  const normalizedHeight = clamp(safeNumber(targetBox?.normalizedHeight, 0.22), 0.05, 1);

  const padX = normalizedWidth * paddingRatio;
  const padY = normalizedHeight * paddingRatio;

  const paddedX = clamp(normalizedX - padX, 0, 1);
  const paddedY = clamp(normalizedY - padY, 0, 1);
  const paddedRight = clamp(normalizedX + normalizedWidth + padX, 0, 1);
  const paddedBottom = clamp(normalizedY + normalizedHeight + padY, 0, 1);

  const originX = Math.round(clamp(paddedX * imageWidth, 0, imageWidth - 1));
  const originY = Math.round(clamp(paddedY * imageHeight, 0, imageHeight - 1));
  const width = Math.round(clamp((paddedRight - paddedX) * imageWidth, 24, imageWidth - originX));
  const height = Math.round(clamp((paddedBottom - paddedY) * imageHeight, 24, imageHeight - originY));

  return { originX, originY, width, height };
}

export async function cropImageToLeadLockTarget(imageUri, targetBox, options = {}) {
  if (!imageUri || !targetBox) return null;

  const size = await getImageSize(imageUri);
  const imageWidth = safeNumber(size.width);
  const imageHeight = safeNumber(size.height);

  if (!imageWidth || !imageHeight) return null;

  const crop = buildCropFromTargetBox(
    imageWidth,
    imageHeight,
    targetBox,
    safeNumber(options.paddingRatio, 0.08)
  );

  const actions = [{ crop }];
  const minWidth = safeNumber(options.minWidth, 0);
  const maxWidth = safeNumber(options.maxWidth, 2200);
  const targetWidth = minWidth > 0 ? clamp(Math.max(crop.width, minWidth), crop.width, maxWidth) : 0;

  if (targetWidth && crop.width !== targetWidth) {
    actions.push({ resize: { width: Math.round(targetWidth) } });
  }

  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    actions,
    {
      compress: safeNumber(options.compress, 0.92),
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    crop: { ...crop, imageWidth, imageHeight, paddingRatio: safeNumber(options.paddingRatio, 0.08) },
    output: { width: result.width, height: result.height },
  };
}

export async function createLeadLockFullImageVariant(imageUri, options = {}) {
  if (!imageUri) return null;

  const size = await getImageSize(imageUri);
  const imageWidth = safeNumber(size.width);
  const imageHeight = safeNumber(size.height);
  const maxWidth = safeNumber(options.maxWidth, 1900);

  if (!imageWidth || !imageHeight) return null;

  const actions = imageWidth > maxWidth ? [{ resize: { width: maxWidth } }] : [];

  const result = await ImageManipulator.manipulateAsync(
    imageUri,
    actions,
    {
      compress: safeNumber(options.compress, 0.86),
      format: ImageManipulator.SaveFormat.JPEG,
    }
  );

  return {
    uri: result.uri,
    sourceSize: { width: imageWidth, height: imageHeight },
    output: { width: result.width, height: result.height },
  };
}
