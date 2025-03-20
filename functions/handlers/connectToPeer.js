import { Socket } from "net"
import dataHandler from "./dataHandler.js"
import { buildHandshake } from "./helpers.js"

export default function connectToPeer({
	peer,
	infoHash,
	handshake = true,
	state,
	...params
} = {}) {
	return new Promise((res, rej) => {
		const socket = new Socket()
		socket.setTimeout(3000)

		function closeConnection (data, success) {
			socket.end(() => {
				socket?.removeAllListeners()?.destroy()
				if (success) res(data)
				else rej(data)
			})
		}

		socket.on("connectionAttemptFailed", () => rej("Could not connect"))
		socket.on("close", () => rej("Socket closed"))
		socket.on("connectionAttempt", (...args) => console.log(...args, "connecting..."))
		socket.on("error", (err) => closeConnection(err.message))
		socket.on("connect", () => {
			console.log("connected to " + peer.ip)
			if (!handshake) return closeConnection(peer, true)
			let timer = setTimeout(() => {
				closeConnection("No data received")
			}, 5000)

			socket.on("data", (data) => {
				if (timer) {
					clearTimeout(timer)
					timer = null
				}

				dataHandler(data, state, closeConnection, socket, params)
			})

			socket.write(buildHandshake(infoHash))
		})
		socket.connect({ host: peer.ip, port: parseInt(peer.port) })
	})
}
