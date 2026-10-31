## Enzyme media server

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

### Actions

Transport (Go, Pause, Stop, Reset, Hold, Skip, Go next and previous, sections, TC lock and release), Fire cue, Locate, Chase mode; Blackout, Master level, Mode, Override; Audio master, mute, bus level and bus mute; a layer's owner, play mode, media, generator, effect, mapping, blend, key mode, transition, in and out points, position, any parameter, colour and sweeps; a region's look, colour and release; a pixel group's look and release; Recall; the set list; and a custom OSC message for anything else.

### Feedbacks

Transport state, current cue, next cue, section, blackout, mode, override, timeline is the master, connected, current set list row, last recall; and at Full, a layer's owner, showing and play mode.

Value feedbacks for layered buttons: Raster picture, Next cue picture, Media tile picture and Recall picture give an image element its picture as a data URI; Cue label, Recall label and Raster label give a text element a name. The presets show how they go together.

### Variables

From the control socket: `engine_name`, `engine_version`, `engine_driving`, `show_name`, `cue_name`, `next_cue_name`, `next_cue_picture`, `setlist_name`, `setlist_row_name`, `timeline_N_name`, `timeline_N_cue_name`, `timeline_N_next_cue_name`, `layer_N_name`, `raster_N_name`, `raster_N_picture` and `recall_B_T_name`. The picture variables hold a data URI for an image element.

Everything the status gives: `timecode`, `position`, `frame`, `transport`, `cue`, `next_cue`, `section_number`, `section_name`, `heartbeat`, `recall_bank`, `recall_tile`, `recall_name`, `setlist_row`, `setlist_timeline`, `mode`, `blackout`, `master`, `override`; per timeline (when the show has more than one) `timeline_N_name`, `timeline_N_timecode`, `timeline_N_transport`, `timeline_N_cue`, `timeline_N_next_cue`, `timeline_N_master`; and at Full, per layer `layer_N_owner`, `layer_N_source`, `layer_N_showing`, `layer_N_play_mode`, `layer_N_opacity`, `layer_N_time`, `layer_N_colour_rgb`, `layer_N_colour_hsi` and `layer_N_colour_xy`. Timeline and layer variables appear as the status first mentions them.
