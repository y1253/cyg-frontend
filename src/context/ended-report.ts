/**
 * What — if anything — this browser is entitled to tell the server about how an internal
 * call ended.
 *
 * Its own module, not part of `SoftphoneContext`, for the usual reason in this codebase:
 * it is a pure rule whose every case is a RACE in production — one call forked to every
 * tab a user has open — so it can only really be pinned by tests, and a component file
 * cannot export it without breaking fast refresh.
 */

/** Just enough of a `CallSlot` to decide. Structural, to avoid importing the context. */
export interface EndedReportSlot {
  /** Stamped at SIP `Established`, null while ringing. Read BEFORE the teardown. */
  answeredAt: number | null;
  info: {
    /**
     * Present ONLY on an internal CALLEE's event — it is the `X-Cyg-Call` marker that
     * stops a callee answering the caller's own leg. So `token != null` is exactly
     * "I am the callee", and it is the discriminator the rest of the app already uses.
     */
    token?: string;
  };
}

export interface EndedReport {
  answered: boolean;
  durationSec: number;
}

/**
 * ── A BROWSER SEES ITS OWN BRANCH, NEVER THE CALL ──────────────────────────────
 *
 * Every browser registers the SAME SIP credential, so an internal call forks to all of
 * them. A CANCEL therefore means "not me" — it never means "nobody". That makes a
 * negative report from a branch worthless, and it is the reported bug: a user with two
 * tabs answered on one, the other was CANCELled, and its teardown told the server
 * `no-answer`/0 at the exact moment of the answer. `no-answer` counts as settled, so the
 * winner's later "answered, 90s" was refused and the call read MISSED forever.
 *
 * Who may say what, and why:
 *
 * | who | may report | why |
 * |---|---|---|
 * | CALLEE that reached Established | `answered` + the real talk time | It picked up. The only witness there is, and no provider path reports this promptly. |
 * | CALLEE CANCELled without answering | **nothing** (`null`) | Only its own branch died. |
 * | CALLER | `answered: false` only | ⚠️ Its leg AUTO-ACCEPTS — `pair()` accepts an outbound INVITE immediately — so it is `Established` for the whole ring and `answeredAt` measures the RING, not the conversation. Reporting its own `answeredAt` files a call nobody picked up as ANSWERED with the ring time as its duration. But when the caller's ROOT leg ends the call really is over, and that is the one case `settleFromDial` cannot see (SignalWire does not request a `<Dial action>` URL when the leg running the `<Dial>` is the one that hung up). |
 *
 * A wrong negative that still slips through — from the caller above, or from a cached
 * older bundle — is no longer permanent: the server's `writableWhen` lets a witness
 * correct an absence. This half means it is usually never sent at all; that half means it
 * cannot stick. Both are needed.
 *
 * ⚠️ Derived at TEARDOWN, not from `publish`'s `seconds`. That value is recomputed on a
 * 1s timer for display; reading it here would round a 9.8s call to whatever the last tick
 * happened to say. And `answeredAt` must be read BEFORE `releaseSlotMedia`, which nulls it.
 */
export function endedReportFor(slot: EndedReportSlot): EndedReport | null {
  const isCallee = slot.info.token != null;

  if (!isCallee) {
    // The caller. It knows the call is over and nothing else.
    return { answered: false, durationSec: 0 };
  }

  // A callee branch that never picked up is reporting on somebody else's answer.
  if (slot.answeredAt === null) return null;

  return {
    answered: true,
    durationSec: Math.max(0, Math.round((Date.now() - slot.answeredAt) / 1000)),
  };
}
