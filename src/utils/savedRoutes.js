// ─────────────────────────────────────────────────────────────────────
// SAVED ROUTES
// Persists route plans built by the address-import route feature, so a
// rep can plan a route now and run it later rather than only right away.
// Mirrors territoryUtils.js's loadMyZips/saveMyZips storage pattern.
// ─────────────────────────────────────────────────────────────────────

import { storage as AsyncStorage } from './storage';

const SAVED_ROUTES_KEY = '@leadlens_saved_routes';

export async function loadSavedRoutes() {
  try {
    const raw = await AsyncStorage.getItem(SAVED_ROUTES_KEY);
    const routes = raw ? JSON.parse(raw) : [];
    return Array.isArray(routes) ? routes : [];
  } catch (err) {
    console.warn('[SavedRoutes] Failed to load:', err?.message || String(err));
    return [];
  }
}

export async function saveSavedRoutes(routes) {
  await AsyncStorage.setItem(SAVED_ROUTES_KEY, JSON.stringify(routes));
}

/**
 * Builds a new saved-route record from an ordered list of geocoded stops
 * and the start location used to order them.
 */
export function buildRouteRecord({ name, stops, startCoords }) {
  return {
    id: `route_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: name || `Route — ${new Date().toLocaleDateString()}`,
    createdAt: new Date().toISOString(),
    startCoords,
    stops,
  };
}

export async function addSavedRoute(route) {
  const routes = await loadSavedRoutes();
  const updated = [route, ...routes];
  await saveSavedRoutes(updated);
  return updated;
}

export async function deleteSavedRoute(routeId) {
  const routes = await loadSavedRoutes();
  const updated = routes.filter((r) => r.id !== routeId);
  await saveSavedRoutes(updated);
  return updated;
}
