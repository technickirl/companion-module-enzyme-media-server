// The variables: the status table's values by name, with a timeline's and a
// layer's added as the status first mentions them.

const BASE_VARIABLES = {
	timecode: "The master timeline's position as timecode",
	position: "The master timeline's position in seconds",
	frame: "The master timeline's position as a frame number",
	transport: 'The master transport: play, hold, chase or stop',
	cue: 'The current cue number (empty before the first)',
	next_cue: 'The next cue number (empty after the last)',
	section_number: 'The section number (0 for none)',
	section_name: 'The section name',
	heartbeat: 'Seconds the engine has been up',
	recall_bank: 'The bank of the recall fired last',
	recall_tile: 'The tile of the recall fired last',
	recall_name: 'The name of the recall fired last',
	setlist_row: 'The current set list row (0 for none)',
	setlist_timeline: "The current set list row's timeline",
	mode: 'show or edit (Full)',
	blackout: '1 while blacked out (Full)',
	master: 'The master level, 0 to 1 (Full)',
	override: 'The override: off, timeline, dmx or manual (Full)',
}

const TIMELINE_VARIABLES = {
	name: 'name',
	timecode: 'timecode',
	transport: 'transport',
	cue: 'current cue',
	next_cue: 'next cue',
	master: '1 while it is the master',
}

const LAYER_VARIABLES = {
	owner: 'owner (Full)',
	source: 'source, as "media 1/2" (Full)',
	showing: '1 while it shows a picture (Full)',
	play_mode: 'play mode (Full)',
	opacity: 'opacity, where it has got while fading (Full)',
	time: 'seconds into the clip (Full)',
	colour_rgb: 'colour as red, green and blue gains (Full)',
	colour_hsi: 'colour as hue, saturation and intensity (Full)',
	colour_xy: 'colour as x, y and intensity (Full)',
}

/** The definitions for the timelines and layers seen so far. */
function variableDefinitions(timelines, layers) {
	const definitions = {}
	for (const [id, name] of Object.entries(BASE_VARIABLES)) definitions[id] = { name }
	for (const n of [...timelines].sort((a, b) => a - b)) {
		for (const [what, name] of Object.entries(TIMELINE_VARIABLES)) {
			definitions[`timeline_${n}_${what}`] = { name: `Timeline ${n}: ${name}` }
		}
	}
	for (const n of [...layers].sort((a, b) => a - b)) {
		for (const [what, name] of Object.entries(LAYER_VARIABLES)) {
			definitions[`layer_${n}_${what}`] = { name: `Layer ${n}: ${name}` }
		}
	}
	return definitions
}

/** Every variable's starting value: empty text, or 0 for a number. */
function initialValues() {
	const values = {}
	for (const id of Object.keys(BASE_VARIABLES)) values[id] = ''
	for (const id of ['position', 'frame', 'section_number', 'heartbeat', 'recall_bank', 'recall_tile', 'setlist_row']) {
		values[id] = 0
	}
	return values
}

module.exports = { BASE_VARIABLES, TIMELINE_VARIABLES, LAYER_VARIABLES, variableDefinitions, initialValues }
