import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export interface AuthUser { id: string; email: string; name: string; avatarUrl: string }
export type AuthProvider = 'github' | 'google'

/** Compatibility surface retained while account UI is disabled. */
export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const busy = ref(false)
  const initialized = ref(true)
  const isConfigured = computed(() => false)
  const isSignedIn = computed(() => user.value !== null)
  const canUseTestUser = computed(() => false)
  const testUser = computed(() => null)
  const initialize = async () => undefined
  const signIn = async (_provider: AuthProvider) => undefined
  const signInAsTestUser = async () => undefined
  const signOut = async () => { user.value = null }
  const getAccessToken = async () => null
  const cleanup = () => undefined
  return { user, busy, initialized, isConfigured, isSignedIn, canUseTestUser, testUser, initialize, signIn, signInAsTestUser, signOut, getAccessToken, cleanup }
})
