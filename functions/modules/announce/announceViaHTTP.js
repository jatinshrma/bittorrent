import peerId from "../../lib/peerId.js"
import { getPeers, batchUp, port } from "../../lib/utils.js"
import bencode from "../../modules/bencode.js"

export default async function announceViaHTTP(...args) {
	const url = generateHttpTrackerUrl(...args)
	let response = await fetch(url)
	if (!response.ok) throw new Error(`HTTP request failed with status ${response.status}`)

	response = bencode.decode(await response.text())
	response.peers = getPeers(Buffer.from(response.peers, "binary"))

	return response
}

function generateHttpTrackerUrl(trackerUrl, infoHash, size) {
	const urlEncodedInfoHash = batchUp(infoHash, 2, (i) => "%" + i).join("")
	const query = [
		`info_hash=${urlEncodedInfoHash}`,
		`peer_id=${encodeURIComponent(peerId)}`,
		`port=${encodeURIComponent(port)}`,
		`uploaded=${encodeURIComponent(0)}`,
		`downloaded=${encodeURIComponent(0)}`,
		`left=${encodeURIComponent(size)}`,
		`compact=${encodeURIComponent(1)}`,
	].join("&")

	return trackerUrl + "?" + query
}
