import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  Camera,
  CheckCircle2,
  Mail,
  Phone,
  Shield,
  User,
} from 'lucide-react';
import { formatE164 } from '@/lib/phone';
import { roleBadgeVariant } from '@/api/users';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  maskPhoneInput,
  phoneErrorFor,
  phoneForSubmit,
} from '@/components/Users/user-phone';
import { useMyProfile } from '@/hooks/useMyProfile';
import { useUpdateMyPhone } from '@/hooks/useUpdateMyPhone';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Your own profile: everything read-only except the cell number.
 *
 * ⚠️ The read-only-ness is NOT enforced here. `PATCH /users/me` takes a DTO with one
 * field, so name, email and role are unreachable however this page is edited or whatever
 * somebody posts by hand. What this component does is not OFFER them — which is a
 * presentation decision, exactly like hiding a sidebar link.
 *
 * Modelled on `Users/UserDetailPage`, and reading the same `AppUserDetail`, because the
 * server answers both from `findOne`. Deliberately NOT merged with it: that page is an
 * admin tool with a Back-to-Users bar, a face-enrolment dialog and somebody ELSE's record
 * on screen, and folding two audiences into one component is how an admin-only control
 * ends up rendered for a user.
 */
export function ProfilePage() {
  const navigate = useNavigate();
  const { data: user, isLoading, isError } = useMyProfile();
  const save = useUpdateMyPhone();

  /**
   * `null` = "the user has not touched this", so the field shows whatever the server
   * currently holds. DERIVED rather than seeded by an effect: the query resolves after
   * the first render and again after every save, and a `setPhone` in an effect would
   * cascade a render on each of those — and would fight the user's typing if a background
   * refetch landed mid-edit.
   *
   * Clearing it back to `null` on a successful save is what re-syncs the box with the
   * freshly stored value.
   */
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  }
  if (isError || !user) {
    return (
      <div className="p-8 text-destructive text-sm">
        Could not load your profile.
      </div>
    );
  }

  const faceEnrolled = Boolean(user.faceEnrolled);
  // Shown READABLE, not as raw E.164 — the same choice `EditUserDialog` makes, so the
  // two screens render one number the same way.
  const stored = formatE164(user.phoneE164);
  const phone = draft ?? stored;
  const dirty = phone.trim() !== stored.trim();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = phoneErrorFor(phone);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    // Always send the key. `phoneForSubmit` returns `null` for a blank field, and the
    // server's `!== undefined` gate is what makes that CLEAR the number rather than leave
    // it alone — so emptying the box has to reach the server as an explicit null.
    save.mutate(phoneForSubmit(phone), {
      onSuccess: () => {
        // Back to showing the server's value, which the invalidation is about to refresh.
        setDraft(null);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      },
      onError: (err: Error) => setError(err.message),
    });
  }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User size={26} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <Badge variant={roleBadgeVariant(user.role)}>{user.role}</Badge>
            <Badge
              variant="outline"
              className={
                faceEnrolled
                  ? 'border-teal-500 text-teal-600'
                  : 'text-muted-foreground'
              }
            >
              <Camera size={11} className="mr-1" />
              {faceEnrolled ? 'Face enrolled' : 'No face enrolled'}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Member since {formatDate(user.createdAt)}
          </p>
        </div>
      </div>

      {/* The one editable thing */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Phone size={14} className="text-muted-foreground" />
            Cell Number
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="profile-phone">Mobile</Label>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-start">
                <div className="flex-1 min-w-0">
                  <Input
                    id="profile-phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="(514) 555-0123"
                    value={phone}
                    onChange={(e) => {
                      setDraft(maskPhoneInput(e.target.value));
                      setError(null);
                    }}
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!dirty || save.isPending}
                  className="shrink-0"
                >
                  {save.isPending ? 'Saving…' : 'Save'}
                </Button>
              </div>
              {error ? (
                <p className="text-xs text-destructive">{error}</p>
              ) : saved ? (
                <p className="text-xs text-teal-600">Saved.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Calls for the companies you are assigned to can also ring this
                  number. Leave it blank to be reached in the browser only.
                </p>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Everything else, read-only */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Shield size={14} className="text-muted-foreground" />
            Account Details
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Full Name</p>
            <p className="text-sm font-medium">{user.name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5 flex items-center gap-1">
              <Mail size={10} /> Email
            </p>
            <p className="text-sm font-medium break-all">{user.email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Role</p>
            <Badge variant={roleBadgeVariant(user.role)} className="text-xs">
              {user.role}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Joined</p>
            <p className="text-sm font-medium">{formatDate(user.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Face Login</p>
            <span
              className={`text-sm font-medium ${faceEnrolled ? 'text-teal-600' : 'text-muted-foreground'}`}
            >
              {faceEnrolled ? 'Enrolled' : 'Not enrolled'}
            </span>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground -mt-2">
        Your name, email and role are set by an administrator. Ask one of them if
        something here is wrong.
      </p>

      {/* Assigned companies */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Assigned Companies ({user.companies.length})
          </h2>
        </div>

        {user.companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not assigned to any companies yet.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {user.companies.map((company) => (
              <button
                key={company.id}
                type="button"
                onClick={() => navigate(`/companies/${company.id}`)}
                className="w-full text-left rounded-lg border bg-background px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${company.status ? 'bg-green-500' : 'bg-muted-foreground/40'}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {company.businessName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {company.country ?? '—'}
                      {company.supportNumber && (
                        <>
                          {' · '}
                          <span className="font-medium text-foreground">
                            {company.supportNumber}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {company.openTodos > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 size={12} />
                      {company.openTodos}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
