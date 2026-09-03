import { useRef, useState } from 'react';
import { Loader2, Music, Trash2, Upload } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { formatDuration, phoneAudioSrc } from '@/api/phoneAudio';
import {
  useDeletePhoneAudio,
  usePhoneAudio,
  useRenamePhoneAudio,
  useUploadPhoneAudio,
} from '@/hooks/usePhoneAudio';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Upload and manage the tracks a caller can hear while on hold.
 *
 * Every upload is transcoded to mono MP3 server-side, so the preview here plays exactly
 * the bytes a caller will get — not the file that was chosen. That is deliberate: the one
 * thing an admin cannot check any other way is what it actually sounds like down a phone.
 */
export function AudioLibrary() {
  const { token } = useAuth();
  const { data: tracks, isLoading } = usePhoneAudio();
  const [progress, setProgress] = useState<number | null>(null);
  const upload = useUploadPhoneAudio((f) => setProgress(f));
  const rename = useRenamePhoneAudio();
  const remove = useDeletePhoneAudio();

  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);

  function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setProgress(0);
    upload.mutate(
      { file, name: file.name.replace(/\.[^.]+$/, '') },
      {
        onError: (e: unknown) =>
          setError(e instanceof Error ? e.message : 'Upload failed'),
        onSettled: () => setProgress(null),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Music size={16} />
          Hold music
        </CardTitle>
        <CardDescription>
          Uploaded tracks are converted to phone-quality audio. Pick one below as the
          default, or per company, and callers hear it on a loop while an agent has them
          on hold.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <input
            ref={inputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/*,.mp3,.wav,.m4a,.aac,.ogg"
            className="hidden"
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              // Cleared so choosing the same file twice still fires a change event.
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={progress !== null}
          >
            {progress !== null ? (
              <Loader2 size={14} className="mr-1.5 animate-spin" />
            ) : (
              <Upload size={14} className="mr-1.5" />
            )}
            {progress !== null
              ? `Uploading ${Math.round(progress * 100)}%`
              : 'Upload a track'}
          </Button>
          <span className="text-xs text-muted-foreground">
            MP3 or WAV, up to 20 MB
          </span>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !tracks?.length ? (
          <p className="text-sm text-muted-foreground">
            No tracks yet. Callers on hold currently hear silence.
          </p>
        ) : (
          <ul className="divide-y rounded-md border">
            {tracks.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-3 p-3">
                <div className="min-w-[10rem] flex-1">
                  <Input
                    defaultValue={t.name}
                    className="h-8"
                    onBlur={(e) => {
                      const next = e.target.value.trim();
                      if (next && next !== t.name) {
                        rename.mutate({ id: t.id, name: next });
                      } else {
                        e.target.value = t.name;
                      }
                    }}
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDuration(t.durationMs)} · {formatBytes(t.size)} ·{' '}
                    {t.filename}
                  </p>
                </div>

                {token && (
                  <audio
                    controls
                    preload="metadata"
                    src={phoneAudioSrc(token, t.id)}
                    className="h-8 max-w-[16rem]"
                  />
                )}

                {confirmId === t.id ? (
                  <span className="flex items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Remove?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => {
                        remove.mutate(t.id);
                        setConfirmId(null);
                      }}
                    >
                      Remove
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setConfirmId(null)}
                    >
                      Cancel
                    </Button>
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmId(t.id)}
                    aria-label={`Remove ${t.name}`}
                  >
                    <Trash2 size={14} />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
