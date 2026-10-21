import { useState } from 'react';
import { Check, Loader2, Phone, PhoneOff } from 'lucide-react';
import type { AiVoiceOption, CustomerVoice } from '@/api/customerVoice';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCustomerVoice, useUpdateCustomerVoice } from '@/hooks/useCustomerVoice';
import { cn } from '@/lib/utils';
import { fmtDateTime } from '../customer-format';

const GENDER: Record<AiVoiceOption['gender'], string> = { female: 'Female', male: 'Male', neutral: 'Neutral' };

/**
 * ADMIN (step12): the customer site's AI phone. On = a customer who calls a receipt number
 * from the phone on their account talks to the same AI assistant they text, and scheduled
 * messages can call customers who prefer a phone call. The voice, the language calls start
 * in, the first words and the longest call are set here; the customer API reads them on
 * every call.
 */
export function VoicePanel() {
  const voice = useCustomerVoice();
  if (voice.isLoading) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 size={15} className="animate-spin" /> Loading…
      </p>
    );
  }
  if (voice.isError || !voice.data) {
    return <p className="text-sm text-destructive">{voice.error?.message ?? 'Could not load the AI phone settings.'}</p>;
  }
  return <VoiceForm key={voice.data.updatedAt} v={voice.data} />;
}

function VoiceForm({ v }: { v: CustomerVoice }) {
  const save = useUpdateCustomerVoice();
  const [voice, setVoice] = useState(v.voice);
  const [language, setLanguage] = useState(v.language);
  const [greeting, setGreeting] = useState(v.greeting ?? '');
  const [minutes, setMinutes] = useState(String(v.maxMinutes));
  const [saved, setSaved] = useState(false);
  const mins = Number(minutes);
  const minutesBad = !Number.isInteger(mins) || mins < 1 || mins > 60;
  const dirty =
    voice !== v.voice ||
    language !== v.language ||
    greeting.trim() !== (v.greeting ?? '') || (!minutesBad && mins !== v.maxMinutes);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (minutesBad) return;
    setSaved(false);
    save.mutate({ voice, language, greeting: greeting.trim() || null, maxMinutes: mins }, { onSuccess: () => setSaved(true) });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 py-5">
          <span
            className={cn(
              'flex size-10 items-center justify-center rounded-xl',
              v.enabled ? 'bg-indigo-50 text-indigo-700' : 'bg-muted text-muted-foreground',
            )}
          >
            {v.enabled ? <Phone size={18} /> : <PhoneOff size={18} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">{v.enabled ? 'The AI answers calls' : 'The AI phone is off'}</p>
            <p className="text-sm text-muted-foreground">
              {v.enabled
                ? `Customers who call ${v.numbers.length ? v.numbers.join(', ') : 'a receipt number'} from the phone on their account talk to the AI assistant. Unknown callers are told to create an account.`
                : 'Receipt numbers answer "this number only accepts text messages", and no scheduled message calls anyone.'}
            </p>
          </div>
          <Button
            variant={v.enabled ? 'outline' : 'default'}
            disabled={save.isPending}
            onClick={() => save.mutate({ enabled: !v.enabled })}
          >
            {save.isPending && <Loader2 size={15} className="animate-spin" />}
            {v.enabled ? 'Turn off' : 'Turn on'}
          </Button>
        </CardContent>
      </Card>

      <form onSubmit={submit}>
        <Card>
          <CardContent className="flex flex-col gap-5 py-5">
            <div className="flex flex-col gap-2">
              <Label>Voice</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {v.voices.map(o => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setVoice(o.id)}
                    aria-pressed={voice === o.id}
                    className={cn(
                      'flex flex-col items-start rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                      voice === o.id ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className="font-medium">{o.label}</span>
                    <span className="text-xs text-muted-foreground">{GENDER[o.gender]}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Default language</Label>
              <Select
                items={Object.fromEntries(v.languages.map(l => [l.id, l.label]))}
                value={language}
                onValueChange={next => setLanguage(next ?? language)}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {v.languages.map(l => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                The AI starts every call in this language. If the caller speaks or asks for another one, it switches
                to theirs for the rest of the call.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="voice-greeting">First words on a call they make</Label>
              <Textarea
                id="voice-greeting"
                rows={2}
                maxLength={500}
                value={greeting}
                onChange={e => setGreeting(e.target.value)}
                placeholder="Empty = “Hi Dana, it's CYG Finance's assistant — how can I help with your books?”"
              />
              <p className="text-xs text-muted-foreground">
                Said in the default language. Scheduled calls start with the overview or report instead.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="voice-minutes">Longest call (minutes)</Label>
              <Input
                id="voice-minutes"
                type="number"
                min={1}
                max={60}
                value={minutes}
                onChange={e => setMinutes(e.target.value)}
                className="w-32"
              />
              {minutesBad && <p className="text-xs text-destructive">Between 1 and 60 minutes.</p>}
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={!dirty || minutesBad || save.isPending}>
                {save.isPending ? <Loader2 size={15} className="animate-spin" /> : saved && !dirty ? <Check size={15} /> : null}
                Save
              </Button>
              <span className="text-xs text-muted-foreground">Last changed {fmtDateTime(v.updatedAt)}</span>
            </div>
            {save.error && <p className="text-sm text-destructive">{save.error.message}</p>}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
