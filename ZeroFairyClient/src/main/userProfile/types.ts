// 用户个人资料：本地名/头像 + 主人（哲/铃/自定义）与助手二号

export type CharacterRole = 'zhe' | 'ling' | 'custom'

export interface UserProfile {
  displayName: string
  /** data URL，本地头像；空则用首字占位 */
  avatarDataUrl: string
  masterRole: CharacterRole
  masterCustomName: string
  assistant2Role: CharacterRole
  assistant2CustomName: string
}

export const DEFAULT_USER_PROFILE: UserProfile = {
  displayName: '主人',
  avatarDataUrl: '',
  masterRole: 'zhe',
  masterCustomName: '',
  assistant2Role: 'ling',
  assistant2CustomName: ''
}

export function roleLabel(role: CharacterRole, customName: string): string {
  if (role === 'zhe') return '哲'
  if (role === 'ling') return '铃'
  const name = customName.trim()
  return name || '自定义'
}

/** 主人选哲/铃时，助手二号自动互斥 */
export function resolveAssistant2Role(masterRole: CharacterRole, assistant2Role: CharacterRole): CharacterRole {
  if (masterRole === 'zhe') return 'ling'
  if (masterRole === 'ling') return 'zhe'
  return assistant2Role
}

export function describeProfile(profile: UserProfile): {
  masterName: string
  assistant2Name: string
  masterRole: CharacterRole
  assistant2Role: CharacterRole
} {
  const masterRole = profile.masterRole
  const assistant2Role = resolveAssistant2Role(masterRole, profile.assistant2Role)
  return {
    masterRole,
    assistant2Role,
    masterName: roleLabel(masterRole, profile.masterCustomName),
    assistant2Name: roleLabel(assistant2Role, profile.assistant2CustomName)
  }
}

export function normalizeUserProfile(raw: Partial<UserProfile> | null | undefined): UserProfile {
  const merged: UserProfile = {
    ...DEFAULT_USER_PROFILE,
    ...(raw ?? {})
  }
  merged.displayName = (merged.displayName || '主人').trim() || '主人'
  merged.avatarDataUrl = typeof merged.avatarDataUrl === 'string' ? merged.avatarDataUrl : ''
  if (merged.masterRole !== 'zhe' && merged.masterRole !== 'ling' && merged.masterRole !== 'custom') {
    merged.masterRole = 'zhe'
  }
  merged.assistant2Role = resolveAssistant2Role(merged.masterRole, merged.assistant2Role)
  if (
    merged.assistant2Role !== 'zhe' &&
    merged.assistant2Role !== 'ling' &&
    merged.assistant2Role !== 'custom'
  ) {
    merged.assistant2Role = merged.masterRole === 'zhe' ? 'ling' : 'zhe'
  }
  merged.masterCustomName = (merged.masterCustomName || '').trim()
  merged.assistant2CustomName = (merged.assistant2CustomName || '').trim()
  return merged
}
