const { Socket } = require("net")
const peerId = require("./peerId")
const client = new Socket()

module.exports = function handshake({ address, urlEncodedInfoHash }) {
	const message = "19:BitTorrent protocol" + Array(8).fill(0).join("") + urlEncodedInfoHash + peerId
	const [path, port] = address.split(":")

	return new Promise(res => {
		client.once("connectionAttempt", (...args) => console.log(...args, "connecting..."))
		client.once("error", function (err) {
			client.removeAllListeners()
			console.error("Connection error: " + err)
			res({ error: err })
		})
		client.once("connect", () => {
			console.log("connected to " + address)
			client.on("data", data => {
				console.log(data.toString("hex").slice(-40))
			})
			client.write(message)
		})
		client.connect({ host: path, port: parseInt(port) })
	})
}
