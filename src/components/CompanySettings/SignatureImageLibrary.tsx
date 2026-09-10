import { useRef, useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useDeleteSignatureImage,
  useRenameSignatureImage,
  useSignatureImages,
  useUploadSignatureImage,
} from '@/hooks/useEmailSignature';
import { ConfirmRemoveButton } from './ConfirmRemoveButton';
import { SignatureImageThumb } from './SignatureImageThumb';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The signature-logo library, modelled on `AudioLibrary`.
 *
 * Saves immediately rather than joining the page's sticky save bar: an upload is its own
 * act, and the settings above only ever store an id.
 *
 * The thumbnail is fetched from the SAME public URL that goes into an email, so what an
 * admin sees here is exactly what a recipient gets — no session, no token, no separate
 * preview path that could disagree.
 */
export function SignatureImageLibrary() {
  const { data: images, isLoading } = useSignatureImages();
  const [progress, setProgress] = useState<number | null>(null);
  const upload = useUploadSignatureImage(setProgress);
  const rename = useRenameSignatureImage();
  const remove = useDeleteSignatureImage();

  const [error, setError] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const pick = (file: File | undefined) => {
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
  };

  return (
    <Card className="p-5 flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Logos</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Uploaded images the <code className="font-mono">{'{logo}'}</code>{' '}
            token can render. PNG or JPEG, up to 5&nbsp;MB — resized automatically.
          </p>
        </div>
        <div className="shrink-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp,image/*,.png,.jpg,.jpeg,.gif,.webp"
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0]);
              // Cleared so choosing the same file twice still fires a change event.
              e.target.value = '';
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={progress !== null}
            onClick={() => inputRef.current?.click()}
            className="gap-1.5"
          >
            {progress !== null ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Uploading {Math.round(progress * 100)}%
              </>
            ) : (
              <>
                <ImagePlus size={14} />
                Upload a logo
              </>
            )}
          </Button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : !images?.length ? (
        <p className="text-sm text-muted-foreground">
          No logos yet. Signatures are text only until one is uploaded.
        </p>
      ) : (
        <ul className="divide-y rounded-md border">
          {images.map((image) => (
            <li key={image.id} className="flex items-center gap-3 p-3">
              <SignatureImageThumb image={image} />
              <Input
                defaultValue={image.name}
                className="h-8 max-w-[16rem]"
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (!next || next === image.name) {
                    e.target.value = image.name;
                    return;
                  }
                  rename.mutate({ id: image.id, name: next });
                }}
              />
              <span className="text-xs text-muted-foreground whitespace-nowrap">
                {image.width}×{image.height} · {formatBytes(image.size)}
              </span>
              <div className="ml-auto flex items-center gap-1.5">
                <ConfirmRemoveButton
                  label={image.name}
                  confirming={confirmId === image.id}
                  onConfirmingChange={(open) =>
                    setConfirmId(open ? image.id : null)
                  }
                  onRemove={() => remove.mutate(image.id)}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* A settings row may still name a removed logo, so removal is a soft delete and
          the signature simply renders without an image. Saying so here stops "where did
          my logo go?" being a mystery. */}
      {!!images?.length && (
        <p className="text-[11px] text-muted-foreground">
          Removing a logo leaves any signature using it as text only.
        </p>
      )}
    </Card>
  );
}
