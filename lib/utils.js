export const port = 6881
export function group(iterable, groupSize, handler) {
	let groups = []
	for (let i = 0; i < iterable.length; i += groupSize) {
		const slice = iterable.slice(i, i + groupSize)
		groups.push(typeof handler === "function" ? handler(slice) : slice)
	}
	return groups
}

export function getPeers(addresses) {
	return group(addresses, 6, address => ({
		ip: address.slice(0, 4).join("."),
		port: address.readUInt16BE?.(4) || address.readUInt8?.(4)
	}))
}

// "udp://tracker.opentrackr.org:1337/announce"
