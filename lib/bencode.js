const getCharAt = (buff, i) => buff.slice(i, i + 1).toString()

function parseValue(value, i = 0) {
	if (!isNaN(getCharAt(value, i))) {
		const colonIdx = value.indexOf(":", i)
		if (colonIdx === -1) throw new Error("Invalid encoded value")

		const lengthOfStr = parseInt(value.slice(i, colonIdx).toString())
		return {
			decodedValue: value.slice(colonIdx + 1, colonIdx + 1 + lengthOfStr),
			progressedIdx: colonIdx + lengthOfStr + 1
		}
	} else if (getCharAt(value, i) === "i") {
		const eIdx = value.indexOf("e", i)
		if (eIdx === -1) throw new Error("Invalid encoded value")

		return {
			decodedValue: value.slice(i + 1, eIdx),
			isNum: true,
			progressedIdx: eIdx + 1
		}
	} else {
		throw new Error("Invalid encoded value")
	}
}

module.exports.decode = function (bencodedValue, i = 0, defaultValue) {
	let result = defaultValue
	let key = null

	while (i < bencodedValue.length) {
		if (getCharAt(bencodedValue, i) === "e") {
			i++
			break
		}
		let { decodedValue, progressedIdx, isNum } =
			getCharAt(bencodedValue, i) === "d"
				? this.decode(bencodedValue, i + 1, {})
				: getCharAt(bencodedValue, i) === "l"
				? this.decode(bencodedValue, i + 1, [])
				: parseValue(bencodedValue, i)

		if (isNum) decodedValue = parseInt(decodedValue.toString())

		if (result === undefined) result = decodedValue
		else if (Array.isArray(result)) result.push(decodedValue)
		else if (typeof result === "object") {
			if (key === null) key = decodedValue
			else {
				result[key] = decodedValue
				key = null
			}
		}

		i = progressedIdx
	}

	if (defaultValue === undefined) return result
	else
		return {
			decodedValue: result,
			progressedIdx: i
		}
}

module.exports.encode = function (json) {
	const buffList = [Buffer.from(Array.isArray(json) ? "l" : "d")]

	const handleWrite = value => {
		if (!Buffer.isBuffer(value)) value = Buffer.from(value)
		else buffList.push(Buffer.from(`${value.length}:`))

		buffList.push(value)
	}

	const handleValue = value => {
		if (typeof value === "string") return `${value.length}:${value}`
		else if (typeof value === "number") return `i${parseInt(value)}e`
		else return encode(value)
	}

	for (const key in json) {
		if (!Array.isArray(json)) handleWrite(`${key.length}:${key}`)

		if (Buffer.isBuffer(json[key])) handleWrite(json[key])
		else handleWrite(handleValue(json[key]))
	}

	return Buffer.concat([...buffList, Buffer.from("e")])
}
