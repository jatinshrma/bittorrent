import dgram from "dgram"
import * as crypto from "crypto"
import peerId from "../../lib/peerId.js"
import { getPeers, port } from "../../lib/utils.js"

export default function announceViaUDP(rawUrl, infoHash, size) {
	return new Promise(resolve => {
		const socket = dgram.createSocket("udp4")

		socket.bind(port, "0.0.0.0", () => {
			console.log(`Socket bound to ${socket.address().address}:${socket.address().port}`)
		})
		socket.on("error", console.error)
		socket.on("close", () => console.log("Socket closed"))
		socket.on("message", (response, rinfo) => {
			if (respType(response) === "connect") {
				const connResp = parseConnResp(response)
				const announceReq = buildAnnounceReq(connResp.connectionId, infoHash, size)
				udpSend(socket, announceReq, rawUrl)
			} else if (respType(response) === "announce") {
				const announceResp = parseAnnounceResp(response)
				resolve(announceResp)
			}
		})

		udpSend(socket, buildConnReq(), rawUrl)
	})
}

function udpSend(socket, message, rawUrl) {
	const url = new URL(rawUrl)
	socket.send(message, 0, message.length, url.port, url.hostname, (err, bytesLength) => {
		if (err) console.error("Error sending message:", err)
	})
}

function respType(resp) {
	const action = resp.readUInt32BE(0)
	if (action === 0) return "connect"
	if (action === 1) return "announce"
	throw new Error("Invalid action type:" + action)
}

function buildConnReq() {
	const buf = Buffer.alloc(16)
	buf.writeBigUInt64BE(0x41727101980n, 0) // connection id
	buf.writeUInt32BE(0, 8) // action
	crypto.randomBytes(4).copy(buf, 12) // transaction id
	return buf
}

function parseConnResp(resp) {
	return {
		action: resp.readUInt32BE(0),
		transactionId: resp.readUInt32BE(4),
		connectionId: resp.readBigUInt64BE(8)
	}
}

function buildAnnounceReq(connectionId, infoHash, size) {
	const buf = Buffer.alloc(98)
	buf.writeBigUInt64BE(connectionId, 0) // connection_id
	buf.writeUInt32BE(1, 8) // action
	crypto.randomBytes(4).copy(buf, 12) // transaction_id
	buf.write(infoHash, 16, "hex") // info_hash
	buf.write(peerId, 36) // peer_id
	buf.writeBigUInt64BE(0n, 56) // downloaded
	buf.writeBigUInt64BE(BigInt(size), 64) // left
	buf.writeBigUInt64BE(0n, 72) // uploaded
	buf.writeUInt32BE(0, 80) // event
	buf.writeUInt32BE(0, 84) // IP
	crypto.randomBytes(4).copy(buf, 88) // key
	buf.writeInt32BE(-1, 92) // num_want
	buf.writeUint16BE(port, 96) // port

	return buf
}

function parseAnnounceResp(resp) {
	const parsedResp = {
		action: resp.readUInt32BE(0),
		transaction_id: resp.readUInt32BE(4),
		interval: resp.readUInt32BE(8),
		leechers: resp.readUInt32BE(12),
		seeders: resp.readUInt32BE(16),
		peers: getPeers(resp.slice(20))
	}

	return parsedResp
}
