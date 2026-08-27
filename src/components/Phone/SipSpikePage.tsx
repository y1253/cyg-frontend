import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  SessionState,
  UserAgent,
  type Session,
} from 'sip.js';

/**
 * PHASE 2a SPIKE — THROWAWAY. Delete once SoftphoneProvider exists.
 *
 * It answers exactly one question: can a browser register against SignalWire over
 * SIP/WSS and be rung by a `<Dial><Sip>` from our inbound webhook? Everything about
 * the real feature — assignment routing, the company name, the global overlay — is
 * deliberately absent, because none of it can be designed until this works.
 *
 * Credentials come from the QUERY STRING, never from the bundle:
 *   /sip-spike?u=cyg_u16&p=<password>
 * A deployed bundle with a live SIP password baked in would be a real credential leak,
 * and this page is reachable without auth so the spike is easy to run.
 *
 * Everything is logged on screen. When this fails, WHERE it fails is the finding:
 * transport connect vs REGISTER vs no INVITE vs SDP/media.
 */
export function SipSpikePage() {
  const [log, setLog] = useState<string[]>([]);
  const [status, setStatus] = useState('idle');
  const [incoming, setIncoming] = useState<Invitation | null>(null);
  const [inCall, setInCall] = useState(false);

  const uaRef = useRef<UserAgent | null>(null);
  const regRef = useRef<Registerer | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const say = useCallback((line: string) => {
    // eslint-disable-next-line no-console
    console.log('[sip-spike]', line);
    setLog((prev) => [
      ...prev,
      `${new Date().toISOString().slice(11, 19)}  ${line}`,
    ]);
  }, []);

  /** Attach the negotiated remote audio track, or the call is silent both ways. */
  const attachRemoteAudio = useCallback(
    (session: Session) => {
      const sdh = session.sessionDescriptionHandler as unknown as {
        peerConnection?: RTCPeerConnection;
      };
      const pc = sdh?.peerConnection;
      if (!pc || !audioRef.current) {
        say('!! no peerConnection or audio element — call will be silent');
        return;
      }
      const remote = new MediaStream();
      pc.getReceivers().forEach((r) => {
        if (r.track) remote.addTrack(r.track);
      });
      audioRef.current.srcObject = remote;
      void audioRef.current.play().catch((e) => say(`audio play blocked: ${String(e)}`));
      say(`remote audio attached (${remote.getTracks().length} track(s))`);
    },
    [say],
  );

  const watchSession = useCallback(
    (session: Session) => {
      session.stateChange.addListener((state) => {
        say(`session -> ${state}`);
        if (state === SessionState.Established) {
          setInCall(true);
          attachRemoteAudio(session);
        }
        if (state === SessionState.Terminated) {
          setInCall(false);
          setIncoming(null);
          if (audioRef.current) audioRef.current.srcObject = null;
        }
      });
    },
    [attachRemoteAudio, say],
  );

  const connect = useCallback(async () => {
    const params = new URLSearchParams(window.location.search);
    const username = params.get('u');
    const password = params.get('p');
    const domain =
      params.get('d') ?? 'cygfinance.sip.signalwire.com';

    if (!username || !password) {
      say('!! missing ?u=<username>&p=<password> in the URL');
      setStatus('missing credentials');
      return;
    }

    const uri = UserAgent.makeURI(`sip:${username}@${domain}`);
    if (!uri) {
      say('!! could not parse the SIP URI');
      return;
    }

    say(`connecting to wss://${domain} as ${username}`);
    setStatus('connecting');

    const ua = new UserAgent({
      uri,
      authorizationUsername: username,
      authorizationPassword: password,
      transportOptions: { server: `wss://${domain}` },
      // Audio only. Asking for video would prompt for a camera and can fail the
      // negotiation outright on a machine without one.
      sessionDescriptionHandlerFactoryOptions: {
        constraints: { audio: true, video: false },
      },
      logLevel: 'warn',
      delegate: {
        onInvite: (invitation) => {
          say(`INVITE from ${invitation.remoteIdentity.uri.toString()}`);
          // The whole point of the spike: did an INVITE arrive at all?
          setIncoming(invitation);
          setStatus('ringing');
          watchSession(invitation);
        },
        onDisconnect: (error) => {
          say(`transport disconnected${error ? `: ${error.message}` : ''}`);
          setStatus('disconnected');
        },
      },
    });
    uaRef.current = ua;

    try {
      await ua.start();
      say('transport connected');
    } catch (e) {
      say(`!! transport failed: ${String(e)}`);
      setStatus('transport failed');
      return;
    }

    const registerer = new Registerer(ua);
    regRef.current = registerer;
    registerer.stateChange.addListener((s) => {
      say(`registerer -> ${s}`);
      if (s === RegistererState.Registered) setStatus('REGISTERED — call the number');
      if (s === RegistererState.Unregistered) setStatus('unregistered');
    });

    try {
      await registerer.register();
    } catch (e) {
      say(`!! REGISTER failed: ${String(e)}`);
      setStatus('register failed');
    }
  }, [say, watchSession]);

  useEffect(() => {
    return () => {
      void regRef.current?.unregister().catch(() => undefined);
      void uaRef.current?.stop().catch(() => undefined);
    };
  }, []);

  const answer = async () => {
    if (!incoming) return;
    say('accepting…');
    try {
      await incoming.accept({
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false },
        },
      });
    } catch (e) {
      say(`!! accept failed: ${String(e)}`);
    }
  };

  const decline = async () => {
    if (!incoming) return;
    await incoming.reject().catch((e) => say(`reject failed: ${String(e)}`));
    setIncoming(null);
    setStatus('declined');
  };

  const hangup = async () => {
    const session = incoming as Session | null;
    if (session?.state === SessionState.Established) {
      await (session as Invitation).bye().catch(() => undefined);
    }
    setInCall(false);
  };

  const dial = async () => {
    const target = window.prompt('Number to call, E.164:', '+1');
    if (!target || !uaRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const domain = params.get('d') ?? 'cygfinance.sip.signalwire.com';
    const uri = UserAgent.makeURI(`sip:${target}@${domain}`);
    if (!uri) return say('!! bad target URI');
    const inviter = new Inviter(uaRef.current, uri, {
      sessionDescriptionHandlerOptions: {
        constraints: { audio: true, video: false },
      },
    });
    watchSession(inviter);
    say(`inviting ${target}…`);
    await inviter.invite().catch((e) => say(`!! invite failed: ${String(e)}`));
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 font-mono text-sm text-slate-200">
      <h1 className="mb-1 text-lg font-semibold text-teal-400">
        SIP spike — throwaway
      </h1>
      <p className="mb-4 text-xs text-slate-400">
        Open as <code>/sip-spike?u=cyg_u16&amp;p=&lt;password&gt;</code>, press Connect,
        then call the company number.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void connect()}
          className="rounded bg-teal-600 px-3 py-1.5 text-white hover:bg-teal-500"
        >
          Connect &amp; register
        </button>
        <button
          onClick={() => void dial()}
          className="rounded bg-slate-700 px-3 py-1.5 hover:bg-slate-600"
        >
          Outbound test call
        </button>
        <span className="ml-2 rounded bg-slate-800 px-2 py-1 text-xs">
          status: <strong className="text-teal-300">{status}</strong>
        </span>
      </div>

      {incoming && !inCall && (
        <div className="mb-4 rounded border border-teal-500 bg-teal-950/60 p-4">
          <p className="mb-2">
            Incoming call from{' '}
            <strong>{incoming.remoteIdentity.uri.user ?? 'unknown'}</strong>
          </p>
          <button
            onClick={() => void answer()}
            className="mr-2 rounded bg-green-600 px-3 py-1.5 text-white"
          >
            Answer
          </button>
          <button
            onClick={() => void decline()}
            className="rounded bg-red-600 px-3 py-1.5 text-white"
          >
            Decline
          </button>
        </div>
      )}

      {inCall && (
        <div className="mb-4 rounded border border-green-500 bg-green-950/50 p-4">
          <p className="mb-2 text-green-300">Call connected — talk.</p>
          <button
            onClick={() => void hangup()}
            className="rounded bg-red-600 px-3 py-1.5 text-white"
          >
            Hang up
          </button>
        </div>
      )}

      {/* Must exist before the first accept; a src assigned to a missing element is silence. */}
      <audio ref={audioRef} autoPlay />

      <pre className="max-h-[50vh] overflow-auto rounded bg-black/60 p-3 text-xs leading-relaxed">
        {log.join('\n') || '(no events yet)'}
      </pre>
    </div>
  );
}
