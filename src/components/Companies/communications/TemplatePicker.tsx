import { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';
import type { WhatsAppTemplate } from '@/api/whatsapp';

/**
 * Fill in an approved WhatsApp template.
 *
 * ── WHY THIS EXISTS AT ALL ────────────────────────────────────────────────────
 * Meta forbids a business sending free-form text more than 24 hours after the customer's
 * last message. A pre-approved template is the only thing that may cross that line, which
 * makes this the only way to START a conversation — the thing a phone does for free and
 * the Cloud API deliberately does not.
 *
 * Two homes, which is why it is its own component: the compose dialog (a cold number) and
 * `WhatsAppThreadView`'s closed-window branch (a conversation that has gone quiet).
 */
export function TemplatePicker({
  companyId,
  enabled,
  onChange,
}: {
  companyId: number;
  /** Gate the fetch: the list is only worth loading once the picker is on screen. */
  enabled: boolean;
  /** null while the selection is incomplete, so the caller can disable Send. */
  onChange: (
    value: { name: string; language: string; variables: string[] } | null,
  ) => void;
}) {
  const { data, isLoading, isError } = useWhatsAppTemplates(companyId, enabled);
  const templates = useMemo(() => data ?? [], [data]);
  const [selected, setSelected] = useState<string | null>(null);
  const [variables, setVariables] = useState<string[]>([]);

  // Default to the first template by DERIVING it rather than setting state in an effect:
  // the effect form re-renders once more on open for no benefit, and it fights the user's
  // own choice the moment the list refetches.
  const keyOf = (t: WhatsAppTemplate) => `${t.name}|${t.language}`;
  const effectiveKey =
    selected && templates.some((t) => keyOf(t) === selected)
      ? selected
      : templates[0]
        ? keyOf(templates[0])
        : null;
  const current: WhatsAppTemplate | undefined = templates.find(
    (t) => keyOf(t) === effectiveKey,
  );

  // Report upward. Incomplete means null: every placeholder has to be filled, because a
  // gap is sent to a customer as a literal `{{2}}`.
  useEffect(() => {
    if (!current) {
      onChange(null);
      return;
    }
    const filled = variables.slice(0, current.variableCount);
    const complete =
      filled.length === current.variableCount &&
      filled.every((v) => v.trim() !== '');
    onChange(
      complete
        ? {
            name: current.name,
            language: current.language,
            variables: filled.map((v) => v.trim()),
          }
        : null,
    );
  }, [current, variables, onChange]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-muted-foreground">
        <Loader2 size={13} className="animate-spin" />
        Loading templates…
      </div>
    );
  }

  // An empty list is a legitimate answer, not a failure — see the note below.
  if (isError || templates.length === 0) {
    return (
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
        <p className="font-medium">No approved templates</p>
        <p className="mt-1">
          WhatsApp only allows a pre-approved template as the first message, or after 24
          hours of silence. Create one in Meta Business Manager and it will appear here
          once Meta approves it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-template">Template</Label>
        <select
          id="wa-template"
          value={effectiveKey ?? ''}
          onChange={(e) => {
            setSelected(e.target.value);
            // Clear the old template's values — they are positional, so keeping them
            // would silently carry "Chaim" into a slot that now means an invoice number.
            setVariables([]);
          }}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          {templates.map((t) => (
            <option key={keyOf(t)} value={keyOf(t)}>
              {t.name} ({t.language})
            </option>
          ))}
        </select>
      </div>

      {current && current.variableCount > 0 && (
        <div className="flex flex-col gap-2">
          {Array.from({ length: current.variableCount }, (_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Label htmlFor={`wa-var-${i}`}>{`Value for {{${i + 1}}}`}</Label>
              <Input
                id={`wa-var-${i}`}
                value={variables[i] ?? ''}
                onChange={(e) => {
                  const next = [...variables];
                  next[i] = e.target.value;
                  setVariables(next);
                }}
                autoComplete="off"
              />
            </div>
          ))}
        </div>
      )}

      {/* The preview is the point of filling these in here rather than trusting the
          send: Meta composes the real message from its own copy, so this is the only
          chance to read what the customer will actually get. */}
      {current && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">Preview</span>
          <p className="whitespace-pre-wrap rounded-md bg-emerald-50 p-2.5 text-sm text-emerald-950">
            {previewOf(current.body, variables)}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Mirrors the server's `renderTemplateBody`, including leaving an unfilled placeholder
 * visible rather than blanking it — a gap the user can see is a gap they can fix.
 */
function previewOf(body: string, variables: readonly string[]): string {
  return body.replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, digits: string) => {
    const value = variables[Number(digits) - 1];
    return value === undefined || value.trim() === '' ? whole : value.trim();
  });
}
