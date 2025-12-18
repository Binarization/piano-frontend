/**
 * Lock-free Single-Producer Single-Consumer Ring Buffer
 * Uses SharedArrayBuffer and Atomics.
 * 
 * Memory Layout:
 * [0-3]: Write Index (Int32)
 * [4-7]: Read Index (Int32)
 * [8...]: Data Buffer (Uint8)
 */
export class RingBuffer {
    static HEADER_SIZE = 8

    constructor(sab, size) {
        if (sab) {
            this.sab = sab
            this.size = size || (sab.byteLength - RingBuffer.HEADER_SIZE)
        } else {
            this.size = size || 4096
            this.sab = new SharedArrayBuffer(this.size + RingBuffer.HEADER_SIZE)
        }

        this.header = new Int32Array(this.sab, 0, 2)
        this.buffer = new Uint8Array(this.sab, RingBuffer.HEADER_SIZE, this.size)
    }

    /**
     * @returns {SharedArrayBuffer}
     */
    getSharedArrayBuffer() {
        return this.sab
    }

    /**
     * Write a message to the buffer.
     * Format: [Length (1 byte), ...Body]
     * @param {Uint8Array} data 
     * @returns {boolean} success
     */
    write(data) {
        const length = data.length
        // 1 byte for length header
        const required = length + 1

        const writeIndex = Atomics.load(this.header, 0)
        const readIndex = Atomics.load(this.header, 1) // Relaxed load is fine for single consumer

        const available = (this.size - (writeIndex - readIndex))

        if (available < required) {
            return false // Overflow
        }

        // Write Length
        this.buffer[writeIndex % this.size] = length

        // Write Data
        for (let i = 0; i < length; i++) {
            this.buffer[(writeIndex + 1 + i) % this.size] = data[i]
        }

        // Publish
        Atomics.store(this.header, 0, writeIndex + required)

        return true
    }

    /**
     * Read and process all available messages
     * @param {function(Uint8Array): void} callback 
     */
    read(callback) {
        const writeIndex = Atomics.load(this.header, 0)
        let readIndex = Atomics.load(this.header, 1)

        if (readIndex === writeIndex) {
            return // Empty
        }

        // Lazy allocation of temp buffer to avoid constructor overhead if never used
        if (!this._tempBuffer) {
            this._tempBuffer = new Uint8Array(256) // Max message size assumption
        }

        while (readIndex < writeIndex) {
            // Read Length
            const length = this.buffer[readIndex % this.size]

            // Ensure temp buffer is large enough (rare resize)
            if (this._tempBuffer.length < length) {
                this._tempBuffer = new Uint8Array(length + 64)
            }

            // Read Data into _tempBuffer (Zero Allocation)
            for (let i = 0; i < length; i++) {
                this._tempBuffer[i] = this.buffer[(readIndex + 1 + i) % this.size]
            }

            const view = this._tempBuffer.subarray(0, length)
            callback(view)

            readIndex += (length + 1)
        }

        // Update Read Index
        Atomics.store(this.header, 1, readIndex)
    }
}
