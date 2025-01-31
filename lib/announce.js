const bencode = require("./bencode")
const peerId = require("./peerId")

module.exports = async function announceToPeers({ trackerURL, urlEncodedInfoHash, length }) {
	const url =
		trackerURL +
		"?" +
		[
			`info_hash=${urlEncodedInfoHash}`,
			`peer_id=${encodeURIComponent(peerId)}`,
			`port=${encodeURIComponent(6881)}`,
			`uploaded=${encodeURIComponent(0)}`,
			`downloaded=${encodeURIComponent(0)}`,
			`left=${encodeURIComponent(length)}`,
			`compact=${encodeURIComponent(1)}`
		].join("&")

	let response = await fetch(url)
	response = bencode.decode(await response.text())

	const data = Buffer.from(response.peers, "binary").toJSON().data
	const peerIPs = []

	for (let i = 0; i < data.length; i += 6) {
		const addressStr = data.slice(i, i + 4).join(".")
		const port = parseInt(
			data
				.slice(i + 4, i + 6)
				.map(j => j.toString(16))
				.join(""),
			16
		)
		peerIPs.push(addressStr + ":" + port)
	}

	return {
		peerIPs,
		interval: response.interval
	}
}
