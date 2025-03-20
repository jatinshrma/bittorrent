import peerId from "../lib/peerId.js"
import { constants } from "../lib/utils.js"

export function buildHandshake(infoHash) {
	const buf = Buffer.alloc(68)
	buf.writeInt8(19, 0)
	buf.write("BitTorrent protocol", 1)
	Buffer.alloc(8, 0).copy(buf, 20)
	buf.write(infoHash, 28, "hex")
	buf.write(peerId, 48)
	return buf
}

function sendPieceRequests (socket, { state, getPieceSize, pieceTrack }) {
	for (const pIdx of state.assignedIndexes) {
		if (
			pIdx === null ||
			state.piece.requested?.includes(pIdx) ||
			(pieceTrack[pIdx]?.size && pieceTrack[pIdx]?.size === pieceTrack[pIdx]?.receivedSize)
		)
			continue

		if (!state.piece.requested) state.piece.requested = [pIdx]
		else state.piece.requested.push(pIdx)

		const pieceSize = getPieceSize(pIdx)

		// console.log("sending: piece request for", { pieceIndex: pIdx })

		for (let bIdx = 0; bIdx < pieceSize / constants.blockSize; bIdx++) {
			const blockOffset = bIdx * constants.blockSize
			if (pieceTrack[pIdx]?.receivedBlocks?.[blockOffset] !== undefined) continue

			const length = Math.min(pieceSize - blockOffset, constants.blockSize)
			const buf = Buffer.alloc(17)
			buf.writeUInt32BE(13, 0)
			buf.writeInt8(6, 4)
			buf.writeUInt32BE(pIdx, 5)
			buf.writeUInt32BE(blockOffset, 9)
			buf.writeUInt32BE(length, 13)

			socket.write(buf)
		}
	}
}

function onHandshakeResp({ data }) {
	const protocolLength = data.readUInt8(0)
	if (protocolLength !== 19) throw new Error(`Unexpected protocol length: ${protocolLength}`)

	return {
		protocolLength,
		protocol: data.slice(1, 20).toString(),
		reserved: data.slice(20, 28),
		infoHash: data.slice(28, 48).toString("hex"),
		peerId: data.slice(48, 68).toString("utf8"),
	}
}

async function onBitfieldResp({ data, params, closeConnection }) {
	const { state, getIndexes } = params
	const bitfield = Array.from(data)
		.map((byte) => byte.toString(2).padEnd(8, "0"))
		.join("")
		.split("")

	if (!bitfield?.includes("1")) return closeConnection("No piece available")

	const indexes = await getIndexes(bitfield)

	if (!indexes.filter((i) => typeof i === "number").length)
		closeConnection("No indexes available at the moment.")

	state.assignedIndexes = indexes
	return bitfield
}

function onUnchokeResp({ socket, params }) {
	if (!params.state.unchoked.status) return
	sendPieceRequests(socket, params)
}

function onPieceResp({ data, socket, params, closeConnection }) {
	const { getPieceSize, state, writeToFile, pieceTrack, getIndexes } = params
	const index = data.readUInt32BE(0)
	const offset = data.readUInt32BE(4)
	const block = data.subarray(8)

	// console.log("Piece resp:", { index, offset, blockLength: block.length })

	if (!pieceTrack[index]) {
		const size = getPieceSize(index)
		pieceTrack[index] = {
			size,
			receivedSize: 0,
			receivedBlocks: {
				// [offset] : <size>
			},
		}
	}

	if (pieceTrack[index].receivedBlocks[offset] === undefined) {
		pieceTrack[index].receivedSize += block.length
		pieceTrack[index].receivedBlocks[offset] = block.length
	} else {
		console.error(`Block at offset ${offset} is already received.`)
		return
	}

	const complition = +((pieceTrack[index].receivedSize * 100) / pieceTrack[index].size).toFixed(2)

	if (complition === 100) {
		const indexIdx = state.assignedIndexes.indexOf(index)
		state.assignedIndexes[indexIdx] = null

		const remainingIdxs = state.assignedIndexes.filter((i) => typeof i === "number")

		if (!remainingIdxs?.length) {
			getIndexes(state.bitfield.received)
				.then((indexes) => {
					if (!indexes.filter((i) => typeof i === "number").length)
						closeConnection("No indexes available at the moment.")

					state.assignedIndexes = indexes
					sendPieceRequests(socket, params)
				})
				.catch((error) => {
					closeConnection("Error occurred when requesting indexes: " + error.message)
				})
		}
	}

	writeToFile(block, index, offset, complition)
}

export default function respHandler(type, args) {
	switch (type) {
		case "handshake":
			return onHandshakeResp(args)
		case "bitfield":
			return onBitfieldResp(args)
		case "unchoked":
			return onUnchokeResp(args)
		case "piece":
			return onPieceResp(args)
		default:
			break
	}
}
