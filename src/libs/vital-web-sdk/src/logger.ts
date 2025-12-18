const DEBUG_MODE = false

function devLog(...args) {
    if (DEBUG_MODE) console.log(...args)
}

function devError(...args) {
    if (DEBUG_MODE) console.error(...args)
}
