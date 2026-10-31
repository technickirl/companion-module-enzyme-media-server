# Enzyme Companion module

A [Bitfocus Companion](https://bitfocus.io/companion) module for Enzyme, a media server for live shows, over OSC. Actions drive the show, and Enzyme's status stream lights the buttons and fills their text.

## On the Enzyme side

- OSC in must be on. Enzyme listens on UDP port 9000 unless it was started on another; the Control workspace shows the address and port and lists the last messages that arrived.
- Pick the status level in the connection's settings. Light is a handful of messages a second (timecode, position, transport, cues, section, recalls, set list). Full adds the show-wide values and every layer, hundreds of messages a second, and is needed only for the layer, blackout, mode and override feedbacks and variables.
- A backup engine can be given as well: every command goes to both (a following engine ignores them), and status comes from the primary until it stops answering, then from the backup once it has gone live.

## Actions

Transport (Go, Pause, Stop, Reset, Hold, Skip forward and back, Go next and previous, Section next and previous, TC lock and release), Fire cue, Locate, Chase mode; Blackout, Master level, Mode, Override; Audio master level, Audio mute, Audio bus level, Audio bus mute; Layer owner, play mode, media, generator, effect, mapping, blend mode, key mode, transition time and type, in point, out point, position, set a value (any parameter with a fade time), colour (RGB, HSI or xy) and sweep a value; Region set a value, colour and release; Pixel group set a value and release; Recall; Set list go on a row, skip a row, next and previous; Send custom OSC.

Every transport and cue action takes a timeline: empty for the master, else its number or its name. Layers, rasters, regions and pixel groups take a number or a name too.

## Feedbacks

Transport state, Current cue, Next cue, Section number, Blackout on, Mode, Override, Timeline is the master, Connected to the engine, Current set list row, Last recall fired; and at Full, Layer owner, Layer showing a picture, Layer play mode.

## Variables

`timecode`, `position`, `frame`, `transport`, `cue`, `next_cue`, `section_number`, `section_name`, `heartbeat`, `recall_bank`, `recall_tile`, `recall_name`, `setlist_row`, `setlist_timeline`, `mode`, `blackout`, `master`, `override`; per timeline (sent when the show has more than one) `timeline_N_name`, `timeline_N_timecode`, `timeline_N_transport`, `timeline_N_cue`, `timeline_N_next_cue`, `timeline_N_master`; and at Full, per layer `layer_N_owner`, `layer_N_source`, `layer_N_showing`, `layer_N_play_mode`, `layer_N_opacity`, `layer_N_time`, `layer_N_colour_rgb`, `layer_N_colour_hsi`, `layer_N_colour_xy`. Timeline and layer variables are made as the status first mentions them.

## Presets

Transport, Cues (fire, current and next cue, timecode, section), Show (blackout, mode, override, master, connected), Recalls (bank 1, tiles 1 to 8), Set list, and Go and Stop for timelines 1 to 4.

## Developing

Needs Node 22 or later and Yarn 4 (`corepack enable` gives it).

```bash
yarn install
yarn test
yarn fake-engine
```

`yarn test` runs the unit tests: the OSC encoding of every action, the status parser against packets captured from the fake engine (and live), the feedbacks, and the link's ping, timeout, resubscribe and backup logic.

`yarn fake-engine` starts a fake Enzyme on UDP 9000 that answers pings, takes subscriptions, sends Light or Full status and prints every command it hears. Options: `--port`, `--timelines`, `--layers`, `--following` (a backup that answers nothing), `--quiet`. Point a connection at 127.0.0.1 to see the buttons work without an engine. `node test/capture-fixture.js` refreshes the captured packets under `test/fixtures`.

To run the module in Companion while developing, after `yarn install`:

1. Make a folder for developer modules (say `~/companion-dev`) and put this repository's folder inside it, as `~/companion-dev/companion-module-enzyme-media-server`. The developer folder is the one that holds module folders, not the module folder itself.
2. In the Companion launcher, click the cog at the top right. Under Developer, select that folder and switch on Enable Developer Modules.
3. Launch the GUI and add the Enzyme media server connection from the Connections page (a developer module does not appear on the Modules page). Set the engine address to 127.0.0.1 and the port to 9000, with a real engine or the fake one running there.

Companion restarts the connection whenever a file in the module changes. Its log is under the connection's menu, View logs; routine traffic is logged at the debug level.

`yarn lint` and `yarn format` check and tidy the code; `yarn check` validates the manifest; `yarn package` builds the module for distribution.

See [HELP.md](./companion/HELP.md) and [LICENSE](./LICENSE).
