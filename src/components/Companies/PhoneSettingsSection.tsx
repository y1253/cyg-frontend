import { useState } from 'react';
import { Clock, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { timezoneItems, timezoneOptions } from '@/lib/timezones';
import {
  useCompanyPhoneSettings,
  useResetCompanyPhoneSettings,
  useUpdateCompanyPhoneSettings,
} from '@/hooks/usePhoneSettings';
import type { PhoneSettingsOverrides, WeeklyHours } from '@/api/phoneSettings';
import { PhoneHoursEditor } from '@/components/CompanySettings/PhoneHoursEditor';
import { usePhoneAudio } from '@/hooks/usePhoneAudio';
import { summariseWeek } from '@/lib/weekly-hours';
import { MessageField } from '@/components/CompanySettings/MessageField';
import { renderPreview } from '@/lib/message-preview';
import {
  OverrideField,
  SegmentedChoice,
} from '@/components/CompanySettings/OverrideField';
import { VOICEMAIL_SECONDS, voicemailLengthLabel } from '@/lib/voicemail';

const RING_SECONDS = [15, 20, 30, 45, 60];

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Error';
}

/**
 * This company's phone hours and messages — every field either inherited from the global
 * Company Settings page or overridden here.
 *
 * Mirrors `PhoneNumberSection`: a self-contained Card that takes `companyId` and fetches
 * its own data. Unlike the global page it uses a pencil → edit-mode affordance, because
 * every neighbouring card on the Details tab behaves that way and a permanently-open form
 * would read as the odd one out.
 */
export function PhoneSettingsSection({ companyId }: { companyId: number }) {
  const { data, isLoading } = useCompanyPhoneSettings(companyId);
  const { data: audioTracks } = usePhoneAudio();
  // "0" is always present: without a None option a company that has been given hold
  // music could never be put back to silence.
  const holdOptions: Record<string, string> = {
    '0': 'None (silence)',
    ...Object.fromEntries((audioTracks ?? []).map((t) => [String(t.id), t.name])),
  };
  const holdLabel = (id: number) =>
    holdOptions[String(id)] ?? 'Unavailable track';
  const save = useUpdateCompanyPhoneSettings(companyId);
  const reset = useResetCompanyPhoneSettings(companyId);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PhoneSettingsOverrides | null>(null);
  const [seed, setSeed] = useState<PhoneSettingsOverrides | null>(null);

  // Re-seed the draft whenever the server hands back a different object, so leaving edit
  // mode and coming back never shows a stale draft, and a successful save leaves the form
  // showing what was actually stored.
  //
  // Done DURING RENDER rather than in an effect: React re-renders immediately without
  // committing the first pass, so there is no flash of the old draft and no cascading
  // render. This is the documented "adjusting state when props change" pattern.
  if (data && data.overrides !== seed) {
    setSeed(data.overrides);
    setDraft(data.overrides);
  }

  if (isLoading || !data || !draft) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock size={16} className="text-teal-600" />
            Phone Hours &amp; Messages
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </CardContent>
      </Card>
    );
  }

  const { defaults, effective, overrides, placeholders } = data;
  const overrideCount = Object.values(overrides).filter((v) => v !== null).length;

  /**
   * Whether this company will actually take a message, for labelling the after-hours
   * choice ("Hang up" vs "Take a message").
   *
   * Read from the UNSAVED draft when it holds an override, else from `effective` — NOT
   * from `defaults`. `??` rather than `||`, because `false` is a value an admin chose and
   * `||` would silently show them the inherited label instead of their own.
   */
  const voicemailOn = draft.voicemailEnabled ?? effective.voicemailEnabled;

  const set = <K extends keyof PhoneSettingsOverrides>(
    key: K,
    value: PhoneSettingsOverrides[K],
  ) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const previewVars = {
    company: data.companyName,
    phone: '+1 438 256 1210',
    hours: data.hoursToday,
  };

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Clock size={16} className="text-teal-600" />
          Phone Hours &amp; Messages
          {effective.hoursEnabled && (
            <Badge
              variant="outline"
              className={
                data.isOpenNow
                  ? 'text-[10px] px-1.5 py-0 bg-teal-50 text-teal-700 border-teal-200'
                  : 'text-[10px] px-1.5 py-0 text-muted-foreground'
              }
            >
              {data.isOpenNow ? 'Open now' : 'Closed now'}
            </Badge>
          )}
        </CardTitle>

        <div className="flex items-center gap-2">
          {save.isError && (
            <span className="text-xs text-destructive">{errorText(save.error)}</span>
          )}
          {editing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                disabled={save.isPending}
                onClick={() => {
                  setDraft(data.overrides);
                  save.reset();
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate(draft, { onSuccess: () => setEditing(false) })
                }
              >
                {save.isPending ? 'Saving…' : 'Save'}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              Edit
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!editing ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span>
                {effective.hoursEnabled
                  ? summariseWeek(effective.weeklyHours)
                  : 'Rings at any time — business hours are off'}
              </span>
              {effective.hoursEnabled && (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span className="text-muted-foreground">{effective.timezone}</span>
                </>
              )}
              <span className="text-muted-foreground">·</span>
              <span className="text-muted-foreground">
                {overrideCount === 0
                  ? 'all settings inherited'
                  : `${overrideCount} setting${overrideCount === 1 ? '' : 's'} overridden`}
              </span>
            </div>
            <p className="text-sm text-muted-foreground italic">
              {effective.playGreeting
                ? `“${renderPreview(effective.greetingMessage, placeholders, previewVars)}”`
                : 'No greeting — the phone rings immediately.'}
            </p>
          </div>
        ) : (
          <>
            <OverrideField
              label="Apply business hours"
              inherited={defaults.hoursEnabled}
              value={draft.hoursEnabled}
              onChange={(v) => set('hoursEnabled', v)}
              renderInherited={(v) => (v ? 'On' : 'Off — rings at any time')}
            >
              {(value, setValue) => (
                <SegmentedChoice
                  value={value}
                  onChange={setValue}
                  options={[
                    { value: false, label: 'Off' },
                    { value: true, label: 'On' },
                  ]}
                />
              )}
            </OverrideField>

            <OverrideField
              label="Hold music"
              inherited={defaults.holdAudioId}
              value={draft.holdAudioId}
              onChange={(v) => set('holdAudioId', v)}
              renderInherited={(id) => holdLabel(id)}
              hint="Played on a loop while an agent has a caller on hold."
            >
              {(value, setValue) => (
                <Select
                  items={holdOptions}
                  value={String(value)}
                  onValueChange={(v) => setValue(Number(v ?? 0))}
                >
                  <SelectTrigger className="w-full max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(holdOptions).map(([value2, label]) => (
                      <SelectItem key={value2} value={value2}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </OverrideField>

            <OverrideField
              label="Timezone"
              inherited={defaults.timezone}
              value={draft.timezone}
              onChange={(v) => set('timezone', v)}
            >
              {(value, setValue) => (
                <Select
                  items={timezoneItems(value)}
                  value={value}
                  onValueChange={(v) => setValue(v ?? defaults.timezone)}
                >
                  <SelectTrigger className="w-full max-w-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezoneOptions(value).map((tz) => (
                      <SelectItem key={tz.value} value={tz.value}>
                        {tz.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </OverrideField>

            <OverrideField
              label="Weekly hours"
              inherited={defaults.weeklyHours}
              value={draft.weeklyHours}
              onChange={(v) => set('weeklyHours', v)}
              renderInherited={(week) => summariseWeek(week)}
              hint="Overrides the whole week, not individual days."
            >
              {(value, setValue) => (
                <PhoneHoursEditor
                  value={value as WeeklyHours}
                  onChange={setValue}
                />
              )}
            </OverrideField>

            <OverrideField
              label="Greeting during business hours"
              inherited={defaults.greetingMessage}
              value={draft.greetingMessage}
              onChange={(v) => set('greetingMessage', v)}
            >
              {(value, setValue) => (
                <MessageField
                  value={value}
                  onChange={setValue}
                  placeholders={placeholders}
                  preview={previewVars}
                />
              )}
            </OverrideField>

            <OverrideField
              label="Play the greeting before connecting"
              inherited={defaults.playGreeting}
              value={draft.playGreeting}
              onChange={(v) => set('playGreeting', v)}
              renderInherited={(v) => (v ? 'Yes' : 'No — ring immediately')}
            >
              {(value, setValue) => (
                <SegmentedChoice
                  value={value}
                  onChange={setValue}
                  options={[
                    { value: true, label: 'Yes' },
                    { value: false, label: 'No' },
                  ]}
                />
              )}
            </OverrideField>

            <OverrideField
              label="Message outside business hours"
              inherited={defaults.afterHoursMessage}
              value={draft.afterHoursMessage}
              onChange={(v) => set('afterHoursMessage', v)}
            >
              {(value, setValue) => (
                <MessageField
                  value={value}
                  onChange={setValue}
                  placeholders={placeholders}
                  preview={previewVars}
                />
              )}
            </OverrideField>

            <OverrideField
              label="After the closed message"
              inherited={defaults.afterHoursHangUp}
              value={draft.afterHoursHangUp}
              onChange={(v) => set('afterHoursHangUp', v)}
              renderInherited={(v) =>
                v ? (voicemailOn ? 'Take a message' : 'Hang up') : 'Ring anyway'
              }
            >
              {(value, setValue) => (
                <SegmentedChoice
                  value={value}
                  onChange={setValue}
                  options={[
                    {
                      value: true,
                      label: voicemailOn ? 'Take a message' : 'Hang up',
                    },
                    { value: false, label: 'Ring anyway' },
                  ]}
                />
              )}
            </OverrideField>

            <OverrideField
              label="Message when nobody is available"
              inherited={defaults.unavailableMessage}
              value={draft.unavailableMessage}
              onChange={(v) => set('unavailableMessage', v)}
            >
              {(value, setValue) => (
                <MessageField
                  value={value}
                  onChange={setValue}
                  placeholders={placeholders}
                  preview={previewVars}
                />
              )}
            </OverrideField>

            <OverrideField
              label="Ring for"
              inherited={defaults.ringTimeoutSeconds}
              value={draft.ringTimeoutSeconds}
              onChange={(v) => set('ringTimeoutSeconds', v)}
              renderInherited={(v) => `${v} seconds`}
            >
              {(value, setValue) => (
                <Select
                  items={Object.fromEntries(
                    RING_SECONDS.map((s) => [String(s), `${s} seconds`]),
                  )}
                  value={String(value)}
                  onValueChange={(v) => setValue(Number(v ?? 30))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RING_SECONDS.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {s} seconds
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </OverrideField>

            <OverrideField
              label="Voicemail"
              inherited={defaults.voicemailEnabled}
              value={draft.voicemailEnabled}
              onChange={(v) => set('voicemailEnabled', v)}
              renderInherited={(v) => (v ? 'Take a message' : 'Off')}
            >
              {(value, setValue) => (
                <SegmentedChoice
                  value={value}
                  onChange={setValue}
                  options={[
                    { value: true, label: 'Take a message' },
                    { value: false, label: 'Off' },
                  ]}
                />
              )}
            </OverrideField>

            {/* Both only matter when a message can actually be left -- but they are shown
                regardless, because an inherited-on company has no override to read here
                and hiding them would make the inherited wording invisible. */}
            <OverrideField
              label="Voicemail prompt"
              inherited={defaults.voicemailPrompt}
              value={draft.voicemailPrompt}
              onChange={(v) => set('voicemailPrompt', v)}
            >
              {(value, setValue) => (
                <MessageField
                  value={value}
                  onChange={setValue}
                  placeholders={placeholders}
                  preview={previewVars}
                />
              )}
            </OverrideField>

            <OverrideField
              label="Longest message"
              inherited={defaults.voicemailMaxSeconds}
              value={draft.voicemailMaxSeconds}
              onChange={(v) => set('voicemailMaxSeconds', v)}
              renderInherited={(v) => voicemailLengthLabel(v)}
            >
              {(value, setValue) => (
                <Select
                  items={Object.fromEntries(
                    VOICEMAIL_SECONDS.map((s) => [
                      String(s),
                      voicemailLengthLabel(s),
                    ]),
                  )}
                  value={String(value)}
                  onValueChange={(v) => setValue(Number(v ?? 120))}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VOICEMAIL_SECONDS.map((s) => (
                      <SelectItem key={s} value={String(s)}>
                        {voicemailLengthLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </OverrideField>

            {overrideCount > 0 && (
              <div className="flex items-center gap-2 border-t pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={reset.isPending}
                  onClick={() => reset.mutate()}
                  className="text-muted-foreground gap-1.5"
                >
                  <RotateCcw size={14} />
                  {reset.isPending ? 'Resetting…' : 'Reset all to defaults'}
                </Button>
                {reset.isError && (
                  <span className="text-xs text-destructive">
                    {errorText(reset.error)}
                  </span>
                )}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
