import { Camera } from 'lucide-react';
import { roleBadgeVariant, type AppUser } from '../../api/users';
import { formatE164 } from '@/lib/phone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface Props {
  users: AppUser[];
  isLoading: boolean;
  emptyMessage?: string;
  onView: (user: AppUser) => void;
  onEdit: (user: AppUser) => void;
  onDelete: (user: AppUser) => void;
  /** Ends the user's session on whatever device holds it. */
  onForceLogout: (user: AppUser) => void;
  /** Hides Sign out on your own row: that is what the header's Sign out is for. */
  currentUserId?: number;
  /** Row whose sign-out is in flight. */
  signingOutId?: number | null;
}

function SessionCell({ user }: { user: AppUser }) {
  const s = user.activeSession;
  if (!s) return <span className="text-muted-foreground/50">—</span>;
  const since = new Date(s.loginAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
  const seen = new Date(s.lastSeenAt).toLocaleTimeString([], { timeStyle: 'short' });
  return (
    <div
      className="flex flex-col gap-0.5"
      title={`Signed in ${since}${s.ip ? ` from ${s.ip}` : ''} · last active ${seen}`}
    >
      <Badge
        variant="outline"
        className={
          s.stale
            ? 'w-fit border-amber-300 bg-amber-50 text-amber-700'
            : 'w-fit border-teal-300 bg-teal-50 text-teal-700'
        }
      >
        {s.stale ? 'Idle' : 'Signed in'}
      </Badge>
      {s.ip && <span className="text-[11px] text-muted-foreground">{s.ip}</span>}
    </div>
  );
}

export function UserTable({
  users,
  isLoading,
  emptyMessage,
  onView,
  onEdit,
  onDelete,
  onForceLogout,
  currentUserId,
  signingOutId,
}: Props) {
  return (
    <div className="rounded-md border bg-background">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Phone</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Face</TableHead>
            <TableHead>Session</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-[230px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                Loading...
              </TableCell>
            </TableRow>
          ) : users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                {emptyMessage ?? 'No users found.'}
              </TableCell>
            </TableRow>
          ) : (
            users.map(u => (
              <TableRow
                key={u.id}
                className="cursor-pointer"
                onClick={() => onView(u)}
              >
                <TableCell className="font-medium">{u.name}</TableCell>
                <TableCell className="text-muted-foreground">{u.email}</TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {u.phoneE164 ? formatE164(u.phoneE164) : '—'}
                </TableCell>
                <TableCell>
                  <Badge variant={roleBadgeVariant(u.role)}>
                    {u.role}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span title={u.faceEnrolled ? 'Face enrolled' : 'No face enrolled'}>
                    <Camera
                      size={15}
                      className={u.faceEnrolled ? 'text-teal-500' : 'text-muted-foreground/30'}
                    />
                  </span>
                </TableCell>
                <TableCell>
                  <SessionCell user={u} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {new Date(u.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  <div className="flex items-center gap-1">
                    {u.activeSession && u.id !== currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={signingOutId === u.id}
                        onClick={() => onForceLogout(u)}
                        title="Sign this user out of the device they are on"
                      >
                        {signingOutId === u.id ? 'Signing out…' : 'Sign out'}
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => onEdit(u)}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => onDelete(u)}
                    >
                      Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
