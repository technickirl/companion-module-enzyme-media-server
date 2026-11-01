# Changelog

## 0.2.2 (1 November 2026)

- The transport keys fit: every one at text size 30. A one-word key (Pause, Stop, Reset, Hold) was drawn at 44 and spilt past a Stream Deck key, showing "PA" or "ST". Buttons placed as **Linked** follow the preset; a button placed as a copy is dragged on again.

## 0.2.1 (1 November 2026)

- The Go buttons show the current section between GO and the next cue, from a new `section` variable ("2 Act one", empty for none). The timeline Go buttons have no section line, as the engine reports a section for the master alone.
- Clearer keys and names for the other transport presets: Go on the next cue, Go on the previous cue, Skip to the next cue, Skip to the previous cue, Next section, Previous section, Timecode lock and release. The transport command dropdown says what each does.

## 0.2.0 (1 November 2026)

- Transport buttons lit as Enzyme's own shell lights them. Go is green while the timeline plays, chases timecode or waits at a mark for timecode, flashes green while clips loop at a section end until Go, and goes pale green for a moment each time anyone fires a Go. Pause is amber while paused, Stop and Hold red while held.
- Three new feedbacks: Go is lit, Looping until Go (flashing) and Go just fired, each with a Timeline field. The flash and the moment after a Go need an engine from 1 November 2026 or later; an older engine lights Go green on play alone.
- The transport state labels say what the engine's words mean: `hold` is held (Stop, a Hold cue or a section end) and `stop` is paused.
- A Pause / resume transport command: Pause while playing, Go while paused, nothing while held.
- The Go presets are layered buttons with the timeline's name, a large GO and the next cue's number and name; a text-only version comes with them. Go and Stop presets for every timeline the engine reports, not a fixed four. Every transport word on a key is large.
- A `master_name` variable, and `timeline_N_name` defined for every timeline the status knows.
- The fake engine sends the three values, counts Gos, and takes `--waiting`, `--looping` and `--old-engine`.

## 0.1.0 (31 October 2026)

- Commands over OSC: transport, cues, locate, chase mode, blackout, master level, mode, override, audio, layers, regions, pixel groups, recalls, the set list and custom messages, with the OSC status stream for feedbacks and variables, and a backup engine beside the primary.
- Names and pictures over the engine's control socket: dropdowns of the show's names, name variables, picture and label feedbacks, and layered presets for cues, recalls and rasters.
