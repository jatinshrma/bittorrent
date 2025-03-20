function jobRunner(flagsLib, jobs, onEnd) {
    let job = jobs.shift()
    while (job !== undefined) {
        const allocatedIndexes = []

        for (let i = 0; i < flagsLib.length; i++) {
            if (flagsLib[i] === false || job.data[i] !== "1") continue
            flagsLib[i] = false
            allocatedIndexes.push(i)
            // if (allocatedIndexes.length > 4)
                break
        }

        job.callback(allocatedIndexes)
        job = jobs.shift()
    }

    onEnd()
}

export default function createJobScheduler(flagsLib, jobs) {
    let running = false
    return (data) => new Promise((res, rej) => {
        jobs.push({
            data: data,
            callback: res
        })

        if (!running) {
            running = true
            jobRunner(flagsLib, jobs, () => (running = false))
        }
    })
}
