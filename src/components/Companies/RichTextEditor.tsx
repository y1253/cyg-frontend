import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  List,
  ListOrdered,
  IndentIncrease,
  IndentDecrease,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link2,
  Palette,
  RemoveFormatting,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';

interface RichTextEditorProps {
  html: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

// Font families offered (mirrors Gmail's Sans Serif / Serif / Fixed width).
const FONTS = [
  { label: 'Sans Serif', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Serif', value: 'Georgia, "Times New Roman", serif' },
  { label: 'Fixed width', value: '"Courier New", monospace' },
];

// execCommand fontSize takes 1–7; map Gmail-style labels onto that scale.
const SIZES = [
  { label: 'Small', value: '2' },
  { label: 'Normal', value: '3' },
  { label: 'Large', value: '5' },
  { label: 'Huge', value: '6' },
];

const COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc',
  '#e11d48', '#ea580c', '#ca8a04', '#16a34a', '#0891b2', '#2563eb',
  '#7c3aed', '#c026d3', '#db2777', '#ffffff',
];

// True when the HTML holds no visible content (only empty tags / <br>).
function isEmptyHtml(html: string): boolean {
  return (
    html
      .replace(/<br\s*\/?>/gi, '')
      .replace(/<div>\s*<\/div>/gi, '')
      .replace(/&nbsp;/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim() === ''
  );
}

// A toolbar button that runs a formatting command. mousedown-preventDefault
// stops the editor from losing its selection when the button is pressed.
function ToolBtn({
  onRun,
  title,
  children,
}: {
  onRun: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7 text-muted-foreground hover:text-foreground"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onRun}
    >
      {children}
    </Button>
  );
}

// A dependency-free rich-text editor (contentEditable + document.execCommand)
// with a Gmail-like toolbar. Emits HTML via onChange. Toolbar actions preserve
// the editor's text selection so formatting applies to the highlighted range.
export function RichTextEditor({
  html,
  onChange,
  placeholder,
  minHeight = 160,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');

  // Keep the DOM in sync with the `html` prop without stomping the caret while
  // the user is typing — only overwrite when the editor isn't focused.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (document.activeElement !== el && el.innerHTML !== html) {
      el.innerHTML = html;
    }
  }, [html]);

  const emit = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (editorRef.current?.contains(range.commonAncestorContainer)) {
      savedRange.current = range.cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const range = savedRange.current;
    if (range) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
  }, []);

  const exec = useCallback(
    (command: string, value?: string) => {
      restoreSelection();
      document.execCommand(command, false, value);
      saveSelection();
      emit();
    },
    [restoreSelection, saveSelection, emit],
  );

  const applyLink = () => {
    const url = linkUrl.trim();
    if (url) exec('createLink', /^https?:\/\//i.test(url) ? url : `https://${url}`);
    setLinkUrl('');
    setLinkOpen(false);
  };

  return (
    <div className="rounded-md border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 border-b px-1.5 py-1">
        <select
          className="h-7 rounded-md border border-input bg-background px-1 text-xs text-muted-foreground"
          title="Font"
          defaultValue={FONTS[0].value}
          onMouseDown={() => saveSelection()}
          onChange={(e) => exec('fontName', e.target.value)}
        >
          {FONTS.map((f) => (
            <option key={f.label} value={f.value}>{f.label}</option>
          ))}
        </select>
        <select
          className="h-7 rounded-md border border-input bg-background px-1 text-xs text-muted-foreground"
          title="Size"
          defaultValue="3"
          onMouseDown={() => saveSelection()}
          onChange={(e) => exec('fontSize', e.target.value)}
        >
          {SIZES.map((s) => (
            <option key={s.label} value={s.value}>{s.label}</option>
          ))}
        </select>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolBtn title="Bold" onRun={() => exec('bold')}><Bold size={15} /></ToolBtn>
        <ToolBtn title="Italic" onRun={() => exec('italic')}><Italic size={15} /></ToolBtn>
        <ToolBtn title="Underline" onRun={() => exec('underline')}><Underline size={15} /></ToolBtn>
        <ToolBtn title="Strikethrough" onRun={() => exec('strikeThrough')}><Strikethrough size={15} /></ToolBtn>

        {/* Text color */}
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Text color"
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
            onClick={() => setColorOpen((o) => !o)}
          >
            <Palette size={15} />
          </Button>
          {colorOpen && (
            <div className="absolute left-0 top-8 z-20 grid grid-cols-6 gap-1 rounded-md border bg-popover p-2 shadow-md">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="h-5 w-5 rounded border border-border/60"
                  style={{ backgroundColor: c }}
                  title={c}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { exec('foreColor', c); setColorOpen(false); }}
                />
              ))}
            </div>
          )}
        </div>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolBtn title="Bulleted list" onRun={() => exec('insertUnorderedList')}><List size={15} /></ToolBtn>
        <ToolBtn title="Numbered list" onRun={() => exec('insertOrderedList')}><ListOrdered size={15} /></ToolBtn>
        <ToolBtn title="Decrease indent" onRun={() => exec('outdent')}><IndentDecrease size={15} /></ToolBtn>
        <ToolBtn title="Increase indent" onRun={() => exec('indent')}><IndentIncrease size={15} /></ToolBtn>

        <Separator orientation="vertical" className="mx-1 h-6" />

        <ToolBtn title="Align left" onRun={() => exec('justifyLeft')}><AlignLeft size={15} /></ToolBtn>
        <ToolBtn title="Align center" onRun={() => exec('justifyCenter')}><AlignCenter size={15} /></ToolBtn>
        <ToolBtn title="Align right" onRun={() => exec('justifyRight')}><AlignRight size={15} /></ToolBtn>

        <Separator orientation="vertical" className="mx-1 h-6" />

        {/* Link */}
        <div className="relative">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Insert link"
            onMouseDown={(e) => { e.preventDefault(); saveSelection(); }}
            onClick={() => setLinkOpen((o) => !o)}
          >
            <Link2 size={15} />
          </Button>
          {linkOpen && (
            <div className="absolute left-0 top-8 z-20 flex items-center gap-1 rounded-md border bg-popover p-2 shadow-md">
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyLink(); } }}
                placeholder="https://example.com"
                className="h-7 w-52 rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Button type="button" size="sm" className="h-7" onMouseDown={(e) => e.preventDefault()} onClick={applyLink}>
                Add
              </Button>
            </div>
          )}
        </div>

        <ToolBtn title="Remove formatting" onRun={() => exec('removeFormat')}><RemoveFormatting size={15} /></ToolBtn>
      </div>

      {/* Editable area */}
      <div className="relative">
        {placeholder && isEmptyHtml(html) && (
          <span className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={emit}
          onKeyUp={saveSelection}
          onMouseUp={saveSelection}
          onBlur={saveSelection}
          style={{ minHeight }}
          className="w-full overflow-y-auto px-3 py-2 text-sm outline-none [&_a]:text-blue-600 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground"
        />
      </div>
    </div>
  );
}
