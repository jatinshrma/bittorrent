import peerId from "../peerId.js"
import announceViaUDP from "./announceViaUDP.js"
import { getPeers, group, port } from "../utils.js"
import bencode from "../bencode.js"

export default function announceToTracker(...args) {
	const parsedUrl = new URL(args[0])

	if (parsedUrl.protocol === "udp:") return announceViaUDP(...args)
	else if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:")
		return announceViaHTTP(generateHttpTrackerUrl(...args))
	else throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`)
}

function generateHttpTrackerUrl(trackerUrl, infoHash, size) {
	const urlEncodedInfoHash = group(infoHash, 2, i => "%" + i).join("")
	const query = [
		`info_hash=${urlEncodedInfoHash}`,
		`peer_id=${encodeURIComponent(peerId)}`,
		`port=${encodeURIComponent(port)}`,
		`uploaded=${encodeURIComponent(0)}`,
		`downloaded=${encodeURIComponent(0)}`,
		`left=${encodeURIComponent(size)}`,
		`compact=${encodeURIComponent(1)}`
	].join("&")

	return trackerUrl + "?" + query
}

async function announceViaHTTP(url) {
	let response = await fetch(url)
	if (!response.ok) throw new Error(`HTTP request failed with status ${response.status}`)

	response = bencode.decode(await response.text())
	response.peers = getPeers(Buffer.from(response.peers, "binary"))

	return response
}
