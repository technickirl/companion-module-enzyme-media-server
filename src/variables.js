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
	section: 'The section number and name together, empty for none',
	heartbeat: 'Seconds the engine has been up',
	recall_bank: 'The bank of the recall fired last',
	recall_tile: 'The tile of the recall fired last',
	recall_name: 'The name of the recall fired last',
	setlist_row: 'The current set list row (0 for none)',
	setlist_timeline: "The current set list row's timeline",
	take_slate: 'The slate of the take recorded last (experimental; engines from 2 November 2026)',
	take_time: 'When the last take was recorded, as "2026-11-01 14:35:07" (experimental)',
	take_next_slate: 'The slate the engine would offer next: the last one counted up (experimental)',
	mode: 'show or edit (Full)',
	blackout: '1 while blacked out (Full)',
	master: 'The master level, 0 to 1 (Full)',
	override: 'The override: off, timeline, dmx or manual (Full)',
	engine_name: "The engine's name (control socket)",
	engine_version: "The engine's version (control socket)",
	engine_driving: 'yes while the engine the status comes from is driving the show (control socket)',
	show_name: "The show's name (control socket)",
	master_name: "The master timeline's name; Master until known (control socket)",
	cue_name: "The current cue's name on the master (control socket)",
	next_cue_name: "The next cue's name on the master (control socket)",
	next_cue_picture: 'A picture of the next cue, as a data URI for an image element (control socket)',
	setlist_name: "The set list's name (control socket)",
	setlist_row_name: "The current set list row's timeline name (control socket)",
}

const TIMELINE_VARIABLES = {
	name: 'name',
	timecode: 'timecode',
	transport: 'transport',
	cue: 'current cue',
	next_cue: 'next cue',
	master: '1 while it is the master',
	cue_name: "the current cue's name (control socket)",
	next_cue_name: "the next cue's name (control socket)",
}

const LAYER_VARIABLES = {
	name: 'name (control socket)',
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

/**
 * The definitions for the timelines and layers seen in the status so far,
 * and those the control socket's show names: every timeline, layer and
 * raster by number (a raster with its picture), and every stored recall
 * by bank and tile.
 */
function variableDefinitions(timelines, layers, model = null) {
	const definitions = {}
	for (const [id, name] of Object.entries(BASE_VARIABLES)) definitions[id] = { name }
	const allTimelines = new Set(timelines)
	const allLayers = new Set(layers)
	for (const t of model?.timelines ?? []) allTimelines.add(t.number)
	for (const l of model?.layers ?? []) allLayers.add(l.number)
	for (const n of [...allTimelines].sort((a, b) => a - b)) {
		for (const [what, name] of Object.entries(TIMELINE_VARIABLES)) {
			definitions[`timeline_${n}_${what}`] = { name: `Timeline ${n}: ${name}` }
		}
	}
	for (const n of [...allLayers].sort((a, b) => a - b)) {
		for (const [what, name] of Object.entries(LAYER_VARIABLES)) {
			definitions[`layer_${n}_${what}`] = { name: `Layer ${n}: ${name}` }
		}
	}
	for (const r of model?.rasters ?? []) {
		definitions[`raster_${r.number}_name`] = { name: `Raster ${r.number}: name` }
		definitions[`raster_${r.number}_picture`] = {
			name: `Raster ${r.number}: picture, as a data URI for an image element`,
		}
	}
	for (const r of model?.recalls?.items ?? []) {
		definitions[`recall_${r.folder}_${r.file}_name`] = { name: `Recall ${r.folder}/${r.file}: name` }
	}
	return definitions
}

/**
 * The values the show gives by name, and the cue names looked up from the
 * cue numbers the OSC status gave (`state`), so they stay right when the
 * socket lags the stream by a frame. `engine` is the Welcome's name and
 * version.
 */
function nameValues(model, state, engine) {
	const values = {
		engine_name: model?.engineName || engine?.name || '',
		engine_version: engine?.version ?? '',
		engine_driving: model?.driving ? 'yes' : 'no',
		show_name: model?.name ?? '',
		setlist_name: model?.setList?.name ?? '',
		setlist_row_name: model?.setListRow(state?.get('setlist_row'))?.timelineName ?? '',
		master_name: 'Master',
		cue_name: '',
		next_cue_name: '',
	}
	// Every timeline the status knows has a name variable, empty until the show names it.
	for (const n of state?.timelines ?? []) values[`timeline_${n}_name`] = ''
	if (!model) return values
	values.master_name = model.timelines[model.masterIndex]?.name || 'Master'
	const master = model.masterIndex
	values.cue_name = model.cueName(master, state?.get('cue'))
	values.next_cue_name = model.cueName(master, state?.get('next_cue'))
	for (const t of model.timelines) {
		const i = t.number - 1
		values[`timeline_${t.number}_name`] = t.name
		values[`timeline_${t.number}_cue_name`] = model.cueName(i, state?.get(`timeline_${t.number}_cue`))
		values[`timeline_${t.number}_next_cue_name`] = model.cueName(i, state?.get(`timeline_${t.number}_next_cue`))
	}
	for (const l of model.layers) values[`layer_${l.number}_name`] = l.name
	for (const r of model.rasters) values[`raster_${r.number}_name`] = r.name
	for (const r of model.recalls.items) values[`recall_${r.folder}_${r.file}_name`] = r.name
	return values
}

/** Every variable's starting value: empty text, or 0 for a number. */
function initialValues() {
	const values = {}
	for (const id of Object.keys(BASE_VARIABLES)) values[id] = ''
	for (const id of ['position', 'frame', 'section_number', 'heartbeat', 'recall_bank', 'recall_tile', 'setlist_row']) {
		values[id] = 0
	}
	// The slate after none, as the engine's Take prompt offers it.
	values.take_next_slate = '1'
	return values
}

export { BASE_VARIABLES, TIMELINE_VARIABLES, LAYER_VARIABLES, variableDefinitions, nameValues, initialValues }
