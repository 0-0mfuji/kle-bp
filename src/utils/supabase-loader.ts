/** Supabase is intentionally disabled in the local-only CAD build. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getSupabaseClient(): Promise<any> { throw new Error('Supabase is disabled in this build') }
export function resetSupabaseClient(): void { /* compatibility no-op */ }
