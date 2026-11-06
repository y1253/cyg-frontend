import { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Puzzle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EXTENSION_ZIP_URL } from '@/api/agents';
import { useExtensionStatus } from '@/hooks/useExtensionStatus';

/**
 * step2.md (2026-11-05): the CYG Chrome extension. With it installed, an agent asked in its
 * chat to "open me a new tab and …" does it in YOUR Chrome (your own sign-ins). It signs
 * in with this app's session — open the app once after installing it.
 */
export function ChromeExtensionCard() {
  const status = useExtensionStatus();
  const [steps, setSteps] = useState(false);
  const connected = status.data?.connected === true;

  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Puzzle className="mt-0.5 size-5 text-[#3BBFB4]" />
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">Chrome extension</span>
                {status.isLoading ? null : status.isError ? (
                  <Badge variant="outline">Status unavailable</Badge>
                ) : connected ? (
                  <Badge className="bg-teal-600 text-white">Connected</Badge>
                ) : status.data?.registered ? (
                  <Badge variant="outline" className="border-amber-300 text-amber-700">
                    Installed · not connected
                  </Badge>
                ) : (
                  <Badge variant="outline">Not installed</Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Lets the agents open and work tabs in your own Chrome when you ask them in
                their chat (&ldquo;open me a new tab and …&rdquo;).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSteps((v) => !v)}
            >
              How to install
              {steps ? (
                <ChevronUp className="ml-1 size-4" />
              ) : (
                <ChevronDown className="ml-1 size-4" />
              )}
            </Button>
            <a
              href={EXTENSION_ZIP_URL}
              download="cyg-agent-extension.zip"
              className="inline-flex h-8 items-center gap-1 rounded-md bg-[#3BBFB4] px-3 text-sm font-medium text-white hover:bg-[#33a89e]"
            >
              <Download className="size-4" />
              Download
            </a>
          </div>
        </div>
        {steps && (
          <ol className="ml-8 list-decimal space-y-1 text-xs text-muted-foreground">
            <li>Download the zip and unzip it (you get a folder &ldquo;cyg-agent-extension&rdquo;).</li>
            <li>
              In Chrome open <span className="font-mono">chrome://extensions</span> and switch
              on <span className="font-medium">Developer mode</span> (top right).
            </li>
            <li>
              Click <span className="font-medium">Load unpacked</span> and pick the unzipped
              folder.
            </li>
            <li>
              Come back to this app (reload this page). The extension signs in with your session —
              its icon shows <span className="font-medium">ON</span> when connected.
            </li>
            <li>
              In an agent&rsquo;s chat, ask it to open something for you. Chrome shows a
              &ldquo;being debugged&rdquo; bar while the agent clicks or types in that tab.
            </li>
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
