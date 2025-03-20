import { Socket } from "net"
import helpers from "./helpers.js"

/**
 * @param {Buffer} data
 * @param {Socket} socket
 */
export default async function dataHandler(data, state, closeConnection, socket, params) {
	let stateKey

	while (data.length > 0 && (data.length > 4 || state.waitingState !== null)) {
		if (state.waitingState === null) {
			const messageId = data.at(4)
			const size = data.readUInt32BE(0) - 1

			if (size === -1 && data.length === 4) return console.log("received: keep alive")

			data = data.subarray(5)
			stateKey = Object.keys(state).find(
				(key) =>
					state[key] &&
					typeof state[key] === "object" &&
					state[key].messageId === messageId &&
					(state[key].getSize?.(size) || state[key].size === size)
			)

			if (!stateKey || !state[stateKey]) {
				return closeConnection(
					"No state found for: " +
					JSON.stringify({ stateKey, messageId, size, length: data.length })
				)
			} else if (state[stateKey].size === 0) {
				if (state[stateKey].status === true) return

				if (stateKey === "unchoked") {
					state.choked.status = false
					if (state.unchoked.interestedTimer)
						clearTimeout(state.unchoked.interestedTimer)
				} else state.unchoked.status = false

				state[stateKey].status = true
			} else {
				state[stateKey].received = data.subarray(0, size)
				state[stateKey].size = size
				state[stateKey].remainingSize = size - state[stateKey].received.length
				data = data.subarray(size)

				if (state[stateKey].remainingSize) state.waitingState = stateKey
			}
		} else {
			stateKey = state.waitingState

			state[stateKey].received = Buffer.concat([
				state[stateKey].received,
				data.subarray(0, state[stateKey].remainingSize),
			])

			data = data.subarray(state[stateKey].remainingSize)

			state[stateKey].remainingSize = state[stateKey].size - state[stateKey].received.length

			if (state[stateKey].remainingSize === 0) state.waitingState = null
		}

		if (!state[stateKey].remainingSize) {
			// console.log(`${state[stateKey].negetive ? "❌" : "✅"} ${stateKey}`)

			if (stateKey === "bitfield" && data.length === 0)
				state.unchoked.interestedTimer = setTimeout(() => {
					sendInterested(socket, state)
					state.unchoked.interestedTimer = null
				}, 3000)

			const result = await helpers(
				stateKey,
				{
					data:state[stateKey].received,
					socket,
					params: {...params, state},
					unchoked: Boolean(state.unchoked.status),
					closeConnection
				}
			)

			if (result) state[stateKey].received = result
		}
	}

	setTimer(state, stateKey, closeConnection)

	clearTimeout(state.timerId1)

	if (state.waitingState === "piece")
		state.timerId1 = setTimeout(() => {
			socket.write(Buffer.alloc(4));
			console.log("Sent keep-alive");
			setTimer(state, stateKey, closeConnection)
		}, 25*1000)
}

function setTimer(state, stateKey, closeConnection) {
	clearTimeout(state.timerId)
	const time = +state[stateKey]?.timeout || 10

	state.timerId = setTimeout(() => {
		console.log(`TIMER EXPIRED FOR ID: ${time}`)
		closeConnection("Timeout")
	}, time * 1000)
}

function sendInterested(socket, state) {
	console.log("✅ interested")
	socket.write(Buffer.from([0, 0, 0, 2]))
	state.interested = true
}
