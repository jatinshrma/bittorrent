import { Socket } from "net"
import peerId from "./peerId.js"
import { constants, sleep } from "./utils.js"
import * as fs from "fs"

/**
 * @param {Buffer} data
 * @param {Socket} socket
 */
export default async function download(data, state, end, socket, params) {
	try {
		let stateKey
		while (data.length > 4) {
			if (state.waitingState === null) {
				const messageId = data.at(4)
				const size = data.readUInt32BE(0) - 1

				if (size === -1 && data.length === 4) return console.log("received: keep alive")

				data = data.subarray(5)
				stateKey = Object.keys(state).find(
					key =>
						state[key] &&
						typeof state[key] === "object" &&
						state[key].messageId === messageId &&
						(state[key].getSize?.(size) || state[key].size === size)
				)

				if (!stateKey || !state[stateKey]) {
					fs.appendFileSync("output.txt", data.toString("hex"));
					return console.log("No state found for: "+JSON.stringify({stateKey,messageId,size,length:data.length}))
				}
				else if (state[stateKey].size === 0) {
					if (state[stateKey].status === true) return
					if (stateKey === "unchoked") state.choked.status = false
					else state.unchoked.status = false
					state[stateKey].status = true
				} else {
					state[stateKey].received = data.subarray(0, size)
					state[stateKey].size = size
					data = data.subarray(size)
				}
			} else {
				stateKey = state.waitingState
				const remainingLength = state[stateKey].size - state[stateKey].received.length

				state[stateKey].received = Buffer.concat([
					state[stateKey].received,
					data.subarray(0, remainingLength)
				])

				data = data.subarray(remainingLength)
			}

			if (state[stateKey].size && state[stateKey].received.length < state[stateKey].size) {
				state.waitingState = stateKey
				return
			} else if (stateKey === "bitfield" && data.length === 0) sendInterested(socket, state)

			// console.log(`${state[stateKey].negetive ? "❌" : "✅"} ${stateKey}`)
			state.waitingState = null

			params.state = state
			const result = await onResp(
				stateKey,
				state[stateKey].received,
				socket,
				params,
				Boolean(state.unchoked.status),
				end
			)
			if (result) state[stateKey].received = result
		}

		clearTimeout(state.timerId)
		state.timerId = setTimeout(() => end("Timeout"), (state[stateKey]?.timeout || 10) * 1000)
		
		clearTimeout(state.timerId1)
		state.timerId1 = setTimeout(() => {
			socket.write(Buffer.alloc(4));
			console.log("Sent keep-alive");
		}, 25*1000)
	} catch (error) {
		console.error(error?.stack)
		end(error.message)
	}
}

function sendInterested(socket, state) {
	console.log("✅ interested")
	socket.write(Buffer.from([0, 0, 0, 2]))
	state.interested = true
}

export function buildHandshake(infoHash) {
	const buf = Buffer.alloc(68)
	buf.writeInt8(19, 0)
	buf.write("BitTorrent protocol", 1)
	Buffer.alloc(8, 0).copy(buf, 20)
	buf.write(infoHash, 28, "hex")
	buf.write(peerId, 48)
	return buf
}

function onHandshakeResp(data) {
	const protocolLength = data.readUInt8(0)
	if (protocolLength !== 19) throw new Error(`Unexpected protocol length: ${protocolLength}`)

	return {
		protocolLength,
		protocol: data.slice(1, 20).toString(),
		reserved: data.slice(20, 28),
		infoHash: data.slice(28, 48).toString("hex"),
		peerId: data.slice(48, 68).toString("utf8")
	}
}

async function onBitfieldResp(data, socket, { state, getIndexes }) {
	const bitfield = Array.from(data)
		.map(byte => byte.toString(2).padEnd(8, "0"))
		.join("")
		.split("")

	if (!bitfield?.includes("1")) throw new Error("No piece available")

	const indexes = await getIndexes(bitfield)
	if (!indexes.length) {
		/*
			put the peer on hold.
		*/
		return
	}

	state.indexes = indexes
}

function onUnchokeResp(data, socket, params) {
	const { getPieceSize, state } = params
	if (!state.unchoked.status) return

	for (let pIdx = 0; pIdx < state.bitfield.received.length; pIdx++) {
		if (
			state.piece.pieces[pIdx]?.size &&
			state.piece.pieces[pIdx]?.size === state.piece.pieces[pIdx]?.receivedSize
		) continue

		const pieceSize = getPieceSize(pIdx)
		
		console.log("sending: piece request for", { pieceIndex: pIdx })

		for (let bIdx = 0; bIdx < pieceSize / constants.blockSize; bIdx++) {
			const blockOffset = bIdx * constants.blockSize
			if (state.piece.pieces[pIdx]?.[blockOffset] !== undefined) continue

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

function onPieceResp(data, socket, params) {
	const { getPieceSize, pieceCount, state } = params
	const index = data.readUInt32BE(0)
	const offset = data.readUInt32BE(4)
	const block = data.subarray(8)
	state.piece.receivedBlocks=state.piece.receivedBlocks+1;

	console.log("Piece resp:", { index, offset, blockLength: block.length })

	if (!state.piece.pieces[index])
		state.piece.pieces[index] = {
			size: getPieceSize(index),
			receivedSize: 0
		}

	state.piece.pieces[index][offset] = block
	state.piece.pieces[index].receivedSize += block.length

	if (state.piece.pieces[index].receivedSize === state.piece.pieces[index].size) {
		console.log(`⌛ Downloaded ${
			((state.piece.receivedBlocks*100)/(pieceCount*constants.blockSize)).toFixed(2)
		}%`)
	}
}

function onResp(type, ...args) {
	switch (type) {
		case "handshake":
			return onHandshakeResp(...args)
		case "bitfield":
			return onBitfieldResp(...args)
		case "unchoked":
			return onUnchokeResp(...args)
		case "piece":
			return onPieceResp(...args)
		default:
			break
	}
}
