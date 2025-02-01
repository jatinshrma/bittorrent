import { Socket } from "net"
import peerId from "./peerId.js"
const client = new Socket()

function parseHandshake(response) {
	if (response.length !== 68)
		throw new Error(`Invalid handshake length: Expected 68, got ${response.length}`)

	const protocolLength = response.readUInt8(0)
	if (protocolLength !== 19) throw new Error(`Unexpected protocol length: ${protocolLength}`)

	const protocol = response.slice(1, 20).toString()
	const reserved = response.slice(20, 28)
	const infoHash = response.slice(28, 48).toString("hex")
	const peerId = response.slice(48, 68).toString("utf8")

	return {
		protocolLength,
		protocol,
		reserved,
		infoHash,
		peerId
	}
}

export default function handshake({ address, infoHash }) {
	const message = Buffer.concat([
		Buffer.from([19]),
		Buffer.from("BitTorrent protocol"),
		Buffer.alloc(8, 0),
		Buffer.from(infoHash, "hex"),
		Buffer.from(peerId)
	])

	let step = 0

	return new Promise(res => {
		client.once("connectionAttempt", (...args) => console.log(...args, "connecting..."))
		client.once("error", function (err) {
			client.removeAllListeners()
			console.error("Connection error: " + err)
			res({ error: err })
		})
		client.once("connect", () => {
			console.log("connected to " + address.ip)
			client.on("data", data => {
				console.log({ step })
				if (step === 0) {
					const parsedData = parseHandshake(data)
					console.log("Handshake response received!", parsedData)
				} else if (step === 1) {
					console.log("bitfield response hex:", step.toString("hex"))
					console.log(data.toJSON()?.data)
				}
				step++
			})
			client.write(message)
		})
		client.connect({ host: address.ip, port: parseInt(address.port) })
	})
}
