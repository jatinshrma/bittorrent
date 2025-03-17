import * as fs from "fs"

export function reconstructFile(inputFile, outputFile, callback) {
  const writeStream = fs.createWriteStream(outputFile)
  const readStream = fs.createReadStream(inputFile)

  readStream.pipe(writeStream, { end: false })

  readStream.on("end", () => {
    writeStream.end(() => {
			callback()
			console.log(`File reconstructed at ${outputFile}`)
		})
  })

  readStream.on("error", (err) => console.error(`Error reading:`, err))
}

export function reconstructMultiFile(inputFile, torrentInfo, callback) {
	let readOffset = 0

	function processFile(fileIndex) {
		if (fileIndex >= torrentInfo.files.length) {
			callback()
			console.log("All files reconstructed successfully.")
			return
		}

		const { path, length } = torrentInfo.files[fileIndex]
		const writeStream = fs.createWriteStream(`download/${path}`)
		let remainingBytes = length

		function writeNextChunk(pieceIndex) {
			if (remainingBytes <= 0) {
				writeStream.end(() => processFile(fileIndex + 1))
				return
			}

			const readStream = fs.createReadStream(inputFile, {
				start: readOffset % torrentInfo.pieceLength,
				end:
					Math.min(
						(readOffset % torrentInfo.pieceLength) + remainingBytes,
						torrentInfo.pieceLength
					) - 1,
			})

			readStream.pipe(writeStream, { end: false })

			readStream.on("end", () => {
				readOffset += readStream.bytesRead || 0
				remainingBytes -= readStream.bytesRead || 0
				writeNextChunk(pieceIndex + 1)
			})

			readStream.on("error", (err) => console.error(`Error processing piece ${pieceIndex}:`, err))
		}

		writeNextChunk(Math.floor(readOffset / torrentInfo.pieceLength))
	}

	processFile(0)
}
