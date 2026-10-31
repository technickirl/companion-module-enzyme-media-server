// Shared bits for the tests: waiting on a condition, and a decoder that
// returns what the osc library would hand the link.

const { decode } = require('../src/osc')

/** Resolves once `condition()` is true, polling; rejects after `timeout` ms. */
function waitFor(condition, timeout = 3000, what = 'condition') {
	const started = Date.now()
	return new Promise((resolve, reject) => {
		const poll = () => {
			let value
			try {
				value = condition()
			} catch (err) {
				reject(err)
				return
			}
			if (value) resolve(value)
			else if (Date.now() - started > timeout) reject(new Error(`timed out waiting for ${what}`))
			else setTimeout(poll, 10)
		}
		poll()
	})
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Encodes then decodes, as the wire would. */
function roundTrip(message) {
	const { encode } = require('../src/osc')
	return decode(encode(message))[0]
}

module.exports = { waitFor, sleep, roundTrip }
