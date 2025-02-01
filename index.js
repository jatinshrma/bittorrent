import { readFileSync } from "fs"
import { createHash } from "crypto"
import bencode from "./lib/bencode.js"
import announceToTracker from "./lib/announce/announceToTracker.js"
import { group } from "./lib/utils.js"
import handshake from "./lib/handshake.js"

const buf = Uint8Array.prototype.slice.call(readFileSync("ipfire.torrent"))

async function main() {
	const torrent = bencode.decode(buf)
	const infoHash = createHash("sha1").update(bencode.encode(torrent.info)).digest("hex")
	const size = torrent.info.files
		? torrent.info.files.map(file => file.length).reduce((a, b) => a + b)
		: torrent.info.length

	const pieceHashes = group(torrent.info.pieces, 20, p => p.toString("hex"))
	const announceResponse = await announceToTracker(torrent.announce.toString(), infoHash, size)

	console.log("Announce response:", announceResponse)

	for (const address of announceResponse.peers) {
		try {
			const response = await handshake({ address, infoHash })
			if (!response?.error) console.log(response)
			// else console.error(response.error)
		} catch (error) {
			console.log(error)
		}
	}

	// const details = {
	// 	trackerURL: decodedTorrent.announce.toString(),
	// 	length: decodedTorrent.info.length,
	// 	infoHash: infoHash,
	// 	pieceLength: decodedTorrent.info["piece length"],
	// 	pieceHashes,
	// 	...announceResponse
	// }

	// console.log(details)
}

main()
