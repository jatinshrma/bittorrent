import announceViaHTTP from "./announceViaHTTP.js"
import announceViaUDP from "./announceViaUDP.js"

export default function announceToTracker(...args) {
	args[0] = "udp://tracker.opentrackr.org:1337/announce"
	const parsedUrl = new URL(args[0])

	if (parsedUrl.protocol === "udp:") return announceViaUDP(...args)
	else if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:")
		return announceViaHTTP(...args)
	else throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`)
}
