import { Dimensions, PixelRatio } from 'react-native';

const BASE_WIDTH = 412;

const { width, height } = Dimensions.get('window');

const scale = width / BASE_WIDTH;

export function rw(size) {
  return Math.round(size * scale);
}

export function rf(size) {
  const scaled = size * scale;
  return PixelRatio.roundToNearestPixel(scaled);
}

export const screenWidth = width;
export const screenHeight = height;

export const isSmallScreen = width < 360;
export const isMediumScreen = width >= 360 && width < 414;
export const isLargeScreen = width >= 414;
