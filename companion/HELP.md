## Enzyme media server

**Experimental build, for testing only.** This is the `takes` branch: the released module plus Takes, described under _Takes_ below. It installs over the released module, keeps its connections and buttons, and is marked as a pre-release in Companion. Its version is 0.3.0-takes.N.

Controls an Enzyme engine over OSC, with its status back for feedbacks and variables, and reads names and pictures from the engine's control socket for dropdowns, labels and picture buttons. Needs Companion 5.1 or later.

### On the Enzyme side

- OSC in must be on. Enzyme listens on port 9000 unless it was started on another; the Control workspace shows the address and port, and lists the last messages that arrived.
- Nothing else to set up: this connection subscribes to the status stream by itself and keeps it alive.

### Settings

- **Engine**: pick one found on the network, or type its address (127.0.0.1 on the same machine).
- **OSC port**: 9000 by default.
- **Backup engine**: optional. Every command goes to both engines (a following engine ignores them), and status comes from the primary until it stops answering, then from the backup once it has gone live. Give the two engines two machines: replies are told apart by address, so a primary and a backup on one machine cannot be.
- **Status level**: Light is a handful of messages a second: timecode, position, transport, cues, section, recalls and the set list. Full adds the show-wide values and every layer, hundreds of messages a second. Choose Full only for the layer, blackout, mode and override feedbacks and variables.
- **Names and pictures over the control socket**: on by default. A second, read-only connection to the engine's own control socket (port 9200) gives the names of cues, timelines, layers, rasters, regions, media tiles, recalls and set list rows, which fill the dropdowns and the name variables, and pictures of the rasters, the next cue, media tiles and recalls for buttons. Nothing is sent over it beyond the handshake and a few picture settings. Switched off, the module works from OSC alone.
- **Control key**: the engine asks connections from other machines for its control key when one is set; from the same machine none is needed. Companion keeps it as a secret. A wrong or missing key shows as a warning on the connection, with the engine's reason, while OSC keeps working.
- **Pictures for buttons**: none, 1, 2 or 4 a second. Raster and next cue pictures are drawn by the engine only while a button shows one.

With a backup engine, both sockets are read; names come from whichever is connected, and the engine driving the show (a leader, or a backup that has gone live) is the one whose status and pictures are used.

### Naming things

Wherever an action asks for a layer, timeline, raster, region or pixel group, give its number or its name. A number is a place: a layer counts from 1 at the back, a timeline from the left of the tab row. Case does not matter in a name, and a space, a dash or an underscore between words all count the same. The timeline field is empty for the master. Once the control socket has the show, these fields offer the show's names in a dropdown and still take typed text; cues, media and generator tiles, recalls and set list rows are offered by name too.

### Fades

A layer value fades over the layer's own Transition unless the action's Time field says otherwise: `snap` sets it at once, a number of seconds fades over that time.

### Transport buttons

The Go preset shows the timeline's name, a triangle, the current section and the next cue's number and name, and is lit as Enzyme's own shell lights its Go: green while the timeline plays, chases timecode or waits at a mark for timecode; flashing green while its clips loop at a section end until Go; pale green for a moment each time anyone fires a Go. Pause is amber while the timeline is paused, Stop and Hold are red while it is held (by Stop, a Hold cue or a section end), and the timecode lock is blue while it chases. The looping flash and the flash on Go need an engine from 1 November 2026 or later; an older engine lights Go green on play alone.

The transport state feedback's words are the engine's: `hold` is held, waiting for a Go; `stop` is paused, not playing and not held. The Pause / resume command sends Pause while playing and Go while paused, and nothing while held.

### Takes (experimental)

Takes are for film work: a take records every timeline in takes, whole, with each region's look and a manual recall in the day's Slates bank, as a file of its own beside the show, so "what we had on take 3" can come back. The engine must have Show, Takes on (Control tab), and needs to be from 2 November 2026 or later; an older engine knows none of these addresses.

- **Take**: records a take with the slate given (42A-3, or a number), or, with the field empty, lets the engine name it Take N for the day. Works in Live mode: nothing on screen changes, so the preset keys go pale green for a moment as the take lands.
- **Take: restore**: puts a take back by its slate: every timeline it holds, one timeline by number or name, or one layer's track on that timeline (the layer needs its timeline named). An edit, which the engine refuses in Live mode.
- **Take: region looks live**: sets the region looks a take holds, live, as a desk would, in any mode.

Feedbacks: _Last take recorded_ (the slate matches) and _Take just recorded_ (true for a moment after any take lands, from any hand). Variables: `take_slate` and `take_time` (the last take's slate and "2026-11-01 14:35:07"), and `take_next_slate`, the slate the engine's own Take prompt would offer next (42A-3 counts to 42A-4; 1 after none). The presets under Takes (experimental) give Take, Take with the next slate, the last take, Restore last take and its region looks live.

### Actions

Transport (Go, Pause, Pause / resume, Stop, Reset, Hold, Skip, Go next and previous, sections, TC lock and release), Fire cue, Locate, Chase mode; Blackout, Master level, Mode, Override; Audio master, mute, bus level and bus mute; a layer's owner, play mode, media, generator, effect, mapping, blend, key mode, transition, in and out points, position, any parameter, colour and sweeps; a region's look, colour and release; a pixel group's look and release; Recall; Take, Take: restore and Take: region looks live (experimental); the set list; and a custom OSC message for anything else.

### Feedbacks

Transport state, Go is lit, Looping until Go (flashing), Go just fired, current cue, next cue, section, blackout, mode, override, timeline is the master, connected, current set list row, last recall, last take recorded and take just recorded (experimental); and at Full, a layer's owner, showing and play mode.

Value feedbacks for layered buttons: Raster picture, Next cue picture, Media tile picture and Recall picture give an image element its picture as a data URI; Cue label, Recall label and Raster label give a text element a name. The presets show how they go together.

### Variables

From the control socket: `engine_name`, `engine_version`, `engine_driving`, `show_name`, `master_name`, `cue_name`, `next_cue_name`, `next_cue_picture`, `setlist_name`, `setlist_row_name`, `timeline_N_name`, `timeline_N_cue_name`, `timeline_N_next_cue_name`, `layer_N_name`, `raster_N_name`, `raster_N_picture` and `recall_B_T_name`. The picture variables hold a data URI for an image element.

Everything the status gives: `timecode`, `position`, `frame`, `transport`, `cue`, `next_cue`, `section_number`, `section_name`, `section`, `heartbeat`, `recall_bank`, `recall_tile`, `recall_name`, `setlist_row`, `setlist_timeline`, `take_slate`, `take_time`, `take_next_slate` (experimental), `mode`, `blackout`, `master`, `override`; per timeline (when the show has more than one) `timeline_N_name`, `timeline_N_timecode`, `timeline_N_transport`, `timeline_N_cue`, `timeline_N_next_cue`, `timeline_N_master`; and at Full, per layer `layer_N_owner`, `layer_N_source`, `layer_N_showing`, `layer_N_play_mode`, `layer_N_opacity`, `layer_N_time`, `layer_N_colour_rgb`, `layer_N_colour_hsi` and `layer_N_colour_xy`. Timeline and layer variables appear as the status first mentions them.
