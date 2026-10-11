import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { fetchStatementTransactions } from '@/api/customers';

/** A customer statement's rows — fetched only while one is open (`statementId` set). */
export function useStatementTransactions(customerId: number, statementId: number | null) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['customer', customerId, 'statement', statementId, 'transactions'],
    queryFn: () => fetchStatementTransactions(token!, customerId, statementId!),
    enabled: !!token && !!customerId && statementId !== null,
  });
}
