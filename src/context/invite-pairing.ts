/**
 * Which INVITE belongs to which call event.
 *
 * Its own module, not part of `SoftphoneContext`, for the usual reason in this codebase:
 * it is a pure rule whose every case is a RACE in production — two INVITEs milliseconds
 * apart, forked to every browser on one shared SIP credential — so it can only really be
 * pinned by tests, and a component file cannot export it without breaking fast refresh.
 */

export interface InviteMarkers {
  call: string | null;
  leg: string | null;
}


/**
 * Just enough of a call event to decide ownership. Structural rather than importing
 * `IncomingCallInfo`, which lives in `SoftphoneContext` and imports this file back.
 */
export interface PairableEvent {
  /** An internal CALLEE's event names the token its leg must carry. */
  token?: string | null;
  callSid: string;
  /** Absent on an event from an older build — treated as inbound. */
  direction?: 'inbound' | 'outbound';
}

/**
 * Does this INVITE belong to this event?
 *
 * ── WHY THIS IS NOT JUST AN EQUALITY TEST ANY MORE ─────────────────────────────
 * With call waiting the browser can be holding SEVERAL INVITEs and SEVERAL events at
 * once, and it used to pair whatever it had with whatever it had — which across two
 * concurrent calls means labelling caller B with company A.
 *
 * ⚠️ The leg marker is ADVISORY, never required. `<Sip>` URI parameters arriving as SIP
 * headers is still unverified against the live SignalWire account, so an absent marker
 * falls through to order-based matching — exactly what this file did before. If headers
 * are never delivered, nothing regresses; if they are, every pairing is exact. The log
 * line in `pair` says which happened, from real traffic, with no deploy.
 */
export function invitePairsWith(
  markers: InviteMarkers,
  info: PairableEvent,
  /** Did THIS tab place an outbound call recently? See the note below. */
  dialedHere: boolean,
): boolean {
  // An INTERNAL callee's event names the token its own leg must carry. Unchanged rule.
  if (info.token != null) return markers.call === info.token;
  // Every other event is a company call, or an internal CALLER's own leg. Neither
  // carries a token, so an INVITE that carries one is somebody else's leg.
  if (markers.call != null) return false;
  // A company leg's marker is the call's own sid.
  if (markers.leg != null) return markers.leg === info.callSid;

  // ── An UNMARKED invite is anonymous, and that was being exploited ──────────────
  // Every browser registers the SAME shared SIP credential, so every browser receives
  // every INVITE. An internal call's leg 1 — the caller's own `outbound-api` leg — carries
  // no marker at all (only the CALLEE's leg gets `X-Cyg-Call`), so this used to end in a
  // bare `return true`: any tab holding any token-less event could claim it.
  //
  // Two ways that actually happened, both intermittent:
  //  - a COLLEAGUE whose own outbound company call had just ended still held a `pending`
  //    event for up to 60s. Their browser took leg 1, matched by order, and — outbound
  //    events auto-accept — ANSWERED it. An uninvolved member of staff was connected to
  //    the callee while the caller got no overlay and no audio at all.
  //  - the caller's OWN second tab, since there is no leader election and the pending
  //    fetch is a peek rather than a consume. Both tabs accept; the loser's Terminated
  //    handler tears its slot down and the overlay vanishes on the tab being watched.
  //
  // The tab that dialled is the one thing we can know for certain without a SIP header,
  // and marking leg 1 server-side would rest on `<Sip>` URI parameters arriving as
  // headers — the very thing still unverified, and the reason order-matching exists.
  //
  // ⚠️ OUTBOUND ONLY. An INBOUND company call arrives unmarked whenever header delivery
  // does not work, which is the fallback this whole mechanism exists to preserve. Requiring
  // an intent for those would break every inbound call on exactly the deployments that
  // most need the fallback.
  if (info.direction === 'outbound') return dialedHere;
  return true;
}
