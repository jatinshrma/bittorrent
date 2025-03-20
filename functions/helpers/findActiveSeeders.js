import connectToPeer from "../handlers/connectToPeer.js"

export default async function findActiveSeeders(peers, infoHash) {
	const maxConcurrent = 25
	let activePeers = []
	let i = 0

	for (i; i < peers.length; i += maxConcurrent) {
		const batch = peers.slice(i, i + maxConcurrent)
		const results = await Promise.allSettled(
			batch.map(peer => connectToPeer({ peer, infoHash, handshake: false }))
		)

		activePeers.push(...results.filter(res => res.status === "fulfilled").map(res => res.value))

		// if (activePeers.length > 0) break
	}

	return { peers: activePeers, offset: i }
}
