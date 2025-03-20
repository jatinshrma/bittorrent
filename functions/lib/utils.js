import * as fs from "fs"
export const port = 6881

export function throttle(func, limit) {
	let inThrottle
	return (...args) => {
		if (!inThrottle) {
			func(...args)
			inThrottle = true
			setTimeout(() => (inThrottle = false), limit)
		}
	}
}

export function batchUp(iterable, groupSize, handler) {
	let groups = []
	for (let i = 0; i < iterable.length; i += groupSize) {
		const slice = iterable.slice(i, i + groupSize)
		groups.push(typeof handler === "function" ? handler(slice, i / groupSize) : slice)
	}
	return groups
}

export function createDir(path) {
	const dir = path.split("/").slice(0, -1).join("/")
	fs.mkdirSync(dir, { recursive: true })
	return path
}

export function getPeers(addresses) {
	return batchUp(addresses, 6, (address) => ({
		ip: address.slice(0, 4).join("."),
		port: address.readUInt16BE?.(4) || address.readUInt8?.(4),
	}))
}

export function sleep(ms) {
	return new Promise((res) => setTimeout(res), ms)
}

export function createPreAllocatedFile(filePath, size) {
	if (fs.existsSync(filePath)) return
	const fd = fs.openSync(filePath, "w")
	fs.ftruncateSync(fd, size)
	fs.closeSync(fd)
}

export function getState(pieceLength, pieceCount, getPieceSize) {
	const blockSizes = [
		constants.blockSize,
		pieceLength % constants.blockSize,
		getPieceSize(pieceCount - 1) % constants.blockSize,
	]
	return {
		waitingState: "handshake",
		assignedIndexes: [],
		choked: {
			size: 0,
			messageId: 0,
			status: true,
			timeout: 30,
			negetive: true,
		},
		handshake: {
			received: Buffer.alloc(0),
			size: 68,
			remainingSize: 68,
			timeout: 10,
		},
		bitfield: {
			received: null,
			size: Math.ceil(pieceCount / 8),
			messageId: 5,
			timeout: 15,
		},
		unchoked: {
			size: 0,
			messageId: 1,
			timeout: 15,
		},
		piece: {
			received: null,
			getSize: (i) => blockSizes.includes(i - 8),
			messageId: 7,
			timeout: 20,
		},
	}
}

export const constants = {
	blockSize: Math.pow(2, 14),
	maxDownloadIndexes: 5,
}
