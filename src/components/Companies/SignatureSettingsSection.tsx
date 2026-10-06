import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { OverrideField } from '@/components/CompanySettings/OverrideField';
import { SignatureField } from '@/components/CompanySettings/SignatureField';
import {
  useCompanySignature,
  useCompanySignatureImages,
  usePreviewSignature,
  useResetCompanySignature,
  useUpdateCompanySignature,
} from '@/hooks/useEmailSignature';
import {
  LOGO_LAYOUT_KEYS,
  type EmailSignatureOverrides,
  type LogoLayoutFields,
} from '@/api/emailSignature';
import { LogoLayoutControls } from '@/components/CompanySettings/LogoLayoutControls';
import { SignatureLogoPicker } from './SignatureLogoPicker';
import { describeLogoLayout, logoLabel } from './signature-logo';

/**
 * The four layout fields are overridden as ONE group in the UI — a "Use default" box per
 * field would be noise for what an admin thinks of as one decision. Server-side they stay
 * separate nullable columns, so the group is: inheriting iff all four are null, and any
 * partially-set state left by a direct API call is completed from the defaults.
 */
function layoutOverride(
  draft: EmailSignatureOverrides,
  defaults: LogoLayoutFields,
): LogoLayoutFields | null {
  if (LOGO_LAYOUT_KEYS.every((k) => draft[k] === null)) return null;
  return {
    logoWidth: draft.logoWidth ?? defaults.logoWidth,
    logoPosition: draft.logoPosition ?? defaults.logoPosition,
    logoAlign: draft.logoAlign ?? defaults.logoAlign,
    logoGap: draft.logoGap ?? defaults.logoGap,
  };
}

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
  // Scoped, not the firm-wide list: this company may also have logos of its own, and a
  // label lookup that could not see them would render its own selection as "Unavailable".
  const { data: images } = useCompanySignatureImages(companyId);
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
  const logoWidth = draft?.logoWidth ?? data?.defaults.logoWidth;
  const logoPosition = draft?.logoPosition ?? data?.defaults.logoPosition;
  const logoAlign = draft?.logoAlign ?? data?.defaults.logoAlign;
  const logoGap = draft?.logoGap ?? data?.defaults.logoGap;
  const runPreview = preview.mutate;
  useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => {
      runPreview(
        {
          template: effectiveTemplate,
          companyId,
          signatureImageId: effectiveImageId,
          logoWidth,
          logoPosition,
          logoAlign,
          logoGap,
        },
        { onSuccess: (r) => setPreviewHtml(r.html) },
      );
    }, 350);
    return () => clearTimeout(t);
  }, [
    editing,
    effectiveTemplate,
    effectiveImageId,
    logoWidth,
    logoPosition,
    logoAlign,
    logoGap,
    companyId,
    runPreview,
  ]);

  if (isLoading || !data || !draft) {
    return (
      <Card className="p-5">
        <p className="text-sm text-muted-foreground">Loading signature…</p>
      </Card>
    );
  }

  const { defaults, overrides, effective, previewHtml: savedPreview } = data;
  // The four layout columns are one setting in the UI, so they count once here.
  const overrideCount =
    (overrides.signatureHtml !== null ? 1 : 0) +
    (overrides.signatureImageId !== null ? 1 : 0) +
    (LOGO_LAYOUT_KEYS.some((k) => overrides[k] !== null) ? 1 : 0);

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
              Logo: {logoLabel(images, effective.signatureImageId)}
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
            hint="Untick to give this company its own logo."
            inherited={defaults.signatureImageId}
            value={draft.signatureImageId}
            onChange={(next) => set('signatureImageId', next)}
            // Text, not a picker: the inherited state is a read-only statement about the
            // firm-wide default, and rendering a grid there would invite clicking it.
            renderInherited={(id) => logoLabel(images, id)}
          >
            {(value, setValue) => (
              <SignatureLogoPicker
                companyId={companyId}
                value={value}
                onChange={setValue}
              />
            )}
          </OverrideField>

          {(draft.signatureImageId ?? defaults.signatureImageId) > 0 && (
            <OverrideField<LogoLayoutFields>
              label="Logo size & placement"
              hint="Untick to resize the logo or move it beside, above or below the text for this company."
              inherited={defaults}
              value={layoutOverride(draft, defaults)}
              onChange={(next) =>
                setDraft((prev) =>
                  prev
                    ? {
                        ...prev,
                        // null re-ticks "Use default" for all four at once.
                        logoWidth: next?.logoWidth ?? null,
                        logoPosition: next?.logoPosition ?? null,
                        logoAlign: next?.logoAlign ?? null,
                        logoGap: next?.logoGap ?? null,
                      }
                    : prev,
                )
              }
              renderInherited={describeLogoLayout}
            >
              {(value, setValue) => (
                <LogoLayoutControls value={value} onChange={setValue} />
              )}
            </OverrideField>
          )}

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
