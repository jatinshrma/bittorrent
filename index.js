import * as fs from "fs"
import { createHash } from "crypto"
import bencode from "./lib/bencode.js"
import { batchUp, constants, getState } from "./lib/utils.js"
import connectPeer from "./lib/connectPeer.js"
import announceToTracker from "./lib/announce/announceToTracker.js"
import findActiveSeeders from "./lib/findActiveSeeders.js"
import createJobRunner from "./lib/createJobRunner.js"

const buf = fs.readFileSync("1929495.torrent")

async function main() {
	const torrent = bencode.decode(buf)
	const infoHash = createHash("sha1").update(bencode.encode(torrent.info)).digest("hex")
	const size = torrent.info.files
		? torrent.info.files.map(file => file.length).reduce((a, b) => a + b)
		: torrent.info.length

	const pieceHashes = batchUp(torrent.info.pieces, 20, p => p.toString("hex"))
	const pieceCount = pieceHashes.length
	const pieceLength = torrent.info["piece length"]
	const lastPieceLength = size % pieceLength

	console.log("Pieces count:", torrent.info.pieces.length, "Size(MB):", (size / (1024 * 1024)).toFixed(2))
	
	let downloadPercent = 0
	let allPieces = {
		/**
			[index]: {
				size: Number
				receivedSize: Number
				[offset]: <Buffer ...>
			}
		*/
	}
			
	const filePath = `${torrent.info.name}-${parseInt(Date.now()/1000)}.nttf`
	const indexesLib = Array(pieceHashes.length).fill(false)
	const unprocessedBitfields = []

	const getPieceSize = i => i === pieceCount - 1 ? lastPieceLength : pieceLength
	const getIndexes = createJobRunner(indexesLib, unprocessedBitfields)

	const fd = fs.openSync(filePath, 'r+');
	const writeToFile = (buffer, pieceIndex, offset) => {
		try {
			fs.writeSync(fd, buffer, 0, buffer.length, offset);
		} catch (err) {
			console.error("Write failed:", err);
		}
	}

	// const announceResponse = await announceToTracker(torrent.announce.toString(), infoHash, size)
	// console.log("Announce response:", announceResponse)

	// const { peers, offset } = await findActiveSeeders(announceResponse.peers, infoHash)
	const peers = [
		{ ip: '185.149.91.71', port: 51017 },
		{ ip: '184.75.221.43', port: 20000 },
		{ ip: '180.150.41.117', port: 9855 },
		{ ip: '176.79.63.195', port: 31400 },
		{ ip: '172.97.223.100', port: 18881 },
		{ ip: '159.196.117.71', port: 24190 },
		{ ip: '149.50.222.97', port: 40034 },
		{ ip: '149.50.222.86', port: 41383 },
		{ ip: '146.70.72.135', port: 45941 },
		{ ip: '145.14.96.76', port: 20275 },
		{ ip: '143.244.52.46', port: 45797 },
		{ ip: '138.199.33.251', port: 59308 },
		{ ip: '135.125.108.184', port: 51413 },
		{ ip: '130.195.221.172', port: 39977 },
		{ ip: '118.200.59.59', port: 54881 },
		{ ip: '109.50.206.36', port: 6189 },
		{ ip: '103.69.224.99', port: 52330 },
		{ ip: '103.69.224.52', port: 34824 },
		{ ip: '98.238.160.78', port: 29416 },
		{ ip: '95.181.238.74', port: 45473 },
		{ ip: '95.181.233.15', port: 52070 },
		{ ip: '95.88.39.222', port: 26145 },
		{ ip: '89.162.68.78', port: 13337 },
		{ ip: '83.149.72.74', port: 60661 },
		{ ip: '80.5.205.102', port: 19452 },
		{ ip: '79.127.136.34', port: 46178 },
		{ ip: '77.127.138.202', port: 2175 },
		{ ip: '76.144.50.132', port: 27693 },
		{ ip: '61.239.59.197', port: 23456 },
		{ ip: '58.227.78.137', port: 4957 }
	]

	await new Promise.all(
		peers.map(async peer => {
			try {
				await connectPeer({
					peer,
					infoHash,
					pieceCount,
					getPieceSize,
					getIndexes,
					writeToFile,
					state: getState(pieceLength, pieceHashes.length)
				})
			} catch (error) {
				console.error("Error:", error)
			}
		})
	)

	allPieces = Buffer.concat(
		Object.values(allPieces).map(({size,receivedSize,...piece}) => 
			Buffer.concat(Object.values(piece))
		)
	)

	if (!allPieces?.length) throw new Error("No active seeders found.")

	let fileIndex = 0
	if (torrent.info.files?.length) for (const file of torrent.info.files) {
		let filePath = file.path.map(_i => _i.toString())
		if (filePath.length > 1) {
			const parentFolder = filePath.slice(0,-1).join("/")
			if (!fs.existsSync(parentFolder)) fs.mkdirSync(parentFolder, { recursive:true })
		}
		
		filePath = filePath.join("/")
		
		const filePieces = allPieces.slice(fileIndex, fileIndex + file.length);
		fs.writeFile(filePath, filePieces, (err) => {
			if (err) throw err;
			console.log(`${filename} saved successfully!`);
		});

		fileIndex += file.length
	} else if (torrent.info.name) {
		fs.writeFile(torrent.info.name, allPieces, (err) => {
			if (err) throw err;
			console.log(`${torrent.info.name} saved successfully!`);
		});
	}
}

main()
