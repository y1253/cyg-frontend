import { useMutation } from '@tanstack/react-query';
import { registerCompany, type RegisterCompanyData } from '../api/companies';

export function useRegisterCompany() {
  return useMutation({
    mutationFn: (data: RegisterCompanyData) => registerCompany(data),
  });
}
