import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  deleteSignatureImage,
  fetchCompanySignature,
  fetchSignatureDefaults,
  fetchSignatureImages,
  previewSignature,
  renameSignatureImage,
  resetCompanySignature,
  updateCompanySignature,
  updateSignatureDefaults,
  uploadSignatureImage,
  type EffectiveEmailSignature,
  type EmailSignatureOverrides,
} from '@/api/emailSignature';

const IMAGES_KEY = ['signature-images'];

export function useSignatureDefaults() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['email-signature', 'defaults'],
    queryFn: () => fetchSignatureDefaults(token!),
    enabled: !!token,
  });
}

/**
 * Saving the DEFAULTS invalidates the whole `['email-signature']` prefix.
 *
 * The asymmetry with the per-company hook below is deliberate: changing a default changes
 * the `effective` block of every company that inherits it, so a cached company card would
 * keep showing the old inherited value in its greyed-out "Use default" fields.
 *
 * `['gmail-account']` goes too — that query carries `signatureHtml`, which is what actually
 * seeds a composer. Without this, a staff member with the tab already open keeps seeding
 * the old signature into new emails until something else refetches.
 */
export function useUpdateSignatureDefaults() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<EffectiveEmailSignature>) =>
      updateSignatureDefaults(token!, data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['email-signature'] });
      void qc.invalidateQueries({ queryKey: ['gmail-account'] });
    },
  });
}

export function useCompanySignature(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['email-signature', 'company', companyId],
    queryFn: () => fetchCompanySignature(token!, companyId),
    enabled: !!token && !!companyId,
  });
}

/** Only this company's cache is stale — no other company's resolution changed. */
function useInvalidateCompany(companyId: number) {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({
      queryKey: ['email-signature', 'company', companyId],
    });
    void qc.invalidateQueries({ queryKey: ['gmail-account'] });
  };
}

export function useUpdateCompanySignature(companyId: number) {
  const { token } = useAuth();
  const invalidate = useInvalidateCompany(companyId);
  return useMutation({
    mutationFn: (data: Partial<EmailSignatureOverrides>) =>
      updateCompanySignature(token!, companyId, data),
    onSuccess: invalidate,
  });
}

export function useResetCompanySignature(companyId: number) {
  const { token } = useAuth();
  const invalidate = useInvalidateCompany(companyId);
  return useMutation({
    mutationFn: () => resetCompanySignature(token!, companyId),
    onSuccess: invalidate,
  });
}

/**
 * A MUTATION, not a query — like `usePreviewPhoneMessage`: it is fired deliberately as the
 * admin edits, and must never auto-refetch on window focus or remount.
 */
export function usePreviewSignature() {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (body: {
      template: string;
      companyId?: number;
      signatureImageId?: number;
    }) => previewSignature(token!, body),
  });
}

// ── The logo library ────────────────────────────────────────────────────────

export function useSignatureImages(enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: IMAGES_KEY,
    queryFn: () => fetchSignatureImages(token!),
    enabled: !!token && enabled,
  });
}

export function useUploadSignatureImage(
  onProgress?: (fraction: number) => void,
) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, name }: { file: File; name: string }) =>
      uploadSignatureImage(token!, file, name, onProgress),
    onSuccess: () => void qc.invalidateQueries({ queryKey: IMAGES_KEY }),
  });
}

export function useRenameSignatureImage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) =>
      renameSignatureImage(token!, id, name),
    onSuccess: () => void qc.invalidateQueries({ queryKey: IMAGES_KEY }),
  });
}

export function useDeleteSignatureImage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteSignatureImage(token!, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: IMAGES_KEY });
      // A signature pointing at the deleted logo now renders without one, so every
      // company's effective signature just changed — the same asymmetry the defaults
      // mutation has, and the same reason useDeletePhoneAudio invalidates phone-settings.
      void qc.invalidateQueries({ queryKey: ['email-signature'] });
      void qc.invalidateQueries({ queryKey: ['gmail-account'] });
    },
  });
}
