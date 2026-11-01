// The status Enzyme sends, kept as the module's picture of the engine:
// one value per variable, changed only when a message says so. The parser
// takes any argument types (Enzyme sends ints, floats and text; a number may
// come as either) and ignores addresses it does not know.

import { argNumber, argText } from './osc.js'

/** Floats come as 32-bit; three decimals is all a button can show. */
const round = (n) => Math.round(n * 1000) / 1000

const num = (arg, fallback = 0) => {
	const n = argNumber(arg)
	return Number.isFinite(n) ? n : fallback
}

/**
 * What a status message says, as variable values: a list of [name, value]
 * pairs, or null for an address that is not status this module knows.
 */
function parseStatus(message) {
	const parts = message.address.split('/').filter((p) => p !== '')
	if (parts[0] !== 'status') return null
	const args = message.args ?? []
	const a = (i) => args[i]
	switch (parts.length) {
		case 2:
			switch (parts[1]) {
				case 'heartbeat':
					return [['heartbeat', Math.trunc(num(a(0)))]]
				case 'timecode':
					return [['timecode', argText(a(0))]]
				case 'position':
					return [['position', round(num(a(0)))]]
				case 'frame':
					return [['frame', Math.trunc(num(a(0)))]]
				case 'transport':
					return [['transport', argText(a(0))]]
				case 'cue':
					return [['cue', argText(a(0))]]
				case 'next_cue':
					return [['next_cue', argText(a(0))]]
				// Sent by engines from 1 November 2026: unknown until received.
				case 'waiting':
				case 'looping':
					return [[parts[1], num(a(0)) >= 0.5 ? 1 : 0]]
				case 'go_count':
					return [['go_count', Math.trunc(num(a(0)))]]
				case 'section':
					return [
						['section_number', Math.trunc(num(a(0)))],
						['section_name', argText(a(1))],
					]
				case 'recall':
					return [
						['recall_bank', Math.trunc(num(a(0)))],
						['recall_tile', Math.trunc(num(a(1)))],
						['recall_name', argText(a(2))],
					]
				case 'mode':
					return [['mode', argText(a(0))]]
				case 'blackout':
					return [['blackout', num(a(0)) >= 0.5 ? 1 : 0]]
				case 'master':
					return [['master', round(num(a(0)))]]
				case 'override':
					return [['override', argText(a(0))]]
				default:
					return null
			}
		case 3:
			if (parts[1] === 'setlist' && parts[2] === 'current') {
				return [
					['setlist_row', Math.trunc(num(a(0)))],
					['setlist_timeline', argText(a(1))],
				]
			}
			return null
		case 4:
		case 5: {
			const n = parts[2]
			if (!/^\d+$/.test(n)) return null
			if (parts[1] === 'timeline' && parts.length === 4) {
				switch (parts[3]) {
					case 'timecode':
					case 'transport':
					case 'cue':
					case 'next_cue':
					case 'name':
						return [[`timeline_${n}_${parts[3]}`, argText(a(0))]]
					case 'master':
					case 'waiting':
					case 'looping':
						return [[`timeline_${n}_${parts[3]}`, num(a(0)) >= 0.5 ? 1 : 0]]
					case 'go_count':
						return [[`timeline_${n}_go_count`, Math.trunc(num(a(0)))]]
					default:
						return null
				}
			}
			if (parts[1] === 'layer') {
				if (parts.length === 4) {
					switch (parts[3]) {
						case 'owner':
						case 'source':
						case 'play_mode':
							return [[`layer_${n}_${parts[3]}`, argText(a(0))]]
						case 'showing':
							return [[`layer_${n}_showing`, num(a(0)) >= 0.5 ? 1 : 0]]
						case 'opacity':
						case 'time':
							return [[`layer_${n}_${parts[3]}`, round(num(a(0)))]]
						default:
							return null
					}
				}
				if ((parts[3] === 'colour' || parts[3] === 'color') && ['rgb', 'hsi', 'xy'].includes(parts[4])) {
					const values = [0, 1, 2].map((i) => round(num(a(i))))
					return [[`layer_${n}_colour_${parts[4]}`, values.join(' ')]]
				}
			}
			return null
		}
		default:
			return null
	}
}

/**
 * The engine as last heard. `apply` takes one message and says which
 * variables changed, and which timeline or layer was seen for the first
 * time (its variables are made then, so the list fits the show).
 */
class EngineState {
	constructor() {
		this.values = {}
		this.timelines = new Set()
		this.layers = new Set()
	}

	apply(message) {
		const pairs = parseStatus(message)
		if (!pairs) return null
		const changed = []
		let newTimeline = null
		let newLayer = null
		for (const [name, value] of pairs) {
			if (this.values[name] !== value) {
				this.values[name] = value
				changed.push(name)
			}
			let m = /^timeline_(\d+)_/.exec(name)
			if (m && !this.timelines.has(Number(m[1]))) {
				this.timelines.add(Number(m[1]))
				newTimeline = Number(m[1])
			}
			m = /^layer_(\d+)_/.exec(name)
			if (m && !this.layers.has(Number(m[1]))) {
				this.layers.add(Number(m[1]))
				newLayer = Number(m[1])
			}
		}
		return { changed, newTimeline, newLayer }
	}

	get(name) {
		return this.values[name]
	}

	/** Forgets everything heard, as when the engine changes. */
	clear() {
		this.values = {}
	}

	/**
	 * A timeline as a feedback names it: empty for the master, a number for
	 * its place, or a name looked up among the names the status gave (only
	 * sent when the show has more than one timeline). Null when unknown.
	 */
	timelineNumber(text) {
		const t = String(text ?? '').trim()
		if (t === '') return 0
		if (/^\d+$/.test(t)) return Number(t)
		const wanted = t.toLowerCase().replace(/[\s\-_]+/g, '_')
		for (const n of this.timelines) {
			const name = String(this.values[`timeline_${n}_name`] ?? '')
			if (name !== '' && name.toLowerCase().replace(/[\s\-_]+/g, '_') === wanted) return n
		}
		return null
	}

	/** A timeline's value: the master's bare one for 0, else its numbered one. */
	timelineValue(n, what) {
		if (n === 0) return this.values[what]
		return this.values[`timeline_${n}_${what}`]
	}
}

export { parseStatus, EngineState, round }
