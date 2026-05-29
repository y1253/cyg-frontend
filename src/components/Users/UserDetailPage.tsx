import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Building2,
  Camera,
  CheckCircle2,
  Mail,
  Shield,
  User,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { WebcamCapture } from "@/components/ui/WebcamCapture";
import { useUser } from "@/hooks/useUser";
import { useEnrollFace } from "@/hooks/useEnrollFace";

const ENROLL_PARTICLES = [
  { angle:   0, dist: 36, color: '#2dd4bf' },
  { angle:  45, dist: 40, color: '#14b8a6' },
  { angle:  90, dist: 36, color: '#0d9488' },
  { angle: 135, dist: 44, color: '#5eead4' },
  { angle: 180, dist: 36, color: '#2dd4bf' },
  { angle: 225, dist: 40, color: '#99f6e4' },
  { angle: 270, dist: 36, color: '#14b8a6' },
  { angle: 315, dist: 44, color: '#0d9488' },
];

function FaceEnrollSuccess({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 gap-5 select-none">
      {/* Animated circle + checkmark + particles */}
      <div className="relative flex items-center justify-center w-24 h-24">
        {ENROLL_PARTICLES.map((p, i) => {
          const rad = (p.angle * Math.PI) / 180;
          const tx = Math.round(Math.cos(rad) * p.dist);
          const ty = Math.round(Math.sin(rad) * p.dist);
          return (
            <span
              key={i}
              aria-hidden
              className="absolute top-1/2 left-1/2 w-2.5 h-2.5 rounded-full pointer-events-none"
              style={{
                backgroundColor: p.color,
                '--tx': `${tx}px`,
                '--ty': `${ty}px`,
                animation: `face-enroll-particle 1.1s cubic-bezier(0.22,1,0.36,1) ${i * 30}ms forwards`,
              } as React.CSSProperties}
            />
          );
        })}
        <svg
          viewBox="0 0 80 80"
          className="w-24 h-24 overflow-visible"
          aria-hidden
          style={{ animation: 'face-enroll-pop 0.75s cubic-bezier(0.34,1.56,0.64,1) both' }}
        >
          <circle cx="40" cy="40" r="36" fill="#0d9488" />
          <path
            d="M22 41 L33 52 L58 28"
            fill="none"
            stroke="white"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: 22,
              strokeDashoffset: 22,
              animation: 'face-enroll-check 0.55s cubic-bezier(0.16,1,0.3,1) 0.3s forwards',
            }}
          />
        </svg>
      </div>

      {/* Text */}
      <div
        className="flex flex-col items-center gap-1 text-center"
        style={{ animation: 'face-enroll-text 0.45s ease-out 0.5s both' }}
      >
        <p className="text-lg font-semibold text-teal-700">Face Enrolled!</p>
        <p className="text-sm text-muted-foreground">{name} can now log in with face recognition.</p>
      </div>
    </div>
  );
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: user, isLoading, isError } = useUser(Number(id));
  const enrollMutation = useEnrollFace();
  const [enrollOpen, setEnrollOpen] = useState(false);
  const [enrollError, setEnrollError] = useState('');
  const [enrollSuccess, setEnrollSuccess] = useState(false);
  const [badgeGlow, setBadgeGlow] = useState(false);
  const [enrollStep, setEnrollStep] = useState(0);
  const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([]);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const STEP_INSTRUCTIONS = [
    'Look straight at the camera',
    'Turn slightly to the right',
    'Turn slightly to the left',
  ];

  function handleCapture(blob: Blob) {
    if (!user) return;
    const newBlobs = [...capturedBlobs, blob];
    setCapturedBlobs(newBlobs);
    if (enrollStep < 2) {
      setEnrollStep(enrollStep + 1);
    } else {
      setEnrollError('');
      enrollMutation.mutate(
        { userId: user.id, blobs: newBlobs as [Blob, Blob, Blob] },
        {
          onSuccess: () => {
            setEnrollSuccess(true);
            closeTimerRef.current = setTimeout(() => {
              setEnrollOpen(false);
              setEnrollSuccess(false);
              setBadgeGlow(true);
              setTimeout(() => setBadgeGlow(false), 1200);
            }, 1800);
          },
          onError: (err) => {
            setEnrollError(err instanceof Error ? err.message : 'Enrollment failed. Try again.');
          },
        },
      );
    }
  }

  function openEnrollDialog() {
    setEnrollError('');
    setEnrollStep(0);
    setCapturedBlobs([]);
    enrollMutation.reset();
    setEnrollOpen(true);
  }

  useEffect(() => () => { if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }, []);

  if (isLoading) {
    return <div className="p-8 text-muted-foreground text-sm">Loading…</div>;
  }
  if (isError || !user) {
    return <div className="p-8 text-destructive text-sm">User not found.</div>;
  }

  const faceEnrolled = (user.faceImages?.length ?? 0) > 0;

  return (
    <div className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      {/* Back */}
      <Button
        variant="ghost"
        size="sm"
        className="self-start gap-1.5 -ml-2 text-muted-foreground"
        onClick={() => navigate("/admin/users")}
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
            <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>
              {user.role}
            </Badge>
            <Badge
              variant="outline"
              className={`${faceEnrolled ? "border-teal-500 text-teal-600" : "text-muted-foreground"} ${badgeGlow ? "animate-[face-badge-glow_1.1s_ease-out_forwards]" : ""}`}
            >
              <Camera size={11} className="mr-1" />
              {faceEnrolled ? "Face enrolled" : "No face enrolled"}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-0.5">{user.email}</p>
          <p className="text-xs text-muted-foreground mt-1">
            Member since {formatDate(user.createdAt)}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={openEnrollDialog}
        >
          <Camera size={14} />
          {faceEnrolled ? "Re-enroll Face" : "Enroll Face"}
        </Button>
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
            <Badge variant={user.role === "ADMIN" ? "default" : "secondary"} className="text-xs">
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
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">Face Login</p>
            <span className={`text-sm font-medium ${faceEnrolled ? "text-teal-600" : "text-muted-foreground"}`}>
              {faceEnrolled ? "Enrolled" : "Not enrolled"}
            </span>
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
          <p className="text-sm text-muted-foreground">
            No companies assigned to this user.
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
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${company.status ? "bg-green-500" : "bg-muted-foreground/40"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{company.businessName}</p>
                    <p className="text-xs text-muted-foreground">
                      {company.country ?? "—"}
                      {company.supportNumber && (
                        <> · <span className="font-medium text-foreground">{company.supportNumber}</span></>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge variant={company.status ? "default" : "secondary"} className="text-xs">
                    {company.status ? "Active" : "Inactive"}
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

      {/* Face enrollment dialog */}
      <Dialog open={enrollOpen} onOpenChange={open => {
        if (!open) { setEnrollSuccess(false); if (closeTimerRef.current) clearTimeout(closeTimerRef.current); }
        setEnrollOpen(open);
      }}>
        <DialogContent className="sm:max-w-sm">
          {enrollSuccess ? (
            <FaceEnrollSuccess name={user.name} />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>
                  {faceEnrolled ? `Re-enroll Face — ${user.name}` : `Enroll Face — ${user.name}`}
                </DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-4 mt-2">
                {/* Step indicator */}
                <div className="flex items-center gap-2">
                  {[0, 1, 2].map(i => (
                    <div
                      key={i}
                      className={`flex-1 h-1.5 rounded-full transition-colors ${
                        i < capturedBlobs.length
                          ? 'bg-teal-500'
                          : i === enrollStep && !enrollMutation.isPending
                          ? 'bg-teal-300'
                          : 'bg-muted'
                      }`}
                    />
                  ))}
                </div>

                <p className="text-sm font-medium text-center">
                  Photo {Math.min(enrollStep + 1, 3)} of 3
                </p>
                <p className="text-sm text-muted-foreground text-center">
                  {STEP_INSTRUCTIONS[enrollStep]}
                </p>

                {enrollMutation.isPending ? (
                  <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2.5" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                    Enrolling…
                  </div>
                ) : (
                  <WebcamCapture
                    onCapture={handleCapture}
                    label={enrollStep < 2 ? 'Capture' : 'Capture & Enroll'}
                    onError={msg => setEnrollError(msg)}
                  />
                )}

                {enrollError && (
                  <p className="text-sm text-destructive bg-destructive/10 border border-destructive/20 rounded-md px-3 py-2">
                    {enrollError}
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
