export class AudioRingBuffer {
    static HEADER_BYTES: number
    constructor(sab: SharedArrayBuffer | null, channelCount: number, frameCapacity: number)
    getSharedArrayBuffer(): SharedArrayBuffer
    availableWrite(): number
    availableRead(): number
    write(inputInterleaved: Float32Array): number
    read(outputChannels: Float32Array[], framesToRead: number): boolean
}
