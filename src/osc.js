// OSC on the wire: encoding and decoding with the osc library, the argument
// helpers the actions use, and the small text conventions shared with Enzyme
// (a thing by its number or its name, a value's fade time, a custom message's
// arguments typed as text).

const osc = require('osc')

const int = (value) => ({ type: 'i', value: Math.trunc(Number(value)) })
const float = (value) => ({ type: 'f', value: Number(value) })
const str = (value) => ({ type: 's', value: String(value) })

/** A number as Enzyme likes it: an int when whole, a float otherwise. */
function number(value) {
	const n = Number(value)
	return Number.isInteger(n) ? int(n) : float(n)
}

/** One message as a datagram. */
function encode(message) {
	return Buffer.from(osc.writeMessage({ address: message.address, args: message.args ?? [] }))
}

/**
 * A datagram's messages: one, or a bundle's flattened (Enzyme sends single
 * messages but accepts bundles, and so does this). A packet that cannot be
 * read gives none.
 */
function decode(buffer) {
	let packet
	try {
		packet = osc.readPacket(buffer, { metadata: true })
	} catch {
		return []
	}
	const out = []
	const walk = (p) => {
		if (!p) return
		if (Array.isArray(p.packets)) {
			for (const inner of p.packets) walk(inner)
		} else if (typeof p.address === 'string') {
			out.push({ address: p.address, args: Array.isArray(p.args) ? p.args : [] })
		}
	}
	walk(packet)
	return out
}

/** An argument's value as a number, whatever type it came as; NaN if none. */
function argNumber(arg) {
	if (arg === undefined || arg === null) return NaN
	const v = arg.value
	if (typeof v === 'number') return v
	if (typeof v === 'boolean') return v ? 1 : 0
	if (typeof v === 'string') return Number(v)
	if (v && typeof v.toNumber === 'function') return v.toNumber()
	return NaN
}

/** An argument's value as text, whatever type it came as. */
function argText(arg) {
	if (arg === undefined || arg === null) return ''
	const v = arg.value
	if (v === undefined || v === null) return ''
	return String(v)
}

/**
 * A layer, timeline, raster, region or group as an address part: its number
 * as given, or its name with spaces and dashes as underscores (Enzyme treats
 * them alike, but a space in an address is awkward). Empty gives empty.
 */
function namePart(text) {
	const t = String(text ?? '').trim()
	if (t === '') return ''
	if (/^\d+$/.test(t)) return t
	return t.replace(/[\s\-/]+/g, '_')
}

/** `/timeline/<x>` for a timeline given, nothing for the master. */
function timelinePrefix(text) {
	const part = namePart(text)
	return part === '' ? '' : `/timeline/${part}`
}

/**
 * The time argument(s) after a layer value: nothing for the layer's own
 * Transition, `snap` to set it at once, or a number of seconds (0 is a snap).
 */
function timeArgs(text) {
	const t = String(text ?? '').trim()
	if (t === '') return []
	if (/^snap$/i.test(t)) return [str('snap')]
	const n = Number(t)
	if (Number.isFinite(n) && n >= 0) return [float(n)]
	return []
}

/** A cue as `/cue/go` takes it: a number when it reads as one, else its name. */
function cueArg(text) {
	const t = String(text ?? '').trim()
	if (/^\d+(\.\d+)?$/.test(t)) return number(t)
	return str(t)
}

/**
 * The arguments of a custom message, typed as text: whitespace separates
 * them, a whole number is an int, a decimal is a float, anything else text.
 * Quotes keep spaces and force text: `"cue 1"` or `'12'`.
 */
function parseArgs(text) {
	const args = []
	const re = /"([^"]*)"|'([^']*)'|(\S+)/g
	let m
	while ((m = re.exec(String(text ?? ''))) !== null) {
		if (m[1] !== undefined) args.push(str(m[1]))
		else if (m[2] !== undefined) args.push(str(m[2]))
		else {
			const word = m[3]
			if (/^[+-]?\d+$/.test(word)) args.push(int(word))
			else if (/^[+-]?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(word)) args.push(float(word))
			else args.push(str(word))
		}
	}
	return args
}

/** A message as one line for a log. */
function describe(message) {
	const args = (message.args ?? []).map((a) => (a.type === 's' ? JSON.stringify(a.value) : String(a.value)))
	return [message.address, ...args].join(' ')
}

module.exports = {
	int,
	float,
	str,
	number,
	encode,
	decode,
	argNumber,
	argText,
	namePart,
	timelinePrefix,
	timeArgs,
	cueArg,
	parseArgs,
	describe,
}
