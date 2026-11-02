// Takes, for film work (experimental): a take records every timeline in
// takes whole, with the region looks and a manual recall, as one file beside
// the show, and can be put back whole or in part. The engine takes `/take`,
// `/take/restore` and `/take/regions`, and reports the last take as
// `/status/take/last` with its slate and time. This file holds what the
// module works out for itself: the slate the engine would offer next.

/**
 * The slate after `last`, as the engine's Take prompt offers it: the
 * trailing number plus one ("42A-3" gives "42A-4", "Take 7" gives "Take 8",
 * leading noughts kept, so "007" gives "008"), "1" after nothing, and
 * "<last> 2" after a slate with no number.
 */
function nextSlate(last) {
	const text = String(last ?? '').trim()
	if (text === '') return '1'
	const m = /^(.*?)(\d+)$/.exec(text)
	if (!m) return `${text} 2`
	const [, head, number] = m
	// Past what a number can count exactly, the engine refuses too and names it "<last> 2".
	if (number.length > 15) return `${text} 2`
	const next = String(Number(number) + 1)
	return `${head}${next.padStart(number.length, '0')}`
}

/** Two slates as the same take: trimmed, case and spacing aside. */
function sameSlate(a, b) {
	const norm = (s) =>
		String(s ?? '')
			.trim()
			.toLowerCase()
			.replace(/[\s\-_]+/g, ' ')
	const x = norm(a)
	const y = norm(b)
	return x !== '' && x === y
}

export { nextSlate, sameSlate }
