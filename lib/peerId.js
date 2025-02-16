import { existsSync, readFileSync, writeFileSync } from "fs"

const PEER_ID_FILE = "peer_id.json"

function generatePeerId() {
	let prefix = "-UT0001-"
	let randomPart = [...Array(12)].map(() => Math.floor(Math.random() * 16).toString(16)).join("")
	return prefix + randomPart
}

function getPeerId() {
	if (existsSync(PEER_ID_FILE)) {
		const data = JSON.parse(readFileSync(PEER_ID_FILE, "utf8"))
		if (data.peer_id) return data.peer_id
	}

	const newPeerId = generatePeerId()
	writeFileSync(PEER_ID_FILE, JSON.stringify({ peer_id: newPeerId }, null, 2))
	return newPeerId
}

const peerId = getPeerId()
console.log("Your Peer ID:", peerId)

export default peerId
