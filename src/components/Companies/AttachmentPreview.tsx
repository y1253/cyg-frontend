import { useState, useEffect } from 'react';
import {
  Download,
  FileText,
  ExternalLink,
  X,
  Image as ImageIcon,
  Music,
  Video as VideoIcon,
  File as FileIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Human-readable byte size, e.g. 1536 → "1.5 KB".
function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value % 1 === 0 ? value : value.toFixed(1)} ${units[unit]}`;
}

type AttachmentKind = 'image' | 'audio' | 'video' | 'pdf' | 'other';

const EXT_KINDS: Record<string, AttachmentKind> = {
  // image
  jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image',
  bmp: 'image', heic: 'image', heif: 'image', svg: 'image',
  // audio
  mp3: 'audio', m4a: 'audio', wav: 'audio', ogg: 'audio', oga: 'audio',
  opus: 'audio', amr: 'audio', aac: 'audio', flac: 'audio', weba: 'audio',
  // video
  mp4: 'video', mov: 'video', m4v: 'video', webm: 'video', avi: 'video',
  mkv: 'video', '3gp': 'video',
  // pdf
  pdf: 'pdf',
};

// Resolve what to render from the MIME type first, then fall back to the filename
// extension when the MIME is generic (e.g. voice attachments often arrive as
// application/octet-stream, which would otherwise never enter the audio player).
function resolveKind(mimeType: string, filename: string): AttachmentKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('audio/')) return 'audio';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_KINDS[ext] ?? 'other';
}

interface AttachmentPreviewProps {
  // URL used to render/play the file (Content-Disposition: inline). Omit for
  // Drive-hosted files that can't be streamed.
  url?: string;
  // URL that forces a download (Content-Disposition: attachment).
  downloadUrl?: string;
  mimeType: string;
  filename: string;
  size?: number;
  // For Google Drive-hosted chat files: open in Drive instead of streaming.
  driveHref?: string | null;
}

// Renders a single attachment the way a normal mail/chat client would: images
// preview (click to enlarge), audio/video play inline, PDFs open in an inline
// viewer, Drive files link out, everything else shows a download card. A download
// button appears on hover over any attachment so downloading is always explicit —
// clicking the attachment body previews, it never downloads by accident.
export function AttachmentPreview({
  url,
  downloadUrl,
  mimeType,
  filename,
  size,
  driveHref,
}: AttachmentPreviewProps) {
  const [failed, setFailed] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const kind = resolveKind(mimeType, filename);

  // Audio/video play from an in-memory Blob object URL rather than streaming the
  // endpoint directly. Blob URLs support seeking natively and hand the decoder the
  // complete file, so playback is reliable (streaming the endpoint made the media
  // element issue ranged requests that could fail and permanently kill the player).
  const isStreamedMedia = !driveHref && !!url && (kind === 'audio' || kind === 'video');

  useEffect(() => {
    if (!isStreamedMedia || !url) return;
    let cancelled = false;
    let objectUrl: string | null = null;
    // Audio is transcoded to MP3 server-side (browsers can't decode some chat voice
    // codecs). `url` already carries ?token=… so we just append the transcode flag.
    const fetchUrl = kind === 'audio'
      ? `${url}${url.includes('?') ? '&' : '?'}transcode=mp3`
      : url;
    // A plain fetch (no Range header) returns the full file in one shot.
    fetch(fetchUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setBlobUrl(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isStreamedMedia, url, kind]);

  // Close the lightbox on Escape.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightbox(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox]);

  // Explicit download control, revealed on hover over the attachment. Stops
  // propagation so it never triggers the preview/lightbox.
  const downloadButton = (
    <a
      href={downloadUrl ?? url}
      download={filename}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title={`Download ${filename}`}
      aria-label={`Download ${filename}`}
      className="absolute right-1.5 top-1.5 z-10 inline-flex items-center justify-center rounded-md bg-background/90 p-1.5 text-muted-foreground shadow-sm ring-1 ring-border opacity-0 transition-opacity group-hover:opacity-100 hover:text-foreground focus:opacity-100"
    >
      <Download className="h-4 w-4" />
    </a>
  );

  const downloadCard = (
    <a
      href={downloadUrl ?? url}
      download={filename}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-3 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted/60 transition-colors max-w-xs"
    >
      <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{filename}</span>
        {size ? (
          <span className="block text-xs text-muted-foreground">{formatBytes(size)}</span>
        ) : null}
      </span>
      <Download className="h-4 w-4 shrink-0 text-muted-foreground" />
    </a>
  );

  // Drive-hosted file — can't stream, link out to Drive.
  if (driveHref) {
    return (
      <a href={driveHref} target="_blank" rel="noopener noreferrer">
        <Button variant="outline" size="sm" className="gap-2">
          <ExternalLink className="h-4 w-4" />
          <span className="max-w-[12rem] truncate">{filename}</span>
        </Button>
      </a>
    );
  }

  const lightboxOverlay = lightbox ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      onClick={() => setLightbox(false)}
    >
      <button
        type="button"
        onClick={() => setLightbox(false)}
        aria-label="Close preview"
        className="absolute right-4 top-4 inline-flex items-center justify-center rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
      >
        <X className="h-5 w-5" />
      </button>
      {kind === 'pdf' ? (
        <iframe
          src={url}
          title={filename}
          onClick={(e) => e.stopPropagation()}
          className="h-[90vh] w-full max-w-5xl rounded-md bg-white"
        />
      ) : (
        <img
          src={url}
          alt={filename}
          onClick={(e) => e.stopPropagation()}
          className="max-h-[90vh] max-w-full rounded-md object-contain"
        />
      )}
    </div>
  ) : null;

  if (url && !failed) {
    if (kind === 'image') {
      return (
        <div className="group relative inline-block">
          {downloadButton}
          <img
            src={url}
            alt={filename}
            loading="lazy"
            onError={() => setFailed(true)}
            onClick={() => setLightbox(true)}
            className="max-h-72 max-w-xs cursor-zoom-in rounded-md border object-contain"
          />
          {lightboxOverlay}
        </div>
      );
    }
    if (kind === 'audio') {
      return (
        <div className="group relative max-w-xs rounded-md border bg-background p-2">
          {downloadButton}
          {blobUrl ? (
            <audio controls preload="metadata" src={blobUrl} onError={() => setFailed(true)} className="w-full" />
          ) : (
            <span className="block text-xs text-muted-foreground">Loading audio…</span>
          )}
          <span className="mt-1 block truncate pr-8 text-xs text-muted-foreground">{filename}</span>
        </div>
      );
    }
    if (kind === 'video') {
      return (
        <div className="group relative max-w-sm">
          {downloadButton}
          {blobUrl ? (
            <video
              controls
              preload="metadata"
              src={blobUrl}
              onError={() => setFailed(true)}
              className="w-full rounded-md border"
            />
          ) : (
            <span className="block text-xs text-muted-foreground">Loading video…</span>
          )}
          <span className="mt-1 block truncate text-xs text-muted-foreground">{filename}</span>
        </div>
      );
    }
    if (kind === 'pdf') {
      return (
        <div className="group relative inline-block">
          {downloadButton}
          <button
            type="button"
            onClick={() => setLightbox(true)}
            className="inline-flex max-w-xs items-center gap-3 rounded-md border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
          >
            <FileText className="h-5 w-5 shrink-0 text-red-500" />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{filename}</span>
              <span className="block text-xs text-muted-foreground">
                {size ? `${formatBytes(size)} · ` : ''}Click to preview
              </span>
            </span>
          </button>
          {lightboxOverlay}
        </div>
      );
    }
  }

  // Non-previewable (Word/Excel/etc.) or a failed preview — download card, with a
  // hover download button too for consistency.
  return (
    <div className="group relative inline-block">
      {downloadButton}
      {downloadCard}
    </div>
  );
}

// Icon element for an attachment kind, used by the compact chip. Returns an element
// (not a component reference) so it isn't treated as a component created in render.
function kindIcon(kind: AttachmentKind, className: string) {
  switch (kind) {
    case 'image':
      return <ImageIcon className={className} />;
    case 'audio':
      return <Music className={className} />;
    case 'video':
      return <VideoIcon className={className} />;
    case 'pdf':
      return <FileText className={className} />;
    default:
      return <FileIcon className={className} />;
  }
}

interface AttachmentChipProps {
  // Inline-disposition URL — opened in a new tab to preview outside the email.
  url: string;
  // Attachment-disposition URL — used by the hover download button.
  downloadUrl: string;
  mimeType: string;
  filename: string;
}

// A compact Gmail-style attachment pill for the inbox list row: a type icon + the
// filename. Clicking opens the file in a new tab (preview outside the email);
// hovering reveals an explicit download button. Clicks stop propagation so the
// surrounding email row doesn't open.
export function AttachmentChip({
  url,
  downloadUrl,
  mimeType,
  filename,
}: AttachmentChipProps) {
  return (
    <span className="group/chip relative inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border bg-background py-1 pl-2 pr-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted/60">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          window.open(url, '_blank', 'noopener,noreferrer');
        }}
        title={`Open ${filename}`}
        className="flex min-w-0 items-center gap-1.5"
      >
        {kindIcon(resolveKind(mimeType, filename), 'h-3.5 w-3.5 shrink-0 text-muted-foreground')}
        <span className="truncate">{filename}</span>
      </button>
      <a
        href={downloadUrl}
        download={filename}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        title={`Download ${filename}`}
        aria-label={`Download ${filename}`}
        className="shrink-0 rounded-full p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus:opacity-100 group-hover/chip:opacity-100"
      >
        <Download className="h-3.5 w-3.5" />
      </a>
    </span>
  );
}
