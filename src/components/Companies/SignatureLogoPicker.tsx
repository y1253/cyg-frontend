import { useRef, useState } from 'react';
import { Ban, ImagePlus, Loader2 } from 'lucide-react';
import { ConfirmRemoveButton } from '@/components/CompanySettings/ConfirmRemoveButton';
import { SignatureImageThumb } from '@/components/CompanySettings/SignatureImageThumb';
import {
  useCompanySignatureImages,
  useDeleteCompanySignatureImage,
  useUploadCompanySignatureImage,
} from '@/hooks/useEmailSignature';
import { cn } from '@/lib/utils';
import { NO_LOGO_ID } from './signature-logo';

/**
 * Choose — or upload — the logo for ONE company's signature.
 *
 * A tile grid rather than the name-only `Select` this replaced, for one reason worth
 * stating: a logo is a picture, and its name is whatever label the uploader typed, often
 * `image (3)`. Picking by name means saving and previewing to find out what you chose.
 *
 * ── THE TWO SCOPES, AND WHY DELETE IS NARROWER THAN SELECT ───────────────────────
 * The list is firm-wide logos PLUS this company's own (`GET
 * /signature-images/companies/:id`). Every tile is SELECTABLE — a company is meant to be
 * able to use the firm's shared logo. Only a tile with `companyId !== null` offers a
 * delete, because the server gates rename/delete on `isImageInLibrary`, which is
 * deliberately narrower than the visibility rule: a manager must not be able to delete the
 * firm's shared logo from inside a company. The UI mirrors that rather than restating it —
 * the server 404s either way.
 *
 * Uploading here is the whole point of the component: `/admin/company-settings` is behind
 * `SuperAdminRoute`, so before this a MANAGER could pick a logo and never add one.
 */
export function SignatureLogoPicker({
  companyId,
  value,
  onChange,
}: {
  companyId: number;
  /** The selected `SignatureImage.id`, or `NO_LOGO_ID` (0) for none. */
  value: number;
  onChange: (next: number) => void;
}) {
  const { data: images, isLoading } = useCompanySignatureImages(companyId);
  const [progress, setProgress] = useState<number | null>(null);
  const upload = useUploadCompanySignatureImage(companyId, setProgress);
  const remove = useDeleteCompanySignatureImage(companyId);

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
        // Selecting the new logo is what makes this feel finished: uploading a logo from
        // inside a company can only mean you want to use it. The list refetches from the
        // mutation's own invalidation, so the tile and the selection arrive together.
        onSuccess: (image) => onChange(image.id),
        onError: (e: unknown) =>
          setError(e instanceof Error ? e.message : 'Upload failed'),
        onSettled: () => setProgress(null),
      },
    );
  };

  const tile = (selected: boolean, extra?: string) =>
    cn(
      'relative flex h-[4.75rem] w-full flex-col items-center justify-center gap-1 rounded-md border p-1.5 text-center transition-colors',
      selected
        ? 'border-primary ring-2 ring-primary'
        : 'hover:border-muted-foreground/40 hover:bg-muted/40',
      extra,
    );

  return (
    <div className="flex flex-col gap-2">
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

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading logos…</p>
      ) : (
        <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
          <button
            type="button"
            onClick={() => onChange(NO_LOGO_ID)}
            className={tile(value === NO_LOGO_ID)}
          >
            <Ban size={18} className="text-muted-foreground" />
            <span className="text-[11px] leading-tight">No logo</span>
          </button>

          {(images ?? []).map((image) => (
            <div key={image.id} className="relative">
              <button
                type="button"
                onClick={() => onChange(image.id)}
                className={tile(value === image.id, 'w-full')}
                title={image.name}
              >
                <SignatureImageThumb
                  image={image}
                  className="h-9 w-full border-0 bg-transparent"
                  imgClassName="max-h-9"
                />
                <span className="w-full truncate text-[11px] leading-tight">
                  {image.name}
                </span>
                {image.companyId !== null && (
                  <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
                    Only here
                  </span>
                )}
              </button>

              {/* Only this company's OWN logos. A firm-wide one is selectable above and
                  must stay untouchable here — the server enforces it, this just doesn't
                  offer a button that would 404. */}
              {image.companyId !== null && (
                <div
                  className={cn(
                    'absolute right-0.5 top-0.5',
                    confirmId === image.id &&
                      'right-0 top-0 z-10 rounded-md border bg-background p-1 shadow-sm',
                  )}
                >
                  <ConfirmRemoveButton
                    label={image.name}
                    confirming={confirmId === image.id}
                    onConfirmingChange={(open) =>
                      setConfirmId(open ? image.id : null)
                    }
                    onRemove={() => {
                      remove.mutate(image.id);
                      // The row is going; fall back to no logo rather than leaving the
                      // selection on an id that is about to read "Unavailable logo".
                      if (value === image.id) onChange(NO_LOGO_ID);
                    }}
                    iconSize={12}
                  />
                </div>
              )}
            </div>
          ))}

          <button
            type="button"
            disabled={progress !== null}
            onClick={() => inputRef.current?.click()}
            className={tile(
              false,
              'border-dashed text-muted-foreground disabled:opacity-60',
            )}
          >
            {progress !== null ? (
              <>
                <Loader2 size={18} className="animate-spin" />
                <span className="text-[11px] leading-tight">
                  {Math.round(progress * 100)}%
                </span>
              </>
            ) : (
              <>
                <ImagePlus size={18} />
                <span className="text-[11px] leading-tight">Upload</span>
              </>
            )}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <p className="text-[11px] text-muted-foreground">
        A logo uploaded here belongs to this company only. The firm-wide logos come
        from Company Settings and cannot be removed here.
      </p>
    </div>
  );
}
