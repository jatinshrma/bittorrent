import { Socket } from "net"
import download, { buildHandshake } from "./download.js"

export default function connectPeer({ peer, infoHash, handshake = true, state, ...params } = {}) {
	return new Promise((res, rej) => {
		const socket = new Socket()
		socket.setTimeout(3000)

		const end = (data, success) => socket.end(() => {
			socket.removeAllListeners().destroy()
			if (success) res(data)
			else rej(data)
		})

		socket.on("close", () => rej("Socket closed"))
		socket.on("connectionAttempt", (...args) => console.log(...args, "connecting..."))
		socket.on("error", err => end(err.message))
		socket.on("connect", () => {
			console.log("connected to " + peer.ip)
			if (!handshake) return end(peer, true)
			socket.on("data", data => download(data, state, end, socket, params))
			socket.write(buildHandshake(infoHash))
		})
		socket.connect({ host: peer.ip, port: parseInt(peer.port) })
	})
}
