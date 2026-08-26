import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  attachSupportNumber,
  fetchSupportNumber,
  releaseSupportNumber,
  searchAvailableNumbers,
} from '@/api/phone';

/** The company's active support number, or null when none is connected. */
export function usePhoneNumber(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['support-number', companyId],
    queryFn: () => fetchSupportNumber(token!, companyId),
    enabled: !!token && !!companyId,
  });
}

/**
 * Number search, as a MUTATION rather than a query on purpose.
 *
 * It is user-initiated after the admin types an area code, it is slow, and every call
 * hits a paid provider — so it must never auto-refetch on window focus or remount the
 * way a query would.
 */
export function useSearchAvailableNumbers() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (params: Parameters<typeof searchAvailableNumbers>[1]) =>
      searchAvailableNumbers(token!, params),
  });
}

/**
 * Both writes invalidate the COMPANY query as well as the support-number one: attaching
 * mirrors the number onto `Company.supportNumber` server-side, and the page header and
 * the Support # field read it from there. Miss that and the header still says "no
 * support number" next to a freshly connected one.
 */
function useInvalidateNumber(companyId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['support-number', companyId] });
    void qc.invalidateQueries({ queryKey: ['company', companyId] });
  };
}

export function useAttachNumber(companyId: number) {
  const { token } = useAuth();
  const invalidate = useInvalidateNumber(companyId);
  return useMutation({
    mutationFn: (data: Parameters<typeof attachSupportNumber>[2]) =>
      attachSupportNumber(token!, companyId, data),
    onSuccess: invalidate,
  });
}

export function useReleaseNumber(companyId: number) {
  const { token } = useAuth();
  const invalidate = useInvalidateNumber(companyId);
  return useMutation({
    mutationFn: () => releaseSupportNumber(token!, companyId),
    onSuccess: invalidate,
  });
}
