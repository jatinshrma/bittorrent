export const port = 6881

export function batchUp(iterable, groupSize, handler) {
	let groups = []
	for (let i = 0; i < iterable.length; i += groupSize) {
		const slice = iterable.slice(i, i + groupSize)
		groups.push(typeof handler === "function" ? handler(slice, i / groupSize) : slice)
	}
	return groups
}

export function getPeers(addresses) {
	return batchUp(addresses, 6, address => ({
		ip: address.slice(0, 4).join("."),
		port: address.readUInt16BE?.(4) || address.readUInt8?.(4)
	}))
}

export function sleep(ms) {
	return new Promise(res => setTimeout(res), ms)
}

export function getState(pieceLength,pieceCount) {
	const pieceSizes = [constants.blockSize, pieceLength % constants.blockSize]
	return {
		waitingState: "handshake",
		choked: {
			size: 0,
			messageId: 0,
			status: true,
			timeout: 30,
			negetive: true
		},
		handshake: {
			received: Buffer.alloc(0),
			size: 68,
			timeout: 10
		},
		bitfield: {
			received: null,
			size: Math.ceil(pieceCount / 8),
			messageId: 5,
			timeout: 15
		},
		unchoked: {
			size: 0,
			messageId: 1,
			timeout: 45
		},
		piece: {
			received: null,
			getSize: i => pieceSizes.includes(i - 8),
			messageId: 7,
			timeout: 100
		},
	}
}

export const constants = {
	blockSize: Math.pow(2,14),
	maxDownloadIndexes: 5
}