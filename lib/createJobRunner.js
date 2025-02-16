function jobRunnerModel(flagsList, jobs, onEnd) {
    let job = jobs.shift()
    while (job !== undefined) {
        const allocatedIndexes = []
        /**
         * [<pieces[<blocks>]>]
        */

        for (let i = 0; i < flagsList.length; i++) {
            if (!flagsList[i]) continue
            allocatedIndexes.push(i)
            flagsList[i] = false
            break
        }

        job = jobs.shift()
        job.callback(allocatedIndexes)
    }

    onEnd()
}

export default function createJobRunner(flagsList, jobs) {
    let running = false

    return (data) => new Promise((res, rej) => {
        jobs.push({
            data: data,
            callback: res
        })

        if (!running) {
            running = true
            jobRunnerModel(flagsList, jobs, () => (running = false))
        }
    })
}
