import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { OverrideField } from '@/components/CompanySettings/OverrideField';
import { SignatureField } from '@/components/CompanySettings/SignatureField';
import {
  useCompanySignature,
  usePreviewSignature,
  useResetCompanySignature,
  useSignatureImages,
  useUpdateCompanySignature,
} from '@/hooks/useEmailSignature';
import type { EmailSignatureOverrides } from '@/api/emailSignature';

/**
 * This company's email signature: inherited from the firm-wide default unless overridden.
 *
 * Mirrors `PhoneSettingsSection` — it fetches its own data and uses a pencil → edit-mode
 * affordance, because every neighbouring card on the Details tab behaves that way (the
 * global Company Settings page is a form and saves differently, deliberately).
 *
 * The draft IS the raw `overrides` object with its nulls intact. That is what makes the
 * "Use default" checkboxes correct: ticked = the stored value is NULL = inherit.
 */
export function SignatureSettingsSection({ companyId }: { companyId: number }) {
  const { data, isLoading } = useCompanySignature(companyId);
  const { data: images } = useSignatureImages();
  const save = useUpdateCompanySignature(companyId);
  const reset = useResetCompanySignature(companyId);
  const preview = usePreviewSignature();

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EmailSignatureOverrides | null>(null);
  const [seed, setSeed] = useState<object | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Seeded during render, on `overrides` — see the class docblock.
  if (data?.overrides && data.overrides !== seed) {
    setSeed(data.overrides);
    setDraft({ ...data.overrides });
  }

  // Live preview of what this company would actually send, rendered server-side against
  // this company's own details.
  const effectiveTemplate =
    draft?.signatureHtml ?? data?.defaults.signatureHtml ?? '';
  const effectiveImageId =
    draft?.signatureImageId ?? data?.defaults.signatureImageId ?? 0;
  const runPreview = preview.mutate;
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => {
      runPreview(
        {
          template: effectiveTemplate,
          companyId,
          signatureImageId: effectiveImageId,
        },
        { onSuccess: (r) => setPreviewHtml(r.html) },
      );
    }, 350);
    return () => clearTimeout(t);
  }, [editing, effectiveTemplate, effectiveImageId, companyId, runPreview]);

  if (isLoading || !data || !draft) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Loading signature…</p>
      </Card>
    );
  }

  const { defaults, overrides, effective, previewHtml: savedPreview } = data;
  const overrideCount = Object.values(overrides).filter(
    (v) => v !== null,
  ).length;

  const logoOptions: Record<string, string> = {
    '0': 'No logo',
    ...Object.fromEntries((images ?? []).map((i) => [String(i.id), i.name])),
  };
  const logoLabel = (id: number) =>
    logoOptions[String(id)] ?? 'Unavailable logo';

  const set = <K extends keyof EmailSignatureOverrides>(
    key: K,
    value: EmailSignatureOverrides[K],
  ) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Email signature</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {overrideCount === 0
              ? 'Inherited from the firm-wide default'
              : `${overrideCount} setting${overrideCount === 1 ? '' : 's'} overridden`}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {overrideCount > 0 && !editing && (
            <Badge
              variant="outline"
              className="text-[11px] bg-teal-50 text-teal-700 border-teal-200"
            >
              Custom
            </Badge>
          )}
          {editing ? (
            <>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft({ ...overrides });
                  setEditing(false);
                  setError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={save.isPending}
                onClick={() => {
                  setError(null);
                  // The WHOLE draft, nulls included — a full statement of intent rather
                  // than a diff. That is what the server's hasOwnProperty rule expects.
                  save.mutate(draft, {
                    onSuccess: () => setEditing(false),
                    onError: (e: unknown) =>
                      setError(
                        e instanceof Error ? e.message : 'Save failed',
                      ),
                  });
                }}
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="gap-1"
              onClick={() => setEditing(true)}
            >
              <Pencil size={13} /> Edit
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {!editing ? (
        <div className="flex flex-col gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            What this company sends
          </span>
          <div className="rounded-md border bg-muted/20 p-3 text-sm">
            {savedPreview ? (
              <div dangerouslySetInnerHTML={{ __html: savedPreview }} />
            ) : (
              <span className="text-xs text-muted-foreground italic">
                No signature — this company’s emails are sent unsigned.
              </span>
            )}
          </div>
          {effective.signatureImageId > 0 && (
            <span className="text-[11px] text-muted-foreground">
              Logo: {logoLabel(effective.signatureImageId)}
            </span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <OverrideField
            label="Signature"
            hint="Untick to write a signature just for this company."
            inherited={defaults.signatureHtml}
            value={draft.signatureHtml}
            onChange={(next) => set('signatureHtml', next)}
            renderInherited={(html) =>
              html ? (
                <div
                  className="text-sm"
                  dangerouslySetInnerHTML={{ __html: html }}
                />
              ) : (
                <span className="text-xs italic">No signature</span>
              )
            }
          >
            {(value, setValue) => (
              <SignatureField
                value={value}
                onChange={setValue}
                placeholders={data.placeholders}
                previewHtml={previewHtml}
              />
            )}
          </OverrideField>

          <OverrideField
            label="Logo"
            inherited={defaults.signatureImageId}
            value={draft.signatureImageId}
            onChange={(next) => set('signatureImageId', next)}
            renderInherited={(id) => logoLabel(id)}
          >
            {(value, setValue) => (
              <Select
                items={logoOptions}
                value={String(value)}
                onValueChange={(v) => setValue(Number(v ?? '0'))}
              >
                <SelectTrigger size="sm" className="max-w-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(logoOptions).map(([v, label]) => (
                    <SelectItem key={v} value={v}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </OverrideField>

          {overrideCount > 0 && (
            <div className="border-t pt-3">
              <Button
                size="sm"
                variant="outline"
                disabled={reset.isPending}
                onClick={() =>
                  reset.mutate(undefined, {
                    onSuccess: () => setEditing(false),
                  })
                }
              >
                Reset all to defaults
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
