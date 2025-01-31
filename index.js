require("./lib/peerId")
const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const bencode = require("./lib/bencode")
const announceToPeers = require("./lib/announce")
const handshake = require("./lib/handshake")

const buf = Uint8Array.prototype.slice.call(fs.readFileSync(path.join(__dirname, "ipfire.torrent")))

async function main() {
	const decodedTorrent = bencode.decode(buf)
	const infoHash = crypto.createHash("sha1").update(bencode.encode(decodedTorrent.info)).digest("hex")

	let urlEncodedInfoHash = ""
	for (let i = 0; i < infoHash.length; i += 2) urlEncodedInfoHash += `%${infoHash.slice(i, i + 2)}`

	const pieceHashes = []

	for (let index = 0; index < decodedTorrent.info.pieces.length; index += 20)
		pieceHashes.push(decodedTorrent.info.pieces.slice(index, index + 20).toString("hex"))

	const announceResponse = await announceToPeers({
		trackerURL: decodedTorrent.announce,
		urlEncodedInfoHash,
		length: decodedTorrent.info.length
	})

	const details = {
		trackerURL: decodedTorrent.announce.toString(),
		length: decodedTorrent.info.length,
		infoHash: infoHash,
		pieceLength: decodedTorrent.info["piece length"],
		pieceHashes,
		...announceResponse
	}

	for (const address of announceResponse.peerIPs.slice(3, 6)) {
		const response = await handshake({ address, urlEncodedInfoHash })
		if (!response?.error) console.log(response)
	}

	console.log(details)
}

main()
