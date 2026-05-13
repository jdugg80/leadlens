import 'react-native-url-polyfill/auto'
import { storageBridge as AsyncStorage } from '../utils/storage';
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || ''

const missingSupabaseMessage =
  'Supabase is not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY to the build environment, or save Supabase settings in the app.'

function makeConfigError(operation = 'supabase') {
  return new Error(`${missingSupabaseMessage} Operation skipped: ${operation}.`)
}

function missingResponse(operation = 'query') {
  return Promise.resolve({ data: null, error: makeConfigError(operation) })
}

function createMissingQueryBuilder() {
  const builder: any = {}
  const chainMethods = [
    'select',
    'insert',
    'upsert',
    'update',
    'delete',
    'eq',
    'neq',
    'gt',
    'gte',
    'lt',
    'lte',
    'like',
    'ilike',
    'is',
    'in',
    'contains',
    'containedBy',
    'rangeGt',
    'rangeGte',
    'rangeLt',
    'rangeLte',
    'rangeAdjacent',
    'overlaps',
    'textSearch',
    'match',
    'not',
    'or',
    'filter',
    'order',
    'limit',
    'range',
    'abortSignal',
    'returns',
  ]

  chainMethods.forEach((method) => {
    builder[method] = () => builder
  })

  builder.single = () => missingResponse('single')
  builder.maybeSingle = () => missingResponse('maybeSingle')
  builder.csv = () => missingResponse('csv')
  builder.geojson = () => missingResponse('geojson')
  builder.explain = () => missingResponse('explain')
  builder.rollback = () => builder
  builder.then = (resolve: any, reject: any) => missingResponse('query').then(resolve, reject)
  builder.catch = (reject: any) => missingResponse('query').catch(reject)
  builder.finally = (onFinally: any) => missingResponse('query').finally(onFinally)

  return builder
}

function createMissingSupabaseClient() {
  const missingBuilder = createMissingQueryBuilder()

  return {
    from: () => missingBuilder,
    rpc: () => missingResponse('rpc'),
    auth: {
      getUser: async () => ({ data: { user: null }, error: makeConfigError('auth.getUser') }),
      getSession: async () => ({ data: { session: null }, error: makeConfigError('auth.getSession') }),
      signInWithPassword: async () => ({ data: { session: null, user: null }, error: makeConfigError('auth.signInWithPassword') }),
      signUp: async () => ({ data: { session: null, user: null }, error: makeConfigError('auth.signUp') }),
      signInWithOAuth: async () => ({ data: { url: null }, error: makeConfigError('auth.signInWithOAuth') }),
      setSession: async () => ({ data: { session: null, user: null }, error: makeConfigError('auth.setSession') }),
      exchangeCodeForSession: async () => ({ data: { session: null, user: null }, error: makeConfigError('auth.exchangeCodeForSession') }),
      resetPasswordForEmail: async () => ({ data: null, error: makeConfigError('auth.resetPasswordForEmail') }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      startAutoRefresh: () => {},
      stopAutoRefresh: () => {},
    },
    storage: {
      listBuckets: async () => ({ data: [], error: makeConfigError('storage.listBuckets') }),
      from: () => ({
        upload: async () => ({ data: null, error: makeConfigError('storage.upload') }),
        download: async () => ({ data: null, error: makeConfigError('storage.download') }),
        remove: async () => ({ data: null, error: makeConfigError('storage.remove') }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
      }),
    },
  }
}

export const isSupabaseConfigured = !!(String(supabaseUrl || '').trim() && String(supabaseAnonKey || '').trim())

export const supabase = isSupabaseConfigured
  ? createClient(String(supabaseUrl).trim(), String(supabaseAnonKey).trim(), {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    })
  : createMissingSupabaseClient()
