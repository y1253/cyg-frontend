import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import { canManage } from '@/lib/roles';
import { useWhatsAppTemplates } from '@/hooks/useWhatsAppTemplates';
import { useCreateWhatsAppTemplate } from '@/hooks/useCreateWhatsAppTemplate';
import { useTemplateDraft } from '@/hooks/useTemplateDraft';
import {
  TEMPLATE_CATEGORIES,
  isSendableTemplate,
  type WhatsAppTemplate,
} from '@/api/whatsapp';

/** `{{1}}`, `{{ 2 }}` — Meta writes them positionally, one-based. */
const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g;
const BODY_PLACEHOLDER = 'Hi {{1}}, your {{2}} is ready to collect.';
const VARIABLE_HINT =
  'Use {{1}}, {{2}} for anything that changes from message to message.';

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
  const { user } = useAuth();
  const canCreate = canManage(user);
  const { data, isLoading, isError } = useWhatsAppTemplates(companyId, enabled);
  const all = useMemo(() => data ?? [], [data]);
  /**
   * ⚠️ The list is no longer APPROVED-only — that filter was ours, and it is why a
   * template somebody had just submitted was invisible for the whole review. Only
   * sendable ones may be SELECTED; the rest are reported below so the person who
   * submitted one can see what became of it.
   */
  const templates = useMemo(() => all.filter(isSendableTemplate), [all]);
  const awaiting = useMemo(() => all.filter((t) => !isSendableTemplate(t)), [all]);
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
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
      <div className="flex flex-col gap-2">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-medium">No approved templates</p>
          <p className="mt-1">
            WhatsApp only allows a pre-approved template as the first message, or after 24
            hours of silence.
          </p>
        </div>
        <TemplateStatusList templates={awaiting} />
        {canCreate &&
          (creating ? (
            <CreateTemplatePanel
              companyId={companyId}
              onClose={() => setCreating(false)}
            />
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit gap-1"
                onClick={() => setCreating(true)}
              >
                <Plus size={13} /> Create a template
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-fit gap-1"
                onClick={() => setGenerating(true)}
              >
                <Sparkles size={13} /> Generate a template
              </Button>
            </div>
          ))}
          {canCreate && generating && (
            <GenerateTemplatePanel
              companyId={companyId}
              onClose={() => setGenerating(false)}
            />
          )}
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

      {/* Also here, not only in the empty state: once a company has ONE approved
          template the empty branch never renders again, and a second submission would be
          invisible for its whole review — the very problem this feature exists to fix. */}
      <TemplateStatusList templates={awaiting} />
      {canCreate &&
        (creating ? (
          <CreateTemplatePanel
            companyId={companyId}
            onClose={() => setCreating(false)}
          />
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit gap-1"
              onClick={() => setCreating(true)}
            >
              <Plus size={13} /> Create a template
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="w-fit gap-1"
              onClick={() => setGenerating(true)}
            >
              <Sparkles size={13} /> Generate a template
            </Button>
          </div>
        ))}
        {canCreate && generating && (
          <GenerateTemplatePanel
            companyId={companyId}
            onClose={() => setGenerating(false)}
          />
        )}
    </div>
  );
}

/**
 * Mirrors the server's `renderTemplateBody`, including leaving an unfilled placeholder
 * visible rather than blanking it — a gap the user can see is a gap they can fix.
 */
function previewOf(body: string | null, variables: readonly string[]): string {
  return (body ?? '').replace(/\{\{\s*(\d+)\s*\}\}/g, (whole, digits: string) => {
    const value = variables[Number(digits) - 1];
    return value === undefined || value.trim() === '' ? whole : value.trim();
  });
}

/**
 * Templates Meta has not approved — yet, or at all.
 *
 * Shown rather than hidden, because the person reading this is usually the person who
 * submitted one: "pending" is the answer to "where did it go", and a rejection is useless
 * without Meta's reason for it. Before this, our own APPROVED-only filter meant a
 * submission was invisible for the entire review.
 */
function TemplateStatusList({
  templates,
}: {
  templates: readonly WhatsAppTemplate[];
}) {
  if (templates.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-2.5">
      <span className="text-xs font-medium text-muted-foreground">
        Submitted, not yet sendable
      </span>
      {templates.map((t) => (
        <div key={`${t.name}|${t.language}`} className="text-xs">
          <span className="font-medium">{t.name}</span>{' '}
          <span className="text-muted-foreground">({t.language})</span>{' '}
          <span
            className={
              t.status === 'REJECTED' ? 'text-destructive' : 'text-amber-700'
            }
          >
            {t.status.toLowerCase()}
          </span>
          {t.rejectedReason && (
            <p className="text-muted-foreground">{t.rejectedReason}</p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Submit a template for Meta's review, inline.
 *
 * ⚠️ An inline panel, NOT a nested Dialog. Both of this picker's homes already render
 * inside one, and stacking base-ui dialogs is a focus and scroll-lock fight for nothing.
 *
 * The example inputs are not optional politeness: Meta rejects a submission whose body
 * contains a placeholder and carries no example, with wording that never says so.
 */
function CreateTemplatePanel({
  companyId,
  onClose,
  initial,
}: {
  companyId: number;
  onClose: () => void;
  /**
   * A generated draft to open with. The panel still owns every field afterwards -- the
   * point of handing it over rather than submitting straight from the generator is that a
   * person reads and edits it first, because a name Meta rejects cannot be retried for
   * four weeks.
   */
  initial?: { name: string; category: string; body: string; examples: string[] };
}) {
  const create = useCreateWhatsAppTemplate(companyId);
  const [name, setName] = useState(initial?.name ?? '');
  const [language, setLanguage] = useState('en_US');
  const [category, setCategory] = useState<string>(
    initial?.category ?? TEMPLATE_CATEGORIES[0],
  );
  const [body, setBody] = useState(initial?.body ?? '');
  const [examples, setExamples] = useState<string[]>(initial?.examples ?? []);

  // Highest index, not occurrence count — a repeated placeholder still takes one value.
  // Mirrors `countTemplateVariables` on the server.
  const variableCount = useMemo(() => {
    let highest = 0;
    for (const m of body.matchAll(PLACEHOLDER)) {
      const n = Number(m[1]);
      if (Number.isFinite(n) && n > highest) highest = n;
    }
    return highest;
  }, [body]);

  const submit = () => {
    create.mutate(
      {
        name: name.trim().toLowerCase(),
        language,
        category,
        body: body.trim(),
        examples: Array.from(
          { length: variableCount },
          (_, i) => examples[i] ?? '',
        ),
      },
      { onSuccess: onClose },
    );
  };

  return (
    <div className="flex flex-col gap-2.5 rounded-md border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-tpl-name">Name</Label>
        <Input
          id="wa-tpl-name"
          value={name}
          placeholder="appointment_reminder"
          // Lowercased as you type: Meta REJECTS uppercase rather than folding it, and
          // its 400 is a poor way to learn that.
          onChange={(e) =>
            setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))
          }
        />
      </div>

      <div className="flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="wa-tpl-lang">Language</Label>
          <Input
            id="wa-tpl-lang"
            value={language}
            placeholder="en_US"
            onChange={(e) => setLanguage(e.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="wa-tpl-cat">Category</Label>
          <select
            id="wa-tpl-cat"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c.toLowerCase()}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="wa-tpl-body">Message</Label>
        <Textarea
          id="wa-tpl-body"
          value={body}
          rows={3}
          maxLength={1024}
          placeholder={BODY_PLACEHOLDER}
          onChange={(e) => setBody(e.target.value)}
        />
        <span className="text-xs text-muted-foreground">
          {VARIABLE_HINT}
        </span>
      </div>

      {variableCount > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>Example values</Label>
          <span className="text-xs text-muted-foreground">
            Meta reviews the template with these filled in, and refuses it without them.
          </span>
          {Array.from({ length: variableCount }, (_, i) => (
            <Input
              key={i}
              value={examples[i] ?? ''}
              placeholder={`Example for placeholder ${i + 1}`}
              onChange={(e) =>
                setExamples((prev) => {
                  const next = [...prev];
                  next[i] = e.target.value;
                  return next;
                })
              }
            />
          ))}
        </div>
      )}

      {create.isError && (
        <p className="text-xs text-destructive">
          {(create.error as Error)?.message ?? 'Could not create the template'}
        </p>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          className="bg-emerald-600 text-white hover:bg-emerald-700"
          disabled={create.isPending || !name.trim() || !body.trim()}
          onClick={submit}
        >
          {create.isPending ? 'Submitting…' : 'Submit for review'}
        </Button>
      </div>
    </div>
  );
}

/**
 * Describe what the message should do, and have the system draft it.
 *
 * ⚠️ It fills the CREATE FORM rather than submitting. Accepting a draft hands it to
 * `CreateTemplatePanel`, which owns every field from then on and runs the unchanged
 * submit path — so a person always reads the final wording. That is not ceremony: a
 * template name Meta rejects is unusable for four weeks, and Meta reviewers read the
 * example values too.
 *
 * Shape copied from `PolishPanel` / `PolishButton`: a preview awaiting a decision, the
 * trigger hidden once one exists, Accept / Regenerate / Discard, errors underneath.
 */
function GenerateTemplatePanel({
  companyId,
  onClose,
}: {
  companyId: number;
  onClose: () => void;
}) {
  const draft = useTemplateDraft(companyId);
  const [description, setDescription] = useState('');
  // Separate from `preview`, so Discard can drop a draft without it counting as accepted.
  const [accepted, setAccepted] = useState(false);

  // Accepted: hand it to the create form, which takes over entirely.
  if (draft.preview && accepted) {
    return (
      <CreateTemplatePanel
        companyId={companyId}
        initial={draft.preview}
        onClose={onClose}
      />
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <span className="text-xs font-medium">Generate a template</span>
      <Textarea
        rows={3}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="What should this message do? e.g. tell a client their tax return is ready to sign"
      />

      {draft.preview ? (
        <div className="flex flex-col gap-2 rounded-md border border-teal-200 bg-teal-50/60 p-2.5">
          <span className="flex items-center gap-1 text-xs font-medium text-teal-800">
            <Sparkles size={13} /> Suggested template
          </span>
          <p className="whitespace-pre-wrap text-sm">{draft.preview.body}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setAccepted(true)}>
              Use this
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={draft.isPending}
              onClick={draft.regenerate}
            >
              {draft.isPending ? 'Generating…' : 'Try again'}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={draft.reset}>
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={draft.isPending || description.trim().length < 10}
            onClick={() => draft.run(description)}
          >
            {draft.isPending ? 'Generating…' : 'Generate'}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      )}

      {draft.isError && (
        <p className="text-xs text-destructive">
          {draft.error?.message ?? 'Could not draft a template'}
        </p>
      )}
    </div>
  );
}
