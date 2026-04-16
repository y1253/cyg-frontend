import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Building2, CheckCircle2, Mail, Phone, Shield, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/hooks/useUser';

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'long', day: 'numeric', year: 'numeric',
  });
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading, isError } = useUser(Number(id));

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  }
  if (isError || !user) {
    return <div className="p-8 text-destructive text-sm">User not found.</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="self-start gap-1.5 -ml-2 text-muted-foreground"
        onClick={() => navigate('/admin/users')}
      >
        <ArrowLeft size={15} />
        Back to Users
      </Button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center shrink-0">
          <User size={26} className="text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold">{user.name}</h1>
            <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'}>
              {user.role}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-1">Member since {formatDate(user.createdAt)}</p>
        </div>
      </div>

      {/* Details card */}
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
            <Badge variant={user.role === 'ADMIN' ? 'default' : 'secondary'} className="text-xs">
              {user.role}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Joined</p>
            <p className="text-sm font-medium">{formatDate(user.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Assigned Companies</p>
            <p className="text-sm font-medium">{user.companies.length}</p>
          </div>
        </CardContent>
      </Card>

      {/* Assigned companies */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Building2 size={15} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Assigned Companies ({user.companies.length})
          </h2>
        </div>

        {user.companies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No companies assigned to this user.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {user.companies.map(company => (
              <button
                key={company.id}
                type="button"
                onClick={() => navigate(`/companies/${company.id}`)}
                className="w-full text-left rounded-lg border bg-background px-4 py-3 hover:bg-muted/50 transition-colors flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${company.status ? 'bg-green-500' : 'bg-muted-foreground/40'}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{company.businessName}</p>
                    <p className="text-xs text-muted-foreground">
                      {company.country ?? '—'}
                      {company.supportNumber && (
                        <> · <span className="font-medium text-foreground">{company.supportNumber}</span></>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={company.status ? 'default' : 'secondary'} className="text-xs">
                    {company.status ? 'Active' : 'Inactive'}
                  </Badge>
                  {company.openTodos > 0 && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <CheckCircle2 size={12} />
                      {company.openTodos}
                    </span>
                  )}
                  <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
