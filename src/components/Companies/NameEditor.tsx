import { useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { GripVertical, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  NamesApiError,
  type FullName,
  type FullSubName,
  type NameContains,
  type NameDescription,
  type NameField,
  type NameFieldKind,
  type NamesFull,
} from '@/api/customerNames';
import { useEditNames } from '@/hooks/useCustomerNamesFull';
import { QBO_KIND_LABELS } from '@/lib/custom-columns';
import { NONE, PARENT, pickValue } from '@/lib/name-picks';
import { ColumnCell } from './BankCustomCell';

/** What the editor works on: a name, or a sub-name (with its own descriptions). */
export type EditTarget =
  | { kind: 'name'; name: FullName; wrapper: boolean }
  | {
      kind: 'sub';
      sub: FullSubName;
      descriptions: NameDescription[];
      contains: NameContains[];
    };

const NEW_GROUP = '__new__';

const FIELD_KINDS: Record<NameFieldKind, string> = {
  PHONE: 'Phone',
  EMAIL: 'Email',
  ADDRESS: 'Address',
  WEBSITE: 'Website',
  NOTE: 'Note',
  TEXT: 'Other',
};

/**
 * 2026-11-27 (user: "same idea like the customer system"): the customer site's per-name
 * settings on the internal Rules tab — group, profile, split rules, the name's default answer
 * in each of the book's columns (QuickBooks class / location / customer / custom fields), and
 * the descriptions it follows (remove one, narrow to "contains …", add one; drag one onto
 * another name with the grip). Every change goes through the customer API's own code (it
 * re-files the rows; QuickBooks follows) and the fresh view comes back.
 */
export function NameEditor({
  companyId,
  target,
  data,
  canEdit,
  dragDescription,
}: {
  companyId: number;
  target: EditTarget;
  data: NamesFull;
  canEdit: boolean;
  dragDescription: (d: NameDescription) => ((e: ReactPointerEvent) => void) | null;
}) {
  const edit = useEditNames(companyId);
  const [retry, setRetry] = useState<{ path: string; body: Record<string, unknown> } | null>(
    null,
  );
  const isSub = target.kind === 'sub';
  const sub = isSub ? target.sub : null;
  const name = target.kind === 'name' ? target.name : null;
  const wrapper = target.kind === 'name' && target.wrapper;
  const label = sub ? sub.name : name!.name;

  const send = (
    method: 'PUT' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    body: Record<string, unknown>,
  ) => {
    setRetry(null);
    edit.mutate(
      { method, path, body },
      {
        onError: (err) => {
          // A description another name holds: staff decide to take it away.
          if (err instanceof NamesApiError && err.status === 409 && method === 'PUT')
            setRetry({ path, body });
        },
      },
    );
  };
  const settings = (body: Record<string, unknown>) =>
    sub
      ? send('PATCH', `/sub-names/${sub.id}/settings`, body)
      : null;

  // ── Group ──
  const groupValue = sub ? (sub.group ?? PARENT) : name!.group;
  const [newGroup, setNewGroup] = useState<string | null>(null);
  const groupItems = {
    ...(sub ? { [PARENT]: 'Same as its name' } : {}),
    ...Object.fromEntries(data.names.groups.map((g) => [g.key, g.label])),
    [NEW_GROUP]: 'New group…',
  };
  const setGroup = (v: string | null) => {
    if (!v) return;
    if (v === NEW_GROUP) {
      setNewGroup('');
      return;
    }
    if (sub) settings({ group: v === PARENT ? null : v });
    else send('PUT', '/names/group', { name: name!.name, group: v });
  };

  // ── Split rules ──
  const pick = pickValue(
    data,
    sub ? sub.agencyIds : name!.agencyIds,
    !!sub && !sub.ownAgencies,
  );
  const pickItems = {
    ...(sub ? { [PARENT]: 'Same as its name' } : {}),
    [NONE]: 'No split rules',
    ...(pick === 'mixed' ? { mixed: 'Several (pick one)' } : {}),
    ...Object.fromEntries(data.tax.groups.map((g) => [`g:${g.id}`, `Group: ${g.name}`])),
    ...Object.fromEntries(
      data.tax.agencies
        .filter((a) => a.groupId === null)
        .map((a) => [`a:${a.id}`, a.name]),
    ),
  };
  const setPick = (v: string | null) => {
    if (!v || v === 'mixed') return;
    let agencyIds: number[] | null = [];
    let alone = false;
    if (v === PARENT) agencyIds = null;
    else if (v.startsWith('g:'))
      agencyIds = data.tax.groups.find((g) => g.id === Number(v.slice(2)))?.agencyIds ?? [];
    else if (v.startsWith('a:')) {
      const a = data.tax.agencies.find((x) => x.id === Number(v.slice(2)));
      agencyIds = a ? [a.id] : [];
      alone = a?.groupId != null;
    }
    if (sub) settings({ agencyIds, alone });
    else send('PUT', '/names/agencies', { name: name!.name, agencyIds: agencyIds ?? [], alone });
  };

  // ── Profile ──
  const stored = sub ? sub.fields : name!.fields;
  const [fields, setFields] = useState<NameField[] | null>(null);
  const shownFields = fields ?? stored;
  const saveFields = () => {
    const clean = shownFields.filter((f) => f.value.trim());
    if (sub) settings({ fields: clean });
    else send('PUT', '/names/fields', { name: name!.name, fields: clean });
    setFields(null);
  };

  // ── Descriptions ──
  const descriptions = sub ? (target as { descriptions: NameDescription[] }).descriptions : name!.descriptions;
  const contains = sub ? (target as { contains: NameContains[] }).contains : name!.followsContains;
  const [addText, setAddText] = useState('');

  const error = edit.error instanceof Error ? edit.error.message : null;
  const disabled = !canEdit || edit.isPending;

  return (
    <div className="flex min-w-0 flex-col gap-4 border-t bg-muted/20 px-4 py-3 text-sm">
      {sub && canEdit && (
        <Section title="Name">
          <RenameField
            key={sub.name}
            value={sub.name}
            disabled={disabled}
            onSave={(v) => settings({ name: v })}
          />
        </Section>
      )}

      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Section title="Group">
          {newGroup === null ? (
            <Select items={groupItems} value={groupValue} onValueChange={setGroup} disabled={disabled}>
              <SelectTrigger size="sm" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(groupItems).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const n = newGroup.trim();
                if (!n) return;
                send('POST', '/name-groups', { name: n });
                setNewGroup(null);
              }}
            >
              <Input
                autoFocus
                className="h-8"
                placeholder="e.g. Employees"
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
              />
              <Button size="sm" type="submit" disabled={!newGroup.trim()}>
                Add
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setNewGroup(null)}>
                Cancel
              </Button>
            </form>
          )}
          {newGroup !== null && (
            <p className="text-xs text-muted-foreground">
              Then pick the new group for this name.
            </p>
          )}
        </Section>

        <Section title="Split rules">
          {wrapper ? (
            <p className="text-xs text-muted-foreground">Set on each of its sub-names.</p>
          ) : (
            <Select items={pickItems} value={pick} onValueChange={setPick} disabled={disabled}>
              <SelectTrigger size="sm" className="w-full min-w-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {Object.entries(pickItems).map(([k, v]) => (
                  <SelectItem key={k} value={k} disabled={k === 'mixed'}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Section>
      </div>

      {data.columns.length > 0 && (
        <Section title="Custom fields — this name's default (fills its empty cells)">
          {wrapper ? (
            <p className="text-xs text-muted-foreground">Set on each of its sub-names.</p>
          ) : (
            <div className="grid min-w-0 gap-2 sm:grid-cols-2">
              {data.columns.map((c) => {
                const a = data.nameAnswers.find(
                  (x) =>
                    x.columnId === c.id &&
                    (sub ? x.subNameId === sub.id : x.subNameId === null && x.name === name!.name),
                );
                return (
                  <label key={c.id} className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-xs text-muted-foreground">
                      {c.name}
                      {c.qbo && (
                        <span className="ml-1 text-[#2CA01C]" title={QBO_KIND_LABELS[c.qbo]}>
                          · QuickBooks
                        </span>
                      )}
                    </span>
                    <ColumnCell
                      column={c}
                      cell={a}
                      canEdit={canEdit}
                      serverError={null}
                      onSave={(v) =>
                        send('PUT', `/custom-columns/${c.id}/names`, {
                          ...(sub ? { subNameId: sub.id } : { name: name!.name }),
                          value: v.value,
                          dropDownId: v.dropDownId,
                        })
                      }
                    />
                  </label>
                );
              })}
            </div>
          )}
        </Section>
      )}

      <Section title="Profile">
        <div className="flex min-w-0 flex-col gap-2">
          {shownFields.length === 0 && (
            <p className="text-xs text-muted-foreground">No phone, email or address yet.</p>
          )}
          {shownFields.map((f, i) => (
            <div key={i} className="flex min-w-0 flex-wrap items-center gap-2">
              <Select
                items={FIELD_KINDS}
                value={f.kind}
                disabled={disabled}
                onValueChange={(v) =>
                  setFields(
                    shownFields.map((x, j) =>
                      j === i ? { ...x, kind: (v ?? 'TEXT') as NameFieldKind } : x,
                    ),
                  )
                }
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(FIELD_KINDS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      {v}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                className="h-8 min-w-0 flex-1 basis-40"
                value={f.value}
                disabled={disabled}
                placeholder={FIELD_KINDS[f.kind]}
                onChange={(e) =>
                  setFields(
                    shownFields.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)),
                  )
                }
              />
              {canEdit && (
                <Button
                  size="icon-sm"
                  variant="ghost"
                  title="Remove"
                  onClick={() => setFields(shownFields.filter((_, j) => j !== i))}
                >
                  <X size={14} />
                </Button>
              )}
            </div>
          ))}
          {canEdit && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setFields([...shownFields, { kind: 'PHONE', label: '', value: '' }])
                }
              >
                <Plus size={14} /> Add
              </Button>
              {fields !== null && (
                <>
                  <Button size="sm" disabled={edit.isPending} onClick={saveFields}>
                    Save profile
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setFields(null)}>
                    Cancel
                  </Button>
                </>
              )}
            </div>
          )}
        </div>
      </Section>

      <Section title="Descriptions it follows">
        {wrapper ? (
          <p className="text-xs text-muted-foreground">
            Its descriptions sit under its sub-names.
          </p>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">
            {descriptions.length === 0 && contains.length === 0 && (
              <p className="text-xs text-muted-foreground">No descriptions yet.</p>
            )}
            {descriptions.map((d) => {
              const handle = canEdit ? dragDescription(d) : null;
              return (
                <div key={d.key} className="flex min-w-0 items-start gap-2 rounded px-1 py-0.5 hover:bg-background">
                  {handle ? (
                    <span
                      onPointerDown={handle}
                      title="Drag onto another name to move it there"
                      className="mt-0.5 shrink-0 cursor-grab touch-none text-muted-foreground"
                    >
                      <GripVertical className="size-3.5" />
                    </span>
                  ) : (
                    <span className="size-3.5 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="break-words text-xs" title={d.description}>
                      {d.description}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {d.category} · {d.rows} row{d.rows === 1 ? '' : 's'} ·{' '}
                      {d.rule
                        ? d.rule.matchType === 'CONTAINS'
                          ? `contains “${d.rule.text}”`
                          : 'saved rule'
                        : 'read by the AI'}
                    </div>
                  </div>
                  {canEdit && d.rule?.matchType === 'DESCRIPTION' && (
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      title="Remove this rule (the rows go back to what the AI read)"
                      disabled={edit.isPending}
                      onClick={() =>
                        send('DELETE', '/names/description-rule', {
                          matchType: 'DESCRIPTION',
                          matchKey: d.rule!.matchKey,
                        })
                      }
                    >
                      <X size={14} />
                    </Button>
                  )}
                </div>
              );
            })}
            {contains.map((c) => (
              <div key={c.key} className="flex min-w-0 items-start gap-2 rounded px-1 py-0.5">
                <span className="size-3.5 shrink-0" />
                <div className="min-w-0 flex-1 text-xs">
                  Description contains “{c.text}”
                  <span className="text-[11px] text-muted-foreground">
                    {' '}
                    · {c.rows} row{c.rows === 1 ? '' : 's'}
                  </span>
                </div>
                {canEdit && (
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    title="Remove this rule"
                    disabled={edit.isPending}
                    onClick={() =>
                      send('DELETE', '/names/description-rule', {
                        matchType: 'CONTAINS',
                        matchKey: c.key,
                      })
                    }
                  >
                    <X size={14} />
                  </Button>
                )}
              </div>
            ))}
            {canEdit && !sub && (
              <form
                className="mt-1 flex min-w-0 gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const text = addText.trim();
                  if (text.length < 3) return;
                  send('PUT', '/names/description-rule', {
                    matchType: 'CONTAINS',
                    matchKey: text,
                    name: label,
                    category: null,
                  });
                  setAddText('');
                }}
              >
                <Input
                  className="h-8 min-w-0 flex-1"
                  placeholder="Every description containing… (3+ characters)"
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                />
                <Button size="sm" type="submit" disabled={addText.trim().length < 3 || edit.isPending}>
                  Add
                </Button>
              </form>
            )}
          </div>
        )}
      </Section>

      {(error || edit.isPending) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {edit.isPending && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {error && <span className="text-destructive">{error}</span>}
          {retry && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => send('PUT', retry.path, { ...retry.body, replace: true })}
            >
              Take it away from the other name
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}

function RenameField({
  value,
  disabled,
  onSave,
}: {
  value: string;
  disabled: boolean;
  onSave: (v: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <form
      className="flex min-w-0 gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
      }}
    >
      <Input
        className="h-8 min-w-0 flex-1"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
      />
      <Button size="sm" type="submit" disabled={disabled || !draft.trim() || draft.trim() === value}>
        Rename
      </Button>
    </form>
  );
}
