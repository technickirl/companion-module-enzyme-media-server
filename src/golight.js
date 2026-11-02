// What lights a Go button beyond the transport word, as the shell lights
// its own: a flash while clips loop at a section end until Go (half a
// second bright, half dim, every looping button in step), and a moment's
// pale green each time a timeline's Go count rises, whoever pressed it.
// The timers live here, away from Companion, so a test can drive them.

/** Half a second each way for the looping flash. */
export const FLASH_MS = 500
/** How long a Go shows after the count rises. */
export const FIRED_MS = 300

export class GoLight {
	/**
	 * @param {object} options
	 * @param {(what: 'flash' | 'fired') => void} options.onChange called when a button may need redrawing
	 * @param {number} [options.flashMs]
	 * @param {number} [options.firedMs]
	 */
	constructor({ onChange, flashMs = FLASH_MS, firedMs = FIRED_MS }) {
		this.onChange = onChange
		this.flashMs = flashMs
		this.firedMs = firedMs
		this.looping = new Set()
		this.flashOn = false
		this.flashTimer = null
		this.goCounts = new Map()
		this.firedTimers = new Map()
		this.lastTake = undefined
	}

	/** The variable names a timeline's values go by: bare for the master (0), numbered otherwise. */
	static name(n, what) {
		return n === 0 ? what : `timeline_${n}_${what}`
	}

	/** The timeline a changed variable speaks for: 0 for the master, N for timeline N, null for neither. */
	static timelineOf(name) {
		const m = /^(?:timeline_(\d+)_)?(looping|go_count)$/.exec(name)
		return m ? Number(m[1] ?? 0) : null
	}

	/**
	 * Takes the state after a batch of status and the names that changed:
	 * keeps the looping set and the flash timer, and fires a timeline whose
	 * Go count rose (not on its first value).
	 */
	update(state, changed) {
		for (const name of changed) {
			// A take landing (its time moves) fires under the key 'take', as
			// a Go does under its timeline's: not on the first value heard.
			if (name === 'take_time') {
				const before = this.lastTake
				this.lastTake = state.get(name)
				if (before !== undefined && this.lastTake !== before) this.fire('take')
				continue
			}
			const n = GoLight.timelineOf(name)
			if (n === null) continue
			const value = state.get(name)
			if (name.endsWith('go_count')) {
				const before = this.goCounts.get(n)
				this.goCounts.set(n, value)
				if (before !== undefined && typeof value === 'number' && value > before) this.fire(n)
			} else if (value === 1) {
				this.looping.add(n)
			} else {
				this.looping.delete(n)
			}
		}
		if (this.looping.size > 0 && !this.flashTimer) {
			this.flashOn = true
			this.flashTimer = setInterval(() => {
				this.flashOn = !this.flashOn
				this.onChange('flash')
			}, this.flashMs)
			this.onChange('flash')
		} else if (this.looping.size === 0 && this.flashTimer) {
			this.stopFlash()
			this.onChange('flash')
		}
	}

	fire(n) {
		const had = this.firedTimers.get(n)
		if (had) clearTimeout(had)
		this.firedTimers.set(
			n,
			setTimeout(() => {
				this.firedTimers.delete(n)
				this.onChange('fired')
			}, this.firedMs),
		)
		this.onChange('fired')
	}

	/** Whether a timeline's looping flash is bright now; false when it is not looping. */
	flashing(n) {
		return this.looping.has(n) && this.flashOn
	}

	/** Whether a timeline's Go fired within the last moment. */
	fired(n) {
		return this.firedTimers.has(n)
	}

	stopFlash() {
		if (this.flashTimer) {
			clearInterval(this.flashTimer)
			this.flashTimer = null
		}
		this.flashOn = false
	}

	/** Clears every timer, as on destroy; forgets nothing else. */
	stop() {
		this.stopFlash()
		for (const t of this.firedTimers.values()) clearTimeout(t)
		this.firedTimers.clear()
	}

	/** Forgets the counts and the last take too, as when the engine changes. */
	reset() {
		this.stop()
		this.looping.clear()
		this.goCounts.clear()
		this.lastTake = undefined
	}
}
