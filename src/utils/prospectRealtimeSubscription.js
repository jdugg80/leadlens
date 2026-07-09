import { PROSPECT_FILTER_DB_COLUMNS } from '../constants';

/**
 * Build a Supabase realtime filter string for the prospect filter dimensions.
 * Returns null if no filters are active so the caller can subscribe broadly.
 */
export function buildProspectFilterString(filters = {}) {
  const { prospectStatus, leadSource, serviceType } = filters;
  const parts = [];

  if (Array.isArray(prospectStatus) && prospectStatus.length > 0) {
    const values = prospectStatus.map(v => encodeURIComponent(v)).join(',');
    parts.push(`${PROSPECT_FILTER_DB_COLUMNS.prospectStatus}.in.(${values})`);
  }

  if (Array.isArray(leadSource) && leadSource.length > 0) {
    const values = leadSource.map(v => encodeURIComponent(v)).join(',');
    parts.push(`${PROSPECT_FILTER_DB_COLUMNS.leadSource}.in.(${values})`);
  }

  if (Array.isArray(serviceType) && serviceType.length > 0) {
    const values = serviceType.map(v => encodeURIComponent(v)).join(',');
    parts.push(`${PROSPECT_FILTER_DB_COLUMNS.serviceType}.in.(${values})`);
  }

  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0];
  return `and=(${parts.join(',')})`;
}

function applyFiltersToQuery(query, filters = {}) {
  const { prospectStatus, leadSource, serviceType } = filters;

  if (Array.isArray(prospectStatus) && prospectStatus.length > 0) {
    query = query.in(PROSPECT_FILTER_DB_COLUMNS.prospectStatus, prospectStatus);
  }

  if (Array.isArray(leadSource) && leadSource.length > 0) {
    query = query.in(PROSPECT_FILTER_DB_COLUMNS.leadSource, leadSource);
  }

  if (Array.isArray(serviceType) && serviceType.length > 0) {
    query = query.in(PROSPECT_FILTER_DB_COLUMNS.serviceType, serviceType);
  }

  return query;
}

/**
 * Subscribe to realtime prospect updates for the given territory and filters.
 * Re-queries the full matching dataset on every change and calls onUpdate.
 */
export function subscribeProspects({
  supabase,
  user,
  zipCodes = [],
  filters = {},
  onUpdate,
  onError,
}) {
  if (!supabase || typeof supabase.channel !== 'function') {
    console.warn('[prospectRealtimeSubscription] Supabase client unavailable');
    return () => {};
  }

  const channelId = `prospects-${user?.id || 'anon'}-${Date.now()}`;
  const channel = supabase.channel(channelId);

  const fetchProspects = async () => {
    try {
      let query = supabase
        .from('prospects')
        .select('*')
        .order('updated_at', { ascending: false });

      if (zipCodes.length > 0) {
        query = query.in('zip', zipCodes);
      }

      query = applyFiltersToQuery(query, filters);

      const { data, error } = await query;
      if (error) throw error;
      onUpdate?.(data || []);
    } catch (err) {
      console.error('[prospectRealtimeSubscription] fetch failed:', err);
      onError?.(err);
    }
  };

  const filterString = buildProspectFilterString(filters);
  const channelConfig = {
    event: '*',
    schema: 'public',
    table: 'prospects',
  };
  if (filterString) {
    channelConfig.filter = filterString;
  }

  channel
    .on('postgres_changes', channelConfig, () => {
      console.log('[prospectRealtimeSubscription] Change detected, re-fetching prospects');
      fetchProspects();
    })
    .subscribe((status) => {
      console.log('[prospectRealtimeSubscription] channel status:', status);
      if (status === 'SUBSCRIBED') {
        fetchProspects();
      }
    });

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (e) {
      console.warn('[prospectRealtimeSubscription] cleanup error:', e);
    }
  };
}
