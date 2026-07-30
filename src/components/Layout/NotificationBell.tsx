import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useNotifications } from '@/context/NotificationContext';

/**
 * Sound/notification controls for new messages. Both alerts deliberately only fire
 * while the tab is unfocused, which the popover states outright — otherwise the
 * first thing a user does is sit on this page, hear nothing, and assume it's broken.
 */
export function NotificationBell() {
  const { prefs, setSound, setDesktop, permission, testSound } =
    useNotifications();

  const anyOn = prefs.sound || prefs.desktop;
  const blocked = permission === 'denied';
  const unsupported = permission === 'unsupported';

  return (
    <Popover>
      <PopoverTrigger
        aria-label="Notification settings"
        title={anyOn ? 'Notifications on' : 'Notifications off'}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {anyOn ? <Bell size={16} /> : <BellOff size={16} />}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 gap-3 p-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">New message alerts</span>
          <span className="text-xs text-muted-foreground">
            Only while this tab isn't focused, so you're never chimed at while
            reading.
          </span>
        </div>

        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
          <Checkbox
            checked={prefs.sound}
            onCheckedChange={(checked) => setSound(checked === true)}
          />
          Notification sound
        </label>

        {!unsupported && (
          <div className="flex flex-col gap-1">
            <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
              <Checkbox
                checked={prefs.desktop}
                disabled={blocked}
                onCheckedChange={(checked) => void setDesktop(checked === true)}
              />
              Desktop notifications
            </label>
            {blocked && (
              <span className="pl-6 text-xs text-muted-foreground">
                Blocked in your browser settings.
              </span>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="justify-start text-muted-foreground hover:text-foreground"
          onClick={testSound}
        >
          Test sound
        </Button>
      </PopoverContent>
    </Popover>
  );
}
