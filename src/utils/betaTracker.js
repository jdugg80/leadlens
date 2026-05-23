/**
 * BetaTracker — lightweight analytics for beta testing
 * Logs screen views and events to Supabase app_events table
 */
import { supabase } from '../lib/supabase';

let _userId = null;

const BetaTracker = {
  setUser(userId) {
    _userId = userId;
  },

  async screen(screenName) {
    try {
      await supabase.from('app_events').insert({
        event_type: 'screen_view',
        screen: screenName,
        user_id: _userId || null,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      // Non-critical — never crash on analytics
    }
  },

  async event(eventName, properties = {}) {
    try {
      await supabase.from('app_events').insert({
        event_type: eventName,
        properties,
        user_id: _userId || null,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      // Non-critical
    }
  },
};

export default BetaTracker;
