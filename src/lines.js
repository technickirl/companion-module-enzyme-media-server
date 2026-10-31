// Lines from a stream of chunks: the control socket sends one JSON object a
// line, and a line (the whole show, the whole status) can run to hundreds
// of kilobytes across many chunks.

export class LineSplitter {
	constructor() {
		this.chunks = []
		this.length = 0
	}

	/** Takes a chunk and gives the complete lines in it, without their newline. */
	push(chunk) {
		const lines = []
		let start = 0
		let at = chunk.indexOf(10)
		while (at >= 0) {
			const piece = chunk.subarray(start, at)
			if (this.length > 0) {
				this.chunks.push(piece)
				lines.push(Buffer.concat(this.chunks, this.length + piece.length).toString('utf8'))
				this.chunks = []
				this.length = 0
			} else {
				lines.push(piece.toString('utf8'))
			}
			start = at + 1
			at = chunk.indexOf(10, start)
		}
		if (start < chunk.length) {
			const rest = chunk.subarray(start)
			this.chunks.push(rest)
			this.length += rest.length
		}
		return lines
	}

	/** What is held of a line not yet ended, in bytes. */
	get pending() {
		return this.length
	}
}
