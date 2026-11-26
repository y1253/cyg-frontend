import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  useQboImportSettings,
  useUpdateQboImportSettings,
} from '@/hooks/useQboImportSettings';

/**
 * step11 part 2 (2026-11-26): the QuickBooks import's one firm-wide switch. Off (default) =
 * the import asks only the date and applies its defaults; on = the AI reviews the proposals
 * and may ask the admin questions first. Saved at once — not part of the phone draft below.
 */
export function QboImportSettingsCard() {
  const { data, isLoading } = useQboImportSettings();
  const save = useUpdateQboImportSettings();
  const on = save.isPending ? !!save.variables?.aiReview : !!data?.aiReview;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">QuickBooks import</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <Switch
            id="qbo-ai-review"
            checked={on}
            disabled={isLoading || save.isPending}
            onCheckedChange={(v) => save.mutate({ aiReview: v })}
            className="mt-0.5"
          />
          <Label htmlFor="qbo-ai-review" className="flex flex-col items-start gap-0.5">
            <span>Let the AI review the import and ask me questions</span>
            <span className="text-xs font-normal text-muted-foreground">
              Off: turning on &ldquo;Send bank transactions to QuickBooks&rdquo; asks only from
              which date, then splits mixed payees and lets QuickBooks win over the
              customer&rsquo;s rules by itself.
            </span>
          </Label>
        </div>
        {save.isError && (
          <p className="text-xs text-destructive">{(save.error as Error).message}</p>
        )}
      </CardContent>
    </Card>
  );
}
