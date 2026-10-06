import {
  ArrowDownToLine,
  ArrowUpToLine,
  Braces,
  PanelLeft,
  PanelRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SegmentedChoice } from './OverrideField';
import { LOGO_POSITION_LABELS } from '@/components/Companies/signature-logo';
import {
  LOGO_GAP_MAX,
  LOGO_WIDTH_MAX,
  LOGO_WIDTH_MIN,
  type LogoAlign,
  type LogoLayoutFields,
  type LogoPosition,
} from '@/api/emailSignature';

const POSITIONS: { value: LogoPosition; icon: typeof PanelLeft }[] = [
  { value: 'left', icon: PanelLeft },
  { value: 'right', icon: PanelRight },
  { value: 'above', icon: ArrowUpToLine },
  { value: 'below', icon: ArrowDownToLine },
  { value: 'token', icon: Braces },
];

const SIZE_PRESETS = [
  { label: 'S', width: 100 },
  { label: 'M', width: 180 },
  { label: 'L', width: 280 },
];

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

/**
 * Size and placement of the signature logo.
 *
 * Shared by the firm-wide defaults card and the per-company override, so the two can never
 * offer different options. Every value it produces is re-clamped server-side by
 * `normalizeLogoLayout`, so this component's limits are a convenience, not the gate.
 *
 * Alignment and spacing are hidden in `token` mode: there the logo sits inline in the
 * admin's own markup, and neither setting has anything to act on.
 */
export function LogoLayoutControls({
  value,
  onChange,
  disabled,
}: {
  value: LogoLayoutFields;
  onChange: (next: LogoLayoutFields) => void;
  disabled?: boolean;
}) {
  const set = <K extends keyof LogoLayoutFields>(
    key: K,
    next: LogoLayoutFields[K],
  ) => onChange({ ...value, [key]: next });

  const beside =
    value.logoPosition === 'left' || value.logoPosition === 'right';
  const alignOptions: { value: LogoAlign; label: string }[] = beside
    ? [
        { value: 'start', label: 'Top' },
        { value: 'center', label: 'Middle' },
        { value: 'end', label: 'Bottom' },
      ]
    : [
        { value: 'start', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'end', label: 'Right' },
      ];

  return (
    <div
      className={`flex flex-col gap-4 rounded-lg border bg-muted/20 p-3 ${
        disabled ? 'opacity-50 pointer-events-none' : ''
      }`}
    >
      {/* Position */}
      <div className="flex flex-col gap-1.5">
        <Label className="text-xs">Position</Label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
          {POSITIONS.map(({ value: pos, icon: Icon }) => {
            const active = value.logoPosition === pos;
            return (
              <button
                key={pos}
                type="button"
                disabled={disabled}
                onClick={() => set('logoPosition', pos)}
                className={`flex flex-col items-center gap-1 rounded-md border px-2 py-2 text-[11px] leading-tight transition-colors ${
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon size={16} />
                {LOGO_POSITION_LABELS[pos]}
              </button>
            );
          })}
        </div>
        {value.logoPosition === 'token' ? (
          <p className="text-[11px] text-muted-foreground">
            The logo appears exactly where you put the{' '}
            <code className="font-mono">{'{logo}'}</code> token in the signature.
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Placed automatically — a{' '}
            <code className="font-mono">{'{logo}'}</code> token in the text is
            ignored, so the logo is never shown twice.
          </p>
        )}
      </div>

      {/* Size */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-xs">Size</Label>
          <div className="flex items-center gap-1">
            {SIZE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                disabled={disabled}
                onClick={() => set('logoWidth', p.width)}
                className={`h-6 w-7 rounded border text-[11px] ${
                  value.logoWidth === p.width
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'bg-background text-muted-foreground hover:text-foreground'
                }`}
                title={`${p.width}px`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={LOGO_WIDTH_MIN}
            max={LOGO_WIDTH_MAX}
            step={5}
            value={value.logoWidth}
            disabled={disabled}
            onChange={(e) => set('logoWidth', Number(e.target.value))}
            className="flex-1 accent-[#3BBFB4]"
            aria-label="Logo width"
          />
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={LOGO_WIDTH_MIN}
              max={LOGO_WIDTH_MAX}
              value={value.logoWidth}
              disabled={disabled}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) set('logoWidth', n);
              }}
              // Typing "8" on the way to "80" must not snap to 40 mid-keystroke, so the
              // clamp happens when the field is left, not on every change.
              onBlur={() =>
                set(
                  'logoWidth',
                  clamp(value.logoWidth, LOGO_WIDTH_MIN, LOGO_WIDTH_MAX),
                )
              }
              className="h-7 w-20 text-xs"
            />
            <span className="text-xs text-muted-foreground">px</span>
          </div>
        </div>
      </div>

      {value.logoPosition !== 'token' && (
        <>
          {/* Alignment */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              {beside ? 'Vertical alignment' : 'Horizontal alignment'}
            </Label>
            <SegmentedChoice
              value={value.logoAlign}
              onChange={(v) => set('logoAlign', v)}
              options={alignOptions}
              disabled={disabled}
            />
          </div>

          {/* Spacing */}
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">
              Space between logo and text · {value.logoGap}px
            </Label>
            <input
              type="range"
              min={0}
              max={LOGO_GAP_MAX}
              step={2}
              value={value.logoGap}
              disabled={disabled}
              onChange={(e) => set('logoGap', Number(e.target.value))}
              className="accent-[#3BBFB4]"
              aria-label="Space between logo and text"
            />
          </div>
        </>
      )}
    </div>
  );
}

