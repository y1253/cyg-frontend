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
  /**
   * `X-Cyg-Dial`: a per-dial value the server puts on every leg it creates through
   * `POST /Calls` to the shared SIP address — the dialler's own leg, an internal
   * caller's leg, an added colleague's leg. Optional so a caller built before it exists
   * (and the tests' older fixtures) still type-check as "absent".
   */
  dial?: string | null;
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
  /** The `X-Cyg-Dial` value this event's leg carries. See `InviteMarkers.dial`. */
  dialToken?: string | null;
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
  // step12 — a leg WE created to the shared SIP address names its own event exactly.
  // Before this marker, two members of staff dialling within a second or two each
  // auto-answered whichever unmarked INVITE arrived first: a coin flip that put A on
  // B's customer (1,619 click-to-calls from 9 users all rang ONE SIP address). An
  // INVITE carrying it is never anybody else's call, inbound events included.
  if (markers.dial != null) return info.dialToken === markers.dial;
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
  //
  // ⚠️ step12, still ADVISORY: an unmarked INVITE reaching an event that expects a dial
  // marker falls back to `dialedHere`, exactly as before. Header delivery on a REST
  // `POST /Calls` `To` URI is unverified; `pair()` reports which path matched to the
  // server log (`[softphone] paired call dial|…`). Once production shows `dial`, an event
  // with a `dialToken` must refuse unmarked INVITEs outright — that removes the coin flip
  // for good.
  if (info.direction === 'outbound') return dialedHere;
  return true;
}
