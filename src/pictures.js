// Pictures for buttons: the engine's JPEGs, base64, kept as data URIs that
// a value feedback hands to Companion's image element (or a variable
// holds) with no conversion. The latest string per picture is kept, so a
// recheck without a new picture gives the same string back.

const PREFIX = 'data:image/jpeg;base64,'

/** A base64 JPEG as the data URI an image element takes. */
export function dataUri(jpegBase64) {
	if (typeof jpegBase64 !== 'string' || jpegBase64 === '') return null
	return `${PREFIX}${jpegBase64}`
}

export class PictureStore {
	constructor({ limit = 512 } = {}) {
		this.limit = limit
		this.pictures = new Map()
	}

	/** Stores a picture by key; true when it is new or changed. */
	set(key, jpegBase64) {
		const uri = dataUri(jpegBase64)
		if (uri === null) return this.delete(key)
		const had = this.pictures.get(key)
		if (had === uri) return false
		if (had !== undefined) this.pictures.delete(key)
		this.pictures.set(key, uri)
		while (this.pictures.size > this.limit) {
			const oldest = this.pictures.keys().next().value
			this.pictures.delete(oldest)
		}
		return true
	}

	/** The data URI held for a key, or null. */
	get(key) {
		return this.pictures.get(key) ?? null
	}

	has(key) {
		return this.pictures.has(key)
	}

	delete(key) {
		return this.pictures.delete(key)
	}

	clear() {
		this.pictures.clear()
	}

	get size() {
		return this.pictures.size
	}
}
