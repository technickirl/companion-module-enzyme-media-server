## Enzyme media server

Controls an Enzyme engine over OSC, with its status back for feedbacks and variables.

### On the Enzyme side

- OSC in must be on. Enzyme listens on port 9000 unless it was started on another; the Control workspace shows the address and port, and lists the last messages that arrived.
- Nothing else to set up: this connection subscribes to the status stream by itself and keeps it alive.

### Settings

- **Engine**: pick one found on the network, or type its address (127.0.0.1 on the same machine).
- **OSC port**: 9000 by default.
- **Backup engine**: optional. Every command goes to both engines (a following engine ignores them), and status comes from the primary until it stops answering, then from the backup once it has gone live.
- **Status level**: Light is a handful of messages a second: timecode, position, transport, cues, section, recalls and the set list. Full adds the show-wide values and every layer, hundreds of messages a second. Choose Full only for the layer, blackout, mode and override feedbacks and variables.

### Naming things

Wherever an action asks for a layer, timeline, raster, region or pixel group, give its number or its name. A number is a place: a layer counts from 1 at the back, a timeline from the left of the tab row. Case does not matter in a name, and a space, a dash or an underscore between words all count the same. The timeline field is empty for the master.

### Fades

A layer value fades over the layer's own Transition unless the action's Time field says otherwise: `snap` sets it at once, a number of seconds fades over that time.

### Actions

Transport (Go, Pause, Stop, Reset, Hold, Skip, Go next and previous, sections, TC lock and release), Fire cue, Locate, Chase mode; Blackout, Master level, Mode, Override; Audio master, mute, bus level and bus mute; a layer's owner, play mode, media, generator, effect, mapping, blend, key mode, transition, in and out points, position, any parameter, colour and sweeps; a region's look, colour and release; a pixel group's look and release; Recall; the set list; and a custom OSC message for anything else.

### Feedbacks

Transport state, current cue, next cue, section, blackout, mode, override, timeline is the master, connected, current set list row, last recall; and at Full, a layer's owner, showing and play mode.

### Variables

Everything the status gives: `timecode`, `position`, `frame`, `transport`, `cue`, `next_cue`, `section_number`, `section_name`, `heartbeat`, `recall_bank`, `recall_tile`, `recall_name`, `setlist_row`, `setlist_timeline`, `mode`, `blackout`, `master`, `override`; per timeline (when the show has more than one) `timeline_N_name`, `timeline_N_timecode`, `timeline_N_transport`, `timeline_N_cue`, `timeline_N_next_cue`, `timeline_N_master`; and at Full, per layer `layer_N_owner`, `layer_N_source`, `layer_N_showing`, `layer_N_play_mode`, `layer_N_opacity`, `layer_N_time`, `layer_N_colour_rgb`, `layer_N_colour_hsi` and `layer_N_colour_xy`. Timeline and layer variables appear as the status first mentions them.
