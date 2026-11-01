# Enzyme Companion module

A [Bitfocus Companion](https://bitfocus.io/companion) module for Enzyme, a media server for live shows. Commands go over OSC and Enzyme's OSC status stream lights the buttons and fills their text. A second, read-only connection to Enzyme's control socket adds names (cues, timelines, layers, rasters, regions, media tiles, recalls, the set list) and pictures (rasters, the next cue, media tiles, recalls) for buttons.

Needs Companion 5.1 or later (module API 2.2).

## On the Enzyme side

- OSC in must be on. Enzyme listens on UDP port 9000 unless it was started on another; the Control workspace shows the address and port and lists the last messages that arrived.
- Pick the status level in the connection's settings. Light is a handful of messages a second (timecode, position, transport, cues, section, recalls, set list). Full adds the show-wide values and every layer, hundreds of messages a second, and is needed only for the layer, blackout, mode and override feedbacks and variables.
- A backup engine can be given as well: every command goes to both (a following engine ignores them), and status comes from the primary until it stops answering, then from the backup once it has gone live. Give the two engines two machines: replies are told apart by address, so a primary and a backup on one machine cannot be.
- Names and pictures over the control socket are on by default, on port 9200. The engine asks connections from other machines for its control key when one is set; from the same machine none is needed. The key goes in the connection's Control key field, which Companion keeps as a secret. The socket is read only: the module sends nothing over it beyond the handshake and a few picture settings. Switch it off and the module behaves as it did without it.
- Pictures for buttons: none, 1, 2 or 4 a second. The engine draws raster and next cue pictures only while a button shows one.

## Transport buttons

The Go preset shows the timeline's name, a large GO, the current section and the next cue's number and name, and is lit as Enzyme's own shell lights its Go: green while the timeline plays, chases timecode or waits at a mark for timecode; flashing green while its clips loop at a section end until Go; pale green for a moment each time anyone fires a Go, from any key, surface, cue or desk. Pause is amber while the timeline is paused, Stop and Hold are red while it is held (by Stop, a Hold cue or a section end), and the timecode lock is blue while it chases. The looping flash and the flash on Go need an engine from 1 November 2026 or later; an older engine lights Go green on play alone.

## Actions

Transport (Go, Pause, Pause / resume, Stop, Reset, Hold, Skip forward and back, Go next and previous, Section next and previous, TC lock and release), Fire cue, Locate, Chase mode; Blackout, Master level, Mode, Override; Audio master level, Audio mute, Audio bus level, Audio bus mute; Layer owner, play mode, media, generator, effect, mapping, blend mode, key mode, transition time and type, in point, out point, position, set a value (any parameter with a fade time), colour (RGB, HSI or xy) and sweep a value; Region set a value, colour and release; Pixel group set a value and release; Recall; Set list go on a row, skip a row, next and previous; Send custom OSC.

Every transport and cue action takes a timeline: empty for the master, else its number or its name. Layers, rasters, regions and pixel groups take a number or a name too. With the control socket on, these fields, the cue, the media and generator tiles, the recalls and the set list rows become dropdowns of the show's names that still take typed text.

## Feedbacks

Transport state, Go is lit, Looping until Go (flashing), Go just fired, Current cue, Next cue, Section number, Blackout on, Mode, Override, Timeline is the master, Connected to the engine, Current set list row, Last recall fired; and at Full, Layer owner, Layer showing a picture, Layer play mode.

Value feedbacks, for layered buttons and their image elements: Raster picture, Next cue picture, Media tile picture and Recall picture (each a `data:image/jpeg;base64` string), and Cue label, Recall label and Raster label for a button's text.

## Variables

`timecode`, `position`, `frame`, `transport`, `cue`, `next_cue`, `section_number`, `section_name`, `section`, `heartbeat`, `recall_bank`, `recall_tile`, `recall_name`, `setlist_row`, `setlist_timeline`, `mode`, `blackout`, `master`, `override`; per timeline (sent when the show has more than one) `timeline_N_name`, `timeline_N_timecode`, `timeline_N_transport`, `timeline_N_cue`, `timeline_N_next_cue`, `timeline_N_master`; and at Full, per layer `layer_N_owner`, `layer_N_source`, `layer_N_showing`, `layer_N_play_mode`, `layer_N_opacity`, `layer_N_time`, `layer_N_colour_rgb`, `layer_N_colour_hsi`, `layer_N_colour_xy`. Timeline and layer variables are made as the status first mentions them.

From the control socket: `engine_name`, `engine_version`, `engine_driving`, `show_name`, `master_name`, `cue_name`, `next_cue_name`, `next_cue_picture`, `setlist_name`, `setlist_row_name`; `timeline_N_name`, `timeline_N_cue_name` and `timeline_N_next_cue_name` for every timeline; `layer_N_name`; `raster_N_name` and `raster_N_picture`; and `recall_B_T_name` for every stored recall. The picture variables hold a data URI for an image element on a layered button.

## Presets

Transport (Go as a layered button with the timeline's name, a large GO and the next cue, lit as the shell's), Cues (fire, current and next cue, timecode, section), Show (blackout, mode, override, master, connected), Recalls (bank 1, tiles 1 to 8), Set list, and Go and Stop for every timeline the engine reports.

With a show from the control socket: the master's next cues from the current one, each with its number and name and firing that cue; Go with a picture of the next cue; every stored recall by bank, with its name and picture; and a monitor button per raster. These are layered buttons with an image element, with a text-only version for a host that cannot draw layers.

## Developing

Needs Node 22 or later and Yarn 4 (`corepack enable` gives it).

```bash
yarn install
yarn test
yarn fake-engine
```

`yarn test` runs the unit tests: the OSC encoding of every action, the status parser against packets captured from the fake engine (and live), the feedbacks and presets, the link's ping, timeout, resubscribe and backup logic, and the control socket's line splitting, handshake (with and without a key, and refused), StatusFast skipping, names, dropdown choices, cue name lookup, the driving-engine rule and the picture data URIs.

`yarn fake-engine` starts a fake Enzyme on UDP 9000 that answers pings, takes subscriptions, sends Light or Full status and prints every command it hears, and serves the control socket on TCP 9200 with a fixture show: two timelines with named cues, four layers, two rasters with named regions, media tiles, recalls (one with a picture) and a set list, with status thirty times a second and pictures at the asked rate. Options: `--port`, `--socket-port`, `--no-socket`, `--key secret` (the socket then asks for the control key), `--timelines`, `--layers`, `--following` (a backup that answers nothing, and whose socket says it follows), `--waiting` and `--looping` (the master starts in those states; `/fake/waiting 0|1` and `/fake/looping 0|1` flip them, the fake's own messages and not Enzyme's), `--old-engine` (no waiting, looping or Go count, as an engine before 1 November 2026), `--quiet`. Point a connection at 127.0.0.1 to see the buttons work without an engine. `node test/capture-fixture.js` refreshes the captured packets under `test/fixtures`.

To run the module in Companion while developing, after `yarn install`:

1. Make a folder for developer modules (say `~/companion-dev`) and put this repository's folder inside it, as `~/companion-dev/companion-module-enzyme-media-server`. The developer folder is the one that holds module folders, not the module folder itself.
2. In the Companion launcher, click the cog at the top right. Under Developer, select that folder and switch on Enable Developer Modules.
3. Launch the GUI and add the Enzyme media server connection from the Connections page (a developer module does not appear on the Modules page). Set the engine address to 127.0.0.1 and the port to 9000, with a real engine or the fake one running there.

Companion restarts the connection whenever a file in the module changes. Its log is under the connection's menu, View logs; routine traffic is logged at the debug level.

The other way to try a build, and the way to hand one to someone else: `yarn package` writes a `.tgz`, which Companion's Modules page takes with Import module package.

`yarn lint` and `yarn format` check and tidy the code; `yarn check` validates the manifest; `yarn package` builds the module for distribution.

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE).
