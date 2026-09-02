import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchCompanyPhoneSettings,
  fetchPhoneDefaults,
  previewPhoneMessage,
  resetCompanyPhoneSettings,
  updateCompanyPhoneSettings,
  updatePhoneDefaults,
  type EffectivePhoneSettings,
  type PhoneSettingsOverrides,
} from '@/api/phoneSettings';

/** The global defaults every company inherits. */
export function usePhoneDefaults() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['phone-settings', 'defaults'],
    queryFn: () => fetchPhoneDefaults(token!),
    enabled: !!token,
  });
}

/**
 * Saving the DEFAULTS invalidates the whole `['phone-settings']` prefix.
 *
 * The asymmetry with the per-company hook below is deliberate: changing a default changes
 * the `effective` block of every company that inherits it, so a cached company card would
 * keep showing the old inherited value in its greyed-out "Use default" fields.
 */
export function useUpdatePhoneDefaults() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EffectivePhoneSettings>) =>
      updatePhoneDefaults(token!, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['phone-settings'] }),
  });
}

/** One company's overrides, the resolved values, and the defaults behind them. */
export function useCompanyPhoneSettings(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['phone-settings', 'company', companyId],
    queryFn: () => fetchCompanyPhoneSettings(token!, companyId),
    enabled: !!token && !!companyId,
  });
}

/** Only this company's cache is stale — no other company's resolution changed. */
function useInvalidateCompany(companyId: number) {
  const qc = useQueryClient();
  return () =>
    void qc.invalidateQueries({
      queryKey: ['phone-settings', 'company', companyId],
    });
}

export function useUpdateCompanyPhoneSettings(companyId: number) {
  const { token } = useAuth();
  const invalidate = useInvalidateCompany(companyId);
  return useMutation({
    mutationFn: (data: Partial<PhoneSettingsOverrides>) =>
      updateCompanyPhoneSettings(token!, companyId, data),
    onSuccess: invalidate,
  });
}

export function useResetCompanyPhoneSettings(companyId: number) {
  const { token } = useAuth();
  const invalidate = useInvalidateCompany(companyId);
  return useMutation({
    mutationFn: () => resetCompanyPhoneSettings(token!, companyId),
    onSuccess: invalidate,
  });
}

/**
 * "What would a caller hear?" — a MUTATION rather than a query, like
 * `useSearchAvailableNumbers`: it is fired deliberately as the admin types, and must
 * never auto-refetch on window focus or remount.
 */
export function usePreviewPhoneMessage() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (data: { template: string; companyId?: number; at?: string }) =>
      previewPhoneMessage(token!, data),
  });
}
