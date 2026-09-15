import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useNotifications } from '@/context/NotificationContext';

/**
 * Sound / desktop-alert preferences for new messages.
 *
 * Lifted out of `NotificationBell` unchanged when the bell grew an unread list: the
 * popover now has two pages and these controls are the second one, reached by the gear.
 * They are a once-in-a-while interaction, the list is the everyday one.
 */
export function NotificationSettings() {
  const { prefs, setSound, setDesktop, setWhileActive, permission, testSound } =
    useNotifications();

  const blocked = permission === 'denied';
  const unsupported = permission === 'unsupported';

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">Alerts</span>
        <span className="text-xs text-muted-foreground">
          Sounds and desktop alerts for new messages and incoming calls.
        </span>
      </div>

      <div className="flex flex-col gap-1">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
          <Checkbox
            checked={prefs.sound}
            onCheckedChange={(checked) => setSound(checked === true)}
          />
          Notification sound
        </label>
        {/* This checkbox gates the MESSAGE chime only. `syncTones` starts the call
            ringtone without consulting it, so an agent who unticks this still gets rung —
            which is right, and the label was the thing that lied. */}
        <span className="pl-6 text-xs text-muted-foreground">
          Incoming calls always ring.
        </span>
      </div>

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
          {blocked ? (
            <span className="pl-6 text-xs text-muted-foreground">
              Blocked in your browser settings.
            </span>
          ) : (
            <span className="pl-6 text-xs text-muted-foreground">
              Reaches you on another tab. Calls get Answer and Decline buttons.
            </span>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
          <Checkbox
            checked={prefs.whileActive}
            onCheckedChange={(checked) => setWhileActive(checked === true)}
          />
          Alert me while I'm using the app
        </label>
        <span className="pl-6 text-xs text-muted-foreground">
          Off = only when this tab isn't focused.
        </span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="justify-start text-muted-foreground hover:text-foreground"
        onClick={testSound}
      >
        Test sound
      </Button>
    </div>
  );
}
