import { createClient } from '@supabase/supabase-js';
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import * as QueryParams from 'expo-auth-session/build/QueryParams'
import { supabase } from '../lib/supabase'

WebBrowser.maybeCompleteAuthSession()

const redirectTo = makeRedirectUri({
  scheme: 'leadlens',
})

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url)

  if (errorCode) {
    throw new Error(errorCode)
  }

  const { access_token, refresh_token, code } = params

  if (access_token && refresh_token) {
    const { data, error } = await supabase.auth.setSession({
      access_token,
      refresh_token,
    })

    if (error) throw error

    return data.session
  }

  if (code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) throw error

    return data.session
  }

  return null
}

export async function signInWithOAuthProvider(settings: any) {
  try {
    const supabase = createClient(
      settings.supabaseUrl,
      settings.supabaseAnonKey
    )

    console.log('USING SUPABASE URL:', settings.supabaseUrl)

    const redirectTo = 'leadlens://auth/callback'

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'azure',
      options: {
        redirectTo: "leadlens://auth/callback",
        scopes: 'email',
        skipBrowserRedirect: true,
        queryParams: {
          prompt: 'select_account',
        },
      },
    })

    if (error) {
      console.error('Microsoft OAuth sign-in error:', error)
      throw error
    }

    return data
  } catch (error) {
    console.error('Microsoft sign-in failed:', error)
    throw error
  }
}

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        scopes: provider === 'azure' ? 'email openid profile' : undefined,
        skipBrowserRedirect: true,
        queryParams:
          provider === 'azure'
            ? {
                prompt: 'select_account',
              }
            : undefined,
      },
    })

    console.log('MICROSOFT / OAUTH AUTH URL:', data?.url)

    if (error) {
      console.error('OAuth setup error:', error)
      return { ok: false, reason: error.message }
    }

    if (!data?.url) {
      return { ok: false, reason: 'No OAuth URL returned.' }
    }

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

    console.log('OAUTH RESULT:', result)

    if (result.type !== 'success') {
      return { ok: false, reason: 'Sign-in was cancelled or did not complete.' }
    }

    const url = result.url
    const params = new URLSearchParams(url.split('#')[1] || url.split('?')[1])

    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    const code = params.get('code')

    if (accessToken && refreshToken) {
      const { data: sessionData, error: sessionError } =
        await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        })

      if (sessionError) {
        return { ok: false, reason: sessionError.message }
      }

      return {
        ok: true,
        user: sessionData?.user || sessionData?.session?.user || null,
      }
    }

    if (code) {
      const { data: codeData, error: codeError } =
        await supabase.auth.exchangeCodeForSession(code)

      if (codeError) {
        return { ok: false, reason: codeError.message }
      }

      return {
        ok: true,
        user: codeData?.user || codeData?.session?.user || null,
      }
    }

    return { ok: false, reason: 'No session tokens returned from OAuth.' }
  } catch (err) {
    console.error('OAuth function failed:', err)

    return {
      ok: false,
      reason: err?.message || String(err),
    }
  }
}