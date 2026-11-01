import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  createDataSource,
  deleteDataSource,
  fetchDataSources,
  updateDataSource,
  type DataSource,
  type DataSourceInput,
} from '@/api/dataSources';

/** step11: the company's "Where the data is" rows. */
export function useDataSources(companyId: number) {
  const { token } = useAuth();
  return useQuery({
    queryKey: ['data-sources', companyId],
    queryFn: () => fetchDataSources(token!, companyId),
    enabled: !!token && !!companyId,
  });
}

/** Every write answers with the whole list — written straight into the cache. */
export function useDataSourceActions(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  const onSuccess = (rows: DataSource[]) => qc.setQueryData(['data-sources', companyId], rows);
  const create = useMutation({
    mutationFn: (input: DataSourceInput) => createDataSource(token!, companyId, input),
    onSuccess,
  });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<DataSourceInput> }) =>
      updateDataSource(token!, companyId, id, input),
    onSuccess,
  });
  const remove = useMutation({
    mutationFn: (id: number) => deleteDataSource(token!, companyId, id),
    onSuccess,
  });
  return { create, update, remove };
}
