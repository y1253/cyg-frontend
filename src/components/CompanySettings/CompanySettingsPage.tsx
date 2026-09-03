import { useState } from 'react';
import { Clock, MessageSquare, PhoneCall } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { browserTimeZone, timezoneItems, timezoneOptions } from '@/lib/timezones';
import { usePhoneDefaults, useUpdatePhoneDefaults } from '@/hooks/usePhoneSettings';
import type { EffectivePhoneSettings } from '@/api/phoneSettings';
import { PhoneHoursEditor } from './PhoneHoursEditor';
import { MessageField } from './MessageField';
import { AudioLibrary } from './AudioLibrary';
import { usePhoneAudio } from '@/hooks/usePhoneAudio';
import { SegmentedChoice } from './OverrideField';
import { VOICEMAIL_SECONDS, voicemailLengthLabel } from '@/lib/voicemail';

const RING_SECONDS = [15, 20, 30, 45, 60];

/**
 * SignalWire's named TTS voices. `''` omits the attribute entirely, which is not the same
 * as picking a voice — it takes whatever the provider's own default is, and is what
 * shipped before this feature.
 */
const VOICES: Record<string, string> = {
  '': 'Provider default',
  man: 'Man',
  woman: 'Woman',
  alice: 'Alice',
};

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong';
}

/**
 * Global phone defaults, inherited by every company.
 *
 * ONE draft object and ONE Save, unlike the per-section pencil affordance on the company
 * Details tab. This page is a form — hours, wording and behaviour are edited together and
 * only make sense together — so a per-card edit mode would mean three saves for one
 * coherent change.
 */
export function CompanySettingsPage() {
  const { data, isLoading, error } = usePhoneDefaults();
  const { data: audioTracks } = usePhoneAudio();
  // "0" is the none sentinel, and it is always offered: without it an admin who has
  // set hold music could never turn it back off.
  const holdOptions: Record<string, string> = {
    '0': 'None (silence)',
    ...Object.fromEntries((audioTracks ?? []).map((t) => [String(t.id), t.name])),
  };
  const save = useUpdatePhoneDefaults();

  const [draft, setDraft] = useState<EffectivePhoneSettings | null>(null);
  const [seed, setSeed] = useState<object | null>(null);

  // Seed the draft once the data lands, and re-seed after a successful save so the
  // "unsaved changes" badge compares against what the server actually stored.
  //
  // Done DURING RENDER rather than in an effect: React re-renders immediately without
  // committing the first pass, so there is no flash of the stale form and no cascading
  // render. This is the documented "adjusting state when props change" pattern.
  if (data?.defaults && data.defaults !== seed) {
    setSeed(data.defaults);
    setDraft(stripMeta(data.defaults));
  }

  if (isLoading || !draft) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-sm text-destructive">{errorText(error)}</p>
      </div>
    );
  }

  const placeholders = data?.placeholders ?? [];
  const set = <K extends keyof EffectivePhoneSettings>(
    key: K,
    value: EffectivePhoneSettings[K],
  ) => setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const dirty =
    !!data && JSON.stringify(draft) !== JSON.stringify(stripMeta(data.defaults));
  const browserZone = browserTimeZone();

  const previewVars = {
    company: 'Acme Bookkeeping',
    phone: '+1 438 256 1210',
    hours: '9 AM to 5 PM',
  };

  return (
    <div className="p-6 max-w-4xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-semibold">Company Settings</h2>
          <p className="text-muted-foreground text-sm mt-0.5">
            Defaults every company inherits. Any company can override them individually
            from its own Details tab.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* ── Business hours ────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock size={16} className="text-teal-600" />
              Business hours
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Apply business hours</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Off means every call rings whatever the time — the way the system
                  behaved before this page existed.
                </p>
              </div>
              <SegmentedChoice
                value={draft.hoursEnabled}
                onChange={(v) => set('hoursEnabled', v)}
                options={[
                  { value: false, label: 'Off' },
                  { value: true, label: 'On' },
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">Timezone</Label>
              <Select
                items={timezoneItems(draft.timezone)}
                value={draft.timezone}
                onValueChange={(v) => set('timezone', v ?? 'America/Toronto')}
              >
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {timezoneOptions(draft.timezone).map((tz) => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Hours below are read in this zone. Your computer is in {browserZone}.
              </p>
            </div>

            <div
              className={
                draft.hoursEnabled ? '' : 'opacity-50 pointer-events-none select-none'
              }
            >
              <PhoneHoursEditor
                value={draft.weeklyHours}
                onChange={(v) => set('weeklyHours', v)}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Messages ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <MessageSquare size={16} className="text-teal-600" />
              What the caller hears
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Label className="text-sm font-medium">During business hours</Label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    Play before connecting
                  </span>
                  <SegmentedChoice
                    value={draft.playGreeting}
                    onChange={(v) => set('playGreeting', v)}
                    options={[
                      { value: true, label: 'Yes' },
                      { value: false, label: 'No' },
                    ]}
                  />
                </div>
              </div>
              <MessageField
                value={draft.greetingMessage}
                onChange={(v) => set('greetingMessage', v)}
                placeholders={placeholders}
                preview={previewVars}
                disabled={!draft.playGreeting}
              />
              {!draft.playGreeting && (
                <p className="text-xs text-muted-foreground">
                  Turned off — the phone rings immediately with no greeting.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">Outside business hours</Label>
              <MessageField
                value={draft.afterHoursMessage}
                onChange={(v) => set('afterHoursMessage', v)}
                placeholders={placeholders}
                preview={previewVars}
                disabled={!draft.hoursEnabled}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">When nobody is available</Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Played when the number matches no company, or the company has no assigned
                user and there are no admins.
              </p>
              <MessageField
                value={draft.unavailableMessage}
                onChange={(v) => set('unavailableMessage', v)}
                placeholders={placeholders}
                preview={previewVars}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Call handling ─────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <PhoneCall size={16} className="text-teal-600" />
              Call handling
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">After hours</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {/*
                    These two switches interact, so the helper text says what will REALLY
                    happen rather than describing this one in isolation. "Don't ring" plus
                    voicemail on is the normal setup, and reading it as "hang up" is how an
                    admin ends up believing voicemail is broken.
                  */}
                  {draft.voicemailEnabled
                    ? 'What happens once the closed message has played. With voicemail on, callers are invited to leave a message instead of being hung up on.'
                    : 'What happens once the closed message has played.'}
                </p>
              </div>
              <SegmentedChoice
                value={draft.afterHoursHangUp}
                onChange={(v) => set('afterHoursHangUp', v)}
                options={[
                  {
                    value: true,
                    label: draft.voicemailEnabled ? 'Take a message' : 'Hang up',
                  },
                  { value: false, label: 'Ring anyway' },
                ]}
                disabled={!draft.hoursEnabled}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-sm font-medium">Ring for</Label>
              <Select
                items={Object.fromEntries(
                  RING_SECONDS.map((s) => [String(s), `${s} seconds`]),
                )}
                value={String(draft.ringTimeoutSeconds)}
                onValueChange={(v) => set('ringTimeoutSeconds', Number(v ?? 30))}
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Hold music</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Played on a loop when an agent puts a caller on hold.
                </p>
              </div>
              <Select
                items={holdOptions}
                value={String(draft.holdAudioId)}
                onValueChange={(v) => set('holdAudioId', Number(v ?? 0))}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(holdOptions).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* ── Voicemail ─────────────────────────────────────────────────
                Offered whenever a caller reaches nobody: after hours, when the ring
                goes unanswered, when no browser is registered, or when the company has
                nobody to ring. A caller who dialled a number we do not recognise still
                just hangs up -- with no company, the message could never be filed or
                shown to anyone. */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Voicemail</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  When nobody answers, let the caller leave a message. Messages appear in
                  the company&rsquo;s Communications tab and play like a recording.
                </p>
              </div>
              <SegmentedChoice
                value={draft.voicemailEnabled}
                onChange={(v) => set('voicemailEnabled', v)}
                options={[
                  { value: true, label: 'Take a message' },
                  { value: false, label: 'Off' },
                ]}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-sm font-medium">
                Voicemail prompt
              </Label>
              <p className="text-xs text-muted-foreground -mt-1">
                Said just before the beep.
              </p>
              <MessageField
                value={draft.voicemailPrompt}
                onChange={(v) => set('voicemailPrompt', v)}
                placeholders={placeholders}
                preview={previewVars}
                disabled={!draft.voicemailEnabled}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <Label className="text-sm font-medium">Longest message</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Recording is billed per minute and stored by the phone provider.
                </p>
              </div>
              <Select
                items={Object.fromEntries(
                  VOICEMAIL_SECONDS.map((s) => [
                    String(s),
                    voicemailLengthLabel(s),
                  ]),
                )}
                value={String(draft.voicemailMaxSeconds)}
                onValueChange={(v) => set('voicemailMaxSeconds', Number(v ?? 120))}
                disabled={!draft.voicemailEnabled}
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
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Label className="text-sm font-medium">Voice</Label>
              <Select
                items={VOICES}
                value={draft.voice}
                onValueChange={(v) => set('voice', v ?? '')}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(VOICES).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>

      <AudioLibrary />

      {/* Sticky save bar: the three cards are one coherent change, saved together. */}
      <div className="fixed bottom-0 left-52 right-0 border-t bg-background/95 backdrop-blur px-6 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-end gap-3">
          {save.isError && (
            <span className="mr-auto text-xs text-destructive">
              {errorText(save.error)}
            </span>
          )}
          {!save.isError && dirty && (
            <Badge variant="outline" className="mr-auto text-[11px] text-amber-600 border-amber-200 bg-amber-50">
              Unsaved changes
            </Badge>
          )}
          {!save.isError && !dirty && save.isSuccess && (
            <span className="mr-auto text-xs text-muted-foreground">Saved</span>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => data && setDraft(stripMeta(data.defaults))}
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!dirty || save.isPending}
            onClick={() => save.mutate(draft)}
          >
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Drop the row's identity columns.
 *
 * `id` and `singleton` are not settings: PATCHing them is rejected by the DTO's
 * `whitelist: true` anyway, but sending them would also make the "unsaved changes"
 * comparison below compare fields the form can never change.
 */
function stripMeta(
  row: EffectivePhoneSettings & { id: number; singleton: string },
): EffectivePhoneSettings {
  const settings = { ...row } as Partial<typeof row>;
  delete settings.id;
  delete settings.singleton;
  return settings as EffectivePhoneSettings;
}
