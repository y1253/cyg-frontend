import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SignatureField } from './SignatureField';
import {
  usePreviewSignature,
  useSignatureDefaults,
  useSignatureImages,
  useUpdateSignatureDefaults,
} from '@/hooks/useEmailSignature';
import type { EffectiveEmailSignature } from '@/api/emailSignature';

/** Drops the columns the form can never change, so the dirty check compares like for like. */
function stripMeta(
  row: EffectiveEmailSignature & { id?: number; singleton?: string },
): EffectiveEmailSignature {
  return {
    signatureHtml: row.signatureHtml,
    signatureImageId: row.signatureImageId,
  };
}

/**
 * The firm-wide email signature, inherited by every company.
 *
 * ── WHY ITS OWN SAVE, AND NOT THE PAGE'S STICKY BAR ─────────────────────────────
 * That bar belongs to the phone-settings draft — hours, wording and call handling are one
 * coherent change and save together. The signature is a different settings module with its
 * own query and its own mutation; folding it into that bar would couple two independent
 * modules through one dirty check for no gain. So this card carries the pencil-free
 * edit-and-save affordance the per-company cards already use, and `SignatureImageLibrary`
 * below saves immediately, exactly as `AudioLibrary` does.
 */
export function SignatureDefaultsCard() {
  const { data, isLoading, error } = useSignatureDefaults();
  const { data: images } = useSignatureImages();
  const save = useUpdateSignatureDefaults();
  const preview = usePreviewSignature();

  const [draft, setDraft] = useState<EffectiveEmailSignature | null>(null);
  const [seed, setSeed] = useState<object | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Seeded DURING RENDER rather than in an effect: React re-renders immediately without
  // committing the first pass, so there is no flash of the stale form. Re-seeds after a
  // successful save, so "unsaved changes" compares against what the server stored.
  if (data?.defaults && data.defaults !== seed) {
    setSeed(data.defaults);
    setDraft(stripMeta(data.defaults));
  }

  // The preview is rendered SERVER-side, so what an admin sees is produced by the same
  // renderSignature that will build the real thing — a second client-side renderer would
  // be a second copy of the escaping rules.
  const template = draft?.signatureHtml ?? '';
  const imageId = draft?.signatureImageId ?? 0;
  const runPreview = preview.mutate;
  useEffect(() => {
    if (draft === null) return;
    const t = setTimeout(() => {
      runPreview(
        { template, signatureImageId: imageId },
        { onSuccess: (r) => setPreviewHtml(r.html) },
      );
    }, 350);
    return () => clearTimeout(t);
  }, [template, imageId, draft, runPreview]);

  if (isLoading || !draft) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Card>
    );
  }
  if (error) {
    return (
      <Card className="p-5">
        <p className="text-sm text-destructive">
          {error instanceof Error ? error.message : 'Something went wrong'}
        </p>
      </Card>
    );
  }

  const dirty =
    !!data &&
    JSON.stringify(draft) !== JSON.stringify(stripMeta(data.defaults));

  // "0" is the none sentinel, and it is always offered: without it an admin who has set a
  // logo could never take it off again.
  const logoOptions: Record<string, string> = {
    '0': 'No logo',
    ...Object.fromEntries((images ?? []).map((i) => [String(i.id), i.name])),
  };

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Email signature</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Seeded into every compose, reply and forward. Any company can override it
            from its own Details tab.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <Badge variant="outline" className="text-[11px]">
              Unsaved changes
            </Badge>
          )}
          {dirty && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDraft(stripMeta(data.defaults))}
            >
              Cancel
            </Button>
          )}
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => {
              setSaveError(null);
              save.mutate(draft, {
                onError: (e: unknown) =>
                  setSaveError(e instanceof Error ? e.message : 'Save failed'),
              });
            }}
          >
            {save.isPending ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {saveError && <p className="text-sm text-red-600">{saveError}</p>}

      <SignatureField
        value={draft.signatureHtml}
        onChange={(next) =>
          setDraft((prev) => (prev ? { ...prev, signatureHtml: next } : prev))
        }
        placeholders={data?.placeholders ?? []}
        previewHtml={previewHtml}
      />

      <div className="flex flex-col gap-1.5 max-w-xs">
        <Label className="text-xs">Logo</Label>
        <Select
          items={logoOptions}
          value={String(draft.signatureImageId)}
          onValueChange={(v) =>
            setDraft((prev) =>
              prev ? { ...prev, signatureImageId: Number(v ?? '0') } : prev,
            )
          }
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(logoOptions).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">
          Shown wherever you place the{' '}
          <code className="font-mono">{'{logo}'}</code> token. Leave the token out
          and no image is sent.
        </p>
      </div>
    </Card>
  );
}
