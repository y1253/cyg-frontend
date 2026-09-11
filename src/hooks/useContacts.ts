import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  fetchContacts,
  createContact,
  updateContact,
  deleteContact,
  type ContactInput,
} from '@/api/contacts';

/**
 * A company's address book.
 *
 * `enabled` is a parameter rather than always-on because the Add-call picker mounts it
 * inside a dialog: there is no reason to hold an open call's browser to a request for a
 * list nobody has opened yet.
 */
export function useContacts(companyId: number, enabled = true) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['contacts', companyId],
    queryFn: () => fetchContacts(token!, companyId),
    enabled: !!token && !!companyId && enabled,
  });
}

export function useCreateContact(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ContactInput) => createContact(token!, companyId, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contacts', companyId] }),
  });
}

export function useUpdateContact(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<ContactInput> }) =>
      updateContact(token!, id, data),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contacts', companyId] }),
  });
}

export function useDeleteContact(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteContact(token!, id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['contacts', companyId] }),
  });
}
