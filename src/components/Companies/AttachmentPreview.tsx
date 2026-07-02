import { useState } from 'react';
import { Download, FileText, ExternalLink } from 'lucide-react';
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
// preview, audio/video play inline, Drive files link out, everything else shows
// a download card.
export function AttachmentPreview({
  url,
  downloadUrl,
  mimeType,
  filename,
  size,
  driveHref,
}: AttachmentPreviewProps) {
  const [failed, setFailed] = useState(false);

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

  if (url && !failed) {
    if (mimeType.startsWith('image/')) {
      return (
        <a href={downloadUrl ?? url} target="_blank" rel="noopener noreferrer">
          <img
            src={url}
            alt={filename}
            loading="lazy"
            onError={() => setFailed(true)}
            className="max-h-72 max-w-xs rounded-md border object-contain"
          />
        </a>
      );
    }
    if (mimeType.startsWith('audio/')) {
      return (
        <div className="max-w-xs">
          <audio controls preload="metadata" src={url} onError={() => setFailed(true)} className="w-full" />
          <span className="mt-1 block truncate text-xs text-muted-foreground">{filename}</span>
        </div>
      );
    }
    if (mimeType.startsWith('video/')) {
      return (
        <div className="max-w-sm">
          <video
            controls
            preload="metadata"
            src={url}
            onError={() => setFailed(true)}
            className="w-full rounded-md border"
          />
          <span className="mt-1 block truncate text-xs text-muted-foreground">{filename}</span>
        </div>
      );
    }
  }

  return downloadCard;
}
