import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { updateCompany, type UpdateCompanyData } from '@/api/companies';

export function useUpdateCompany() {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateCompanyData }) =>
      updateCompany(token!, id, data),
    onSuccess: (_result, { id }) => {
      void qc.invalidateQueries({ queryKey: ['companies'] });
      void qc.invalidateQueries({ queryKey: ['company', id] });
      // Saving the Contact or Accountant section rewrites this company's SEEDED contacts
      // (syncAutoContacts on the server), so the address book open in another tab is now
      // stale. Cheap, and without it the list silently disagrees with the Details page.
      void qc.invalidateQueries({ queryKey: ['contacts', id] });
      // The inbox labels callers from those same rows.
      void qc.invalidateQueries({ queryKey: ['phone-timeline', id] });
    },
  });
}
