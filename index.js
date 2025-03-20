import * as fs from "fs"
import { createHash } from "crypto"
import {
	batchUp,
	constants,
	createDir,
	createPreAllocatedFile,
	getState,
	throttle,
} from "./functions/lib/utils.js"
import bencode from "./functions/modules/bencode.js"
import connectToPeer from "./functions/handlers/connectToPeer.js"
import findActiveSeeders from "./functions/helpers/findActiveSeeders.js"
import createJobScheduler from "./functions/modules/jobScheduler.js"
import { reconstructFile, reconstructMultiFile } from "./functions/modules/reconstruct.js"
import announceToTracker from "./functions/modules/announce/index.js"

async function main(torrentFilePath) {
	const buf = fs.readFileSync(torrentFilePath)
	const torrent = bencode.decode(buf)
	const infoHash = createHash("sha1").update(bencode.encode(torrent.info)).digest("hex")
	const size = torrent.info.files
		? torrent.info.files.map((file) => file.length).reduce((a, b) => a + b)
		: torrent.info.length

	const pieceHashes = batchUp(torrent.info.pieces, 20, (p) => p.toString("hex"))
	const pieceCount = pieceHashes.length
	const pieceLength = torrent.info["piece length"]
	const lastPieceLength = size % pieceLength
	const totalBlocksCount = Math.ceil(
		(pieceLength / constants.blockSize) * (pieceCount - 1) + lastPieceLength / constants.blockSize
	)

	const logsDir = `logs/${torrent.info.name}`
	const progressFilePath = createDir(`${logsDir}/progress.json`)
	const tempFilePath = createDir(`temp/${torrent.info.name}.bin`)
	createPreAllocatedFile(tempFilePath, size)

	function reconstruct() {
		const calllback = () => {
			fs.rmSync(logsDir, { recursive: true, force: true })
			fs.rmSync(tempFilePath, { recursive: true, force: true })
		}

		if (torrent.info.files?.length) reconstructMultiFile(tempFilePath, torrent, calllback)
		else if (torrent.info.name)
			reconstructFile(tempFilePath, createDir(`downloads/${torrent.info.name}`), calllback)
	}

	let {
		receivedBlocks = 0,
		unProcessedBitfields = [],
		indexesLib = Array(pieceCount).fill(true),
		piecesTrack = {},
		activePeers,
	} = fs.existsSync(progressFilePath) ? JSON.parse(fs.readFileSync(progressFilePath)) : {}

	if (!activePeers?.length) {
		const announceResponse = await announceToTracker(torrent.announce.toString(), infoHash, size)
		const { peers } = await findActiveSeeders(announceResponse.peers, infoHash)
		activePeers = peers
	}

	if (receivedBlocks > 0) {
		const incompletePieceIndexes = +Object.keys(piecesTrack).filter(
			(i) => piecesTrack[i].size > piecesTrack[i].receivedSize
		)
		if (incompletePieceIndexes.length) {
			console.log({ incompletePieceIndex: incompletePieceIndexes })
			for (const index of incompletePieceIndexes) {
				indexesLib[index] = true
			}
		} else {
			reconstruct()
			return
		}
	}

	const getPieceSize = (i) => (i === pieceCount - 1 ? lastPieceLength : pieceLength)
	const getIndexes = createJobScheduler(indexesLib, unProcessedBitfields)
	const saveProgressLog = throttle(() => {
		fs.writeFileSync(
			progressFilePath,
			JSON.stringify({
				receivedBlocks,
				unProcessedBitfields,
				indexesLib,
				piecesTrack,
				activePeers,
			})
		)
	}, 5000)

	const print = throttle((...args) => console.log(...args), 1000)

	const fd = fs.openSync(tempFilePath, "r+")
	const writeToFile = (buffer, pieceIndex, offset, completion) => {
		const position = pieceIndex * pieceLength + offset
		try {
			receivedBlocks++
			const total = +((receivedBlocks * 100) / totalBlocksCount).toFixed(2)
			print(`⌛ Downloaded piece: ${pieceIndex} [${completion}%] - ${total}%`)

			fs.writeSync(fd, buffer, 0, buffer.length, position)

			if (completion) saveProgressLog()
		} catch (err) {
			console.error(err)
			console.error("^^^ Write failed! Args: ", { buffer, pieceIndex, offset, position })
		}
	}

	let inProgress = 0

	while (receivedBlocks < totalBlocksCount) {
		console.log(receivedBlocks, totalBlocksCount)
		await Promise.all(
			activePeers
				.filter((i) => !i.failed && !i.inProgress)
				.map(async (peer) => {
					if (!indexesLib.includes(true)) return
					const state = getState(pieceLength, pieceCount, getPieceSize)
					try {
						peer.inProgress = true
						inProgress++

						await connectToPeer({
							peer,
							infoHash,
							pieceCount,
							getPieceSize,
							getIndexes,
							writeToFile,
							state,
							pieceTrack: piecesTrack,
						})
					} catch (error) {
						const unfulfilledIdxs = state.assignedIndexes.filter((i) => typeof i === "number")
						console.error("Error:", error, { unfulfilledIdxs }, "Active calls: ", inProgress)
						if (unfulfilledIdxs.length) {
							// peer.failed = true
							for (const idx of unfulfilledIdxs) indexesLib[idx] = true
						}
					}

					peer.inProgress = false
					inProgress--
					return
				})
		)
	}

	reconstruct()
}

main("torrents/1929495.torrent")
