import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import {
  removeCustomerItemRule,
  removeCustomerNameRule,
  saveCustomerItemRule,
  saveCustomerNameRule,
  type CustomerRulesView,
  type RuleMatchType,
} from '@/api/customerRules';

/** One manager change to a customer rule — every route answers the fresh view. */
export type CustomerRuleChange =
  | {
      action: 'save-name';
      matchType: RuleMatchType;
      matchKey: string;
      name: string | null;
      category: string | null;
    }
  | { action: 'remove-name'; matchType: RuleMatchType; matchKey: string }
  | { action: 'save-item'; itemKey: string; category: string }
  | { action: 'remove-item'; itemKey: string };

export function useChangeCustomerRule(companyId: number) {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: CustomerRuleChange): Promise<CustomerRulesView> => {
      switch (c.action) {
        case 'save-name':
          return saveCustomerNameRule(token!, companyId, {
            matchType: c.matchType,
            matchKey: c.matchKey,
            name: c.name,
            category: c.category,
          });
        case 'remove-name':
          return removeCustomerNameRule(token!, companyId, {
            matchType: c.matchType,
            matchKey: c.matchKey,
          });
        case 'save-item':
          return saveCustomerItemRule(token!, companyId, {
            itemKey: c.itemKey,
            category: c.category,
          });
        case 'remove-item':
          return removeCustomerItemRule(token!, companyId, { itemKey: c.itemKey });
      }
    },
    onSuccess: (view) => qc.setQueryData(['customer-rules', companyId], view),
  });
}
