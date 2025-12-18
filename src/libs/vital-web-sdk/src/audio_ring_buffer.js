/**
 * Audio Ring Buffer for Float32 Streaming
 * Single Producer (Worker), Single Consumer (Worklet)
 * 
 * Memory Layout:
 * [0-3]: Write Index (frames) - Int32
 * [4-7]: Read Index (frames) - Int32
 * [8-...]: Audio Data (Interleaved Float32: L, R, L, R...)
 */
export class AudioRingBuffer {
    // 2 x Int32 (8 bytes)
    static HEADER_BYTES = 8

    constructor(sab, channelCount, frameCapacity) {
        this.channelCount = channelCount || 2

        if (sab) {
            this.sab = sab
            // Calculate capacity from byte length
            const dataBytes = sab.byteLength - AudioRingBuffer.HEADER_BYTES
            this.capacity = Math.floor(dataBytes / 4 / this.channelCount)
        } else {
            this.capacity = frameCapacity || 4096 // Default approx 85ms @ 48k
            const dataBytes = this.capacity * this.channelCount * 4
            const totalBytes = dataBytes + AudioRingBuffer.HEADER_BYTES
            this.sab = new SharedArrayBuffer(totalBytes)
        }

        this.header = new Int32Array(this.sab, 0, 2)
        this.buffer = new Float32Array(this.sab, AudioRingBuffer.HEADER_BYTES)
    }

    getSharedArrayBuffer() {
        return this.sab
    }

    /**
     * Get available frames for writing
     */
    availableWrite() {
        const writeIndex = Atomics.load(this.header, 0)
        const readIndex = Atomics.load(this.header, 1)
        return this.capacity - (writeIndex - readIndex)
    }

    /**
     * Get available frames for reading
     */
    availableRead() {
        const writeIndex = Atomics.load(this.header, 0)
        const readIndex = Atomics.load(this.header, 1)
        return writeIndex - readIndex
    }

    /**
     * Write interleaved audio data
     * @param {Float32Array} inputInterleaved 
     * @returns {number} framesWritten
     */
    write(inputInterleaved) {
        const framesToWrite = inputInterleaved.length / this.channelCount
        const available = this.availableWrite()

        if (available < framesToWrite) {
            return 0 // Buffer full / Overflow risk
        }

        const writeIndex = Atomics.load(this.header, 0)

        const offset = (writeIndex % this.capacity) * this.channelCount
        const samplesToWrite = inputInterleaved.length
        const bufferLength = this.buffer.length

        // Check for split wrap
        if (offset + samplesToWrite <= bufferLength) {
            // Single contiguous write
            this.buffer.set(inputInterleaved, offset)
        } else {
            // Split write
            const firstChunkSamples = bufferLength - offset
            this.buffer.set(inputInterleaved.subarray(0, firstChunkSamples), offset)
            this.buffer.set(inputInterleaved.subarray(firstChunkSamples), 0)
        }

        // Publish
        Atomics.store(this.header, 0, writeIndex + framesToWrite)
        return framesToWrite
    }

    /**
     * Read into non-interleaved output arrays (typical WebAudio format)
     * @param {Float32Array[]} outputChannels [ChannelL, ChannelR]
     * @param {number} framesToRead
     * @returns {boolean} success
     */
    read(outputChannels, framesToRead) {
        const available = this.availableRead()
        if (available < framesToRead) {
            return false // Underrun
        }

        const writeIndex = Atomics.load(this.header, 0)
        const readIndex = Atomics.load(this.header, 1) // strictly separate local tracking if needed, but shared is safe for 1:1

        const offset = (readIndex % this.capacity) * this.channelCount
        const samplesToRead = framesToRead * this.channelCount
        const bufferLength = this.buffer.length
        const leftOut = outputChannels[0]
        const rightOut = outputChannels[1]

        // Function to de-interleave a chunk
        const deinterleave = (src, srcOffset, dstOffset, count) => {
            let srcIdx = srcOffset
            for (let i = 0; i < count; i++) {
                // Sample 0 (L)
                leftOut[dstOffset + i] = src[srcIdx++]
                // Sample 1 (R)
                rightOut[dstOffset + i] = src[srcIdx++]
            }
        }

        if (offset + samplesToRead <= bufferLength) {
            // Contiguous read
            deinterleave(this.buffer, offset, 0, framesToRead)
        } else {
            // Split read
            const firstChunkSamples = bufferLength - offset
            const firstChunkFrames = firstChunkSamples / this.channelCount

            deinterleave(this.buffer, offset, 0, firstChunkFrames)
            deinterleave(this.buffer, 0, firstChunkFrames, framesToRead - firstChunkFrames)
        }

        Atomics.store(this.header, 1, readIndex + framesToRead)
        return true
    }
}
