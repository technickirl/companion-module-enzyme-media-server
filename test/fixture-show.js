// A small show for the fake engine's control socket, in the document's
// shapes: two timelines with named cues, four named layers, two rasters
// with named regions, a media bank with named tiles, a recall bank with
// named recalls (one with a tiny picture), a status whose pair is Alone
// (or Follows and not live), and a set list.

import jpeg from 'jpeg-js'

export const PROTOCOL = 8
export const SCHEMA = 9

/** A small JPEG, base64: a gradient with a frame number baked into one row. */
export function tinyJpeg(width = 64, height = 36, frame = 0) {
	const data = Buffer.alloc(width * height * 4)
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4
			data[i] = Math.round((255 * x) / Math.max(1, width - 1))
			data[i + 1] = Math.round((255 * y) / Math.max(1, height - 1))
			data[i + 2] = (frame * 16) % 256
			data[i + 3] = 255
		}
	}
	return Buffer.from(jpeg.encode({ data, width, height }, 70).data).toString('base64')
}

export const IDS = {
	timelineMain: 11,
	timelineEncore: 12,
	layers: [21, 22, 23, 24],
	rasters: [31, 32],
	regions: [[41, 42], [43]],
	media: [51, 52, 53, 54],
	generators: [61, 62],
	rows: [71, 72, 73, 74],
}

export function fixtureShow() {
	const cue = (id, number, name, t) => ({ id, number, name, t, transport: 'Play', actions: [] })
	return {
		schema_version: SCHEMA,
		name: 'Fixture show',
		show_rate: 'Fps25',
		drop_frame: false,
		master: IDS.timelineMain,
		timelines: [
			{
				id: IDS.timelineMain,
				name: 'Main',
				sections: [
					{ id: 1, name: 'Opening' },
					{ id: 2, name: 'Act one' },
				],
				tracks: [],
				cues: [
					cue(101, '1', 'Walk in', 0),
					cue(102, '2', 'Lights down', 1000),
					cue(103, '3', 'Title', 2000),
					cue(104, '3.5', 'Title hold', 2500),
					cue(105, '4', 'Band on', 3000),
					cue(106, '5', 'Song one', 4000),
					cue(107, '6', 'Song two', 5000),
					cue(108, '7', 'Interval', 6000),
					cue(109, '8', 'Act two', 7000),
					cue(110, '9', 'Finale', 8000),
					cue(111, '10', 'Walk out', 9000),
				],
			},
			{
				id: IDS.timelineEncore,
				name: 'Encore',
				sections: [{ id: 3, name: 'Encore' }],
				tracks: [],
				cues: [cue(201, '1', 'Encore start', 0), cue(202, '2', 'Bows', 1000)],
			},
		],
		layers: [
			{ id: IDS.layers[0], name: 'Backdrop', owner: 'Manual' },
			{ id: IDS.layers[1], name: 'LED screens', owner: { Timeline: IDS.timelineMain } },
			{ id: IDS.layers[2], name: 'Side screens', owner: { Timeline: IDS.timelineMain } },
			{ id: IDS.layers[3], name: 'Overlay', owner: 'Dmx' },
		],
		rasters: [
			{
				id: IDS.rasters[0],
				name: 'Stage',
				width: 1920,
				height: 1080,
				regions: [
					{ id: IDS.regions[0][0], name: 'Left wall' },
					{ id: IDS.regions[0][1], name: 'Right wall' },
				],
			},
			{
				id: IDS.rasters[1],
				name: 'Foyer',
				width: 1280,
				height: 720,
				regions: [{ id: IDS.regions[1][0], name: 'Region 1' }],
			},
		],
		inputs: [{ id: 1, name: 'Camera 1' }],
		banks: {
			media: {
				folders: [
					{
						number: 1,
						name: 'Clips',
						entries: [
							{
								id: IDS.media[0],
								address: { folder: 1, file: 1 },
								name: 'Logo loop',
								item: { File: { versions: [] } },
							},
							{ id: IDS.media[1], address: { folder: 1, file: 2 }, name: 'Rain', item: { File: { versions: [] } } },
							{ id: IDS.media[2], address: { folder: 1, file: 5 }, name: 'Credits', item: { File: { versions: [] } } },
						],
					},
					{
						number: 250,
						name: 'Inputs',
						entries: [{ id: IDS.media[3], address: { folder: 250, file: 1 }, name: 'Camera 1', item: { Live: 1 } }],
					},
				],
				unassigned: [],
			},
			generators: {
				folders: [
					{
						number: 1,
						name: 'Generators',
						entries: [
							{ id: IDS.generators[0], address: { folder: 1, file: 1 }, name: 'Colour', item: {} },
							{ id: IDS.generators[1], address: { folder: 1, file: 2 }, name: 'Noise', item: {} },
						],
					},
				],
				unassigned: [],
			},
			mappings: [],
			luts: [],
		},
		recalls: {
			banks: [
				{ number: 1, name: 'Looks' },
				{ number: 2, name: 'Sources' },
			],
			items: [
				{ at: { folder: 1, file: 1 }, name: 'Warm', kind: 'Look', picture: tinyJpeg(48, 27, 1) },
				{ at: { folder: 1, file: 2 }, name: 'Cold', kind: 'Look' },
				{ at: { folder: 1, file: 4 }, name: 'Blackout look', kind: 'Look' },
				{ at: { folder: 2, file: 1 }, name: 'Camera', kind: 'Source' },
			],
		},
	}
}

/**
 * The engine status in the wire's shape, from the fake's own state (the
 * current cue and transport of the master).
 */
export function fixtureStatus({
	following = false,
	live = false,
	state = {},
	name = 'Fake Enzyme',
	controlKey = false,
} = {}) {
	const role = following ? { Follows: { leader: '10.0.0.1:9200', render: 'Idle' } } : 'Alone'
	return {
		name,
		pair: {
			role,
			connected: following,
			in_step: following,
			drift_frames: 0,
			live: following ? live : false,
			live_since: '',
			missing_files: [],
			leader_licence: '',
			backup_live: '',
			stood_down: false,
			refused: '',
			engine: 1,
			leader_engine: 0,
			following: following ? 'following' : '',
		},
		snapshot: {
			mode: 'Show',
			blackout: state.blackout === 1,
			master_intensity: typeof state.master === 'number' ? state.master : 1,
			global_override: null,
			master: IDS.timelineMain,
			timelines: [
				{
					timeline: IDS.timelineMain,
					position: 0,
					playing: state.transport === 'play',
					holding: state.transport === 'hold',
					chasing: state.transport === 'chase',
					current_cue: state.cue ? state.cue : null,
					next_cue: state.next_cue ? state.next_cue : null,
				},
				{
					timeline: IDS.timelineEncore,
					position: 0,
					playing: false,
					holding: false,
					chasing: false,
					current_cue: null,
					next_cue: '1',
				},
			],
			layers: IDS.layers.map((id, i) => [id, i === 0 ? 'Manual' : { Timeline: IDS.timelineMain }]),
			undo_depth: 0,
			redo_depth: 0,
			set_list: { version: 1, current: state.setlist && state.setlist[0] > 0 ? IDS.rows[0] : undefined },
		},
		last_recall: state.recall ? { folder: state.recall[0], file: state.recall[1] } : null,
		control_key: controlKey,
		fps: 60,
		clients: ['Companion'],
	}
}

export function fixtureSetList() {
	return {
		list: {
			format: 1,
			name: 'Tour set',
			rows: [
				{ id: IDS.rows[0], timeline: IDS.timelineMain, timeline_name: 'Main', cue: 101 },
				{ id: IDS.rows[1], note: 'Interval here' },
				{ id: IDS.rows[2], timeline: IDS.timelineEncore, timeline_name: 'Encore', skip: true },
				{ id: IDS.rows[3], timeline: IDS.timelineMain, timeline_name: 'Main' },
			],
			next_row: 75,
		},
		version: 1,
		path: null,
		dirty: false,
	}
}

export function fixtureStatusFast(tick) {
	return {
		tick: { max_ms: 1.5, over: 0 },
		gpu: { ms: 0.4 },
		presented: [
			[IDS.rasters[0], tick],
			[IDS.rasters[1], tick],
		],
		audio_peak: 0.2,
		ltc_out_peak: 0,
	}
}
