import * as fs from "fs"
import { createHash } from "crypto"
import bencode from "./lib/bencode.js"
import {
	batchUp,
	constants,
	createDir,
	createPreAllocatedFile,
	getState,
	throttle,
} from "./lib/utils.js"
import connectPeer from "./lib/connectPeer.js"
import announceToTracker from "./lib/announce/announceToTracker.js"
import findActiveSeeders from "./lib/findActiveSeeders.js"
import createJobRunner from "./lib/createJobRunner.js"
import { reconstructFile, reconstructMultiFile } from "./lib/reconstruct.js"

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

		if (torrent.info.files?.length)
			reconstructMultiFile(
				tempFilePath,
				torrent,
				calllback
			)
		else if (torrent.info.name)
			reconstructFile(
				tempFilePath,
				createDir(`downloads/${torrent.info.name}`),
				calllback
			)
	}

	let {
		receivedBlocks = 0,
		unProcessedBitfields = [],
		indexesLib = Array(pieceCount).fill(true),
		piecesTrack = {},
	} = fs.existsSync(progressFilePath) ? JSON.parse(fs.readFileSync(progressFilePath)) : {}

	if (receivedBlocks > 0) {
		const incompletePieceIndex = +Object.keys(piecesTrack).find(
			(i) => piecesTrack[i].size > piecesTrack[i].receivedSize
		)
		if (!isNaN(incompletePieceIndex)) {
			console.log({ incompletePieceIndex })
			indexesLib[incompletePieceIndex] = true
		} else {
			reconstruct()
			return
		}
	}

	const getPieceSize = (i) => (i === pieceCount - 1 ? lastPieceLength : pieceLength)
	const getIndexes = createJobRunner(indexesLib, unProcessedBitfields)
	const saveProgressLog = throttle(() => {
		fs.writeFileSync(
			progressFilePath,
			JSON.stringify({
				receivedBlocks,
				unProcessedBitfields,
				indexesLib,
				piecesTrack,
			})
		)
	}, 5000)

	const fd = fs.openSync(tempFilePath, "r+")
	const writeToFile = (buffer, pieceIndex, offset, completion) => {
		const position = pieceIndex * pieceLength + offset
		try {
			receivedBlocks++
			const total = +((receivedBlocks * 100) / totalBlocksCount).toFixed(2)
			console.log(`⌛ Downloaded piece: ${pieceIndex} [${completion}%] - ${total}%`)

			fs.writeSync(fd, buffer, 0, buffer.length, position)

			if (completion) saveProgressLog()
		} catch (err) {
			console.error(err)
			console.error("^^^ Write failed! Args: ", { buffer, pieceIndex, offset, position })
		}
	}

	const announceResponse = await announceToTracker(torrent.announce.toString(), infoHash, size)

	const { peers } = await findActiveSeeders(announceResponse.peers, infoHash)

	let inProgress = 0

	while (receivedBlocks < totalBlocksCount) {
		console.log(receivedBlocks, totalBlocksCount)
		await Promise.all(
			peers
				.filter((i) => !i.failed && !i.inProgress)
				.map(async (peer) => {
					if (!indexesLib.includes(true)) return console.log(indexesLib)
					const state = getState(pieceLength, pieceCount, getPieceSize)
					try {
						peer.inProgress = true
						inProgress++

						await connectPeer({
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
							peer.failed = true
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
