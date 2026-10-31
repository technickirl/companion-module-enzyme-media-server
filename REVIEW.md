# Code review: companion-module-enzyme-media-server

Reviewed at commit 8d8d640 on 31 October 2026, against the engine source in
`enzyme/` at the same date. `yarn test` (56 tests), `yarn lint`, `prettier -c`
and `yarn check` all pass. Nothing here was run against a live engine; the
protocol findings come from reading the engine's code, with the lines cited.

Findings are ordered by how much they matter. Each says where, why, and what
to do. Anything not listed was read and found fine; a summary of what was
checked is at the end.

## 1. Replies from a real engine are dropped (blocking)

**Where:** `src/link.js:207`

```js
const i = this.hosts.findIndex((h) => h.address === rinfo.address && h.port === rinfo.port)
```

**Why it matters:** the engine does not answer from the socket it listens on.
Pongs and status go out through a separate sender bound to port 0
(`enzyme/app/src/osc.rs:427` → `OscSender::new()` →
`enzyme/control/src/osc_io.rs:99-105`), so every reply arrives from an
ephemeral source port. The module compares against the OSC port (9000) and
logs each packet as `ignored … bytes`. Against a real engine the connection
never leaves "No engine answers pings" and no status arrives. The engine's
own MIDI bridge matches replies by IP alone (`enzyme/midi/src/bridge.rs:279`).

The tests pass because the fake engine answers from its listening socket
(`test/fake-engine.js:149-153`), which the real one does not.

**Fix:** match on `h.address` only. A primary and backup on the same IP then
cannot be told apart, which is already true of the engine's bridge; if that
case is wanted, use the port as a tiebreak only when two hosts share an
address. Make the fake engine reply from a second socket bound to port 0, so
the link tests cover the real shape of the traffic.

## 2. A cue change re-sends every definition (should fix)

**Where:** `src/main.js:320`, `src/main.js:81-104`

Whenever the current cue changes, `flush()` schedules `rebuild()`, which
re-sends actions, feedbacks, variables *and* presets, throttled to once a
second. The only thing a cue change affects is the "Next cues" preset group.
During a show that is a full definitions push on every Go; Companion
re-validates every placed action and feedback, and open option editors in the
UI refresh.

**Fix:** split `rebuild()` so a cue change only calls `setPresetDefinitions`.
Keep the full rebuild for show, set list and socket changes.

## 3. A dead control socket is never noticed (should fix)

**Where:** `src/control.js:118-138`

The TCP socket has no read or connect timeout. Two cases:

- A host that accepts the connection but never sends a Challenge leaves the
  socket open and `connected === false` for ever, with no reconnect.
- After a Welcome, a cable pull or a crashed machine leaves a half-open
  socket. Nothing arrives, but Node reports nothing until the OS keepalive
  fires (hours). `connected` stays true, so `sourceEntry()` (`src/main.js:226`)
  keeps the dead primary as the source of names and pictures, and the live
  backup's pictures are discarded at `src/main.js:354`. The status shows Ok.

The engine side expects quick clients: it gives the handshake 10 s
(`enzyme/protocol/src/key.rs:56`) and sends `StatusFast` thirty times a
second, so more than a few seconds of silence on an admitted socket means the
link is gone.

**Fix:** `socket.setTimeout(…)` with a short limit before the Welcome and one
of a few seconds after it; on timeout, destroy the socket and let the
existing reconnect path run.

## 4. Two "Next cue picture" buttons on different timelines share one picture

**Where:** `src/main.js:364-369`, `src/main.js:427-439`

The picture is keyed by raster only, and the engine is told one timeline:
whichever feedback `updatePictureWants()` saw last. Two buttons asking for
different timelines both show the last one's picture, with nothing said.

**Fix:** either key the picture and the feedback by timeline too and log a
warning when two disagree, or say in the feedback's description that one
timeline's next cue is pictured at a time.

## 5. Raster pictures are switched on for a next-cue-only button

**Where:** `src/main.js:441-451`

`wanted.rasters` is true for `next_cue_picture` as well, so `RasterPictures`
is sent as true even when no button shows a raster. The engine draws next-cue
pictures whenever the rate is above zero regardless of that flag
(`enzyme/app/src/previews.rs:716`), so it then also reads back and encodes
every raster for nothing.

**Fix:** set `RasterPictures` only when a `raster_picture` feedback exists;
keep `PreviewRate` above zero for either kind.

## 6. Smaller points

- **`src/lines.js`:** a line that never ends grows without bound. The engine
  caps its lines at 16 MiB (`enzyme/protocol/src/wire.rs:26`). Cap the pending
  length and reconnect past it.
- **`src/feedbacks.js:24-33` and `:153`:** `layerField` and the
  `timeline_is_master` field have a numeric default (`1`) but become dropdowns
  whose ids are strings once the show's names are known, so the default
  renders as a custom value instead of selecting "1: Backdrop". Use `'1'`, or
  number ids in `layerChoices()`.
- **`src/feedbacks.js:100` and `:110`:** the cue fields of `cue_is` and
  `next_cue_is` have no `choices: 'cue'`, while `cue_go` and `cue_label` do.
- **`src/actions.js:64-70`:** a region picked from the dropdown comes as
  "raster/region" and the Raster field is then ignored, but it stays visible.
  Say so in the Region field's tooltip, since the field cannot drive
  `isVisibleExpression`.
- **`src/choices.js:5-19`:** the engine also takes `/transport/play`
  (`enzyme/control/src/osc.rs:664`), distinct from `go`. Worth adding to the
  transport dropdown.
- **`src/main.js:334`:** `delete values.undefined` papers over
  `pictureVariable()` returning undefined for media keys. Skip the assignment
  instead.
- **`.github/workflows/companion-module-checks.yaml`:** the shared workflow
  lints, checks and builds but does not run `yarn test`. Add a job for it;
  finding 1 is exactly what a test job would have caught once the fake engine
  is fixed.

## Checked and found right

- Every action's address and arguments against the engine's interpreter
  (`enzyme/control/src/osc.rs:660-1130`): transport, cue by number or name,
  locate, chase, blackout, master, mode, override, audio, every layer
  message including owner with a timeline, sweep, transition time and type,
  the fade-time argument position for values and whole colours
  (`value_time`, `:345`), region and pixel-group looks and releases, recall,
  set list rows (numbered over non-note rows on both sides), custom OSC.
- The layer parameter names against the personality's list
  (`enzyme/control/src/osc.rs:2896-2920`): all present, including
  `mask_feather_gamma` and values 9 to 16.
- Every status address the parser reads against `status_set`
  (`enzyme/control/src/osc.rs:1274-1465`) and the set list and recall lines
  (`enzyme/app/src/osc.rs:1065-1075`).
- The control socket: Challenge, Hello (fields and defaults), Admitted as a
  bare string, Welcome, Refused `{kind, why}`, Show, Status (`name`, `pair`,
  `last_recall`, `control_key`, `snapshot.set_list.current`), SetList wrapper,
  the three thumbnail messages, and the four settings sent
  (`enzyme/protocol/src/wire.rs`). The proof is the engine's HMAC over its
  label and the nonce (`enzyme/protocol/src/key.rs:66,98`). The key is never
  logged.
- Bonjour: the engine announces `_enzyme._tcp` on the control socket's port
  (`enzyme/protocol/src/discovery.rs:30,252`), and `hostsFromConfig` takes the
  port from the Bonjour value as the socket port, not the OSC port.
- The Companion API used (secrets, `secret-text`, value feedbacks,
  `checkFeedbacksById`, layered and template presets, alternatives,
  `isVisibleExpression`) exists in `@companion-module/base` 2.2.2.
- Timers and listeners are cleared on `disconnect()`; no sends go out from a
  stopped link or socket.
