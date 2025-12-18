/**
 * Ambient module declaration for ring_buffer.js
 * This tells TypeScript about the types when importing with path alias
 */

/**
 * Lock-free Single-Producer Single-Consumer Ring Buffer
 */
export class RingBuffer {
    static readonly HEADER_SIZE: number

    /**
     * Create a new RingBuffer
     * @param sab - Optional SharedArrayBuffer to use, or null to create a new one
     * @param size - Size of the buffer in bytes (excluding header)
     */
    constructor(sab: SharedArrayBuffer | null, size?: number)

    /**
     * Get the underlying SharedArrayBuffer
     */
    getSharedArrayBuffer(): SharedArrayBuffer

    /**
     * Write data to the ring buffer
     * @param data - Data to write
     * @returns true if successful, false if buffer is full
     */
    write(data: Uint8Array): boolean

    /**
     * Read and process all available messages
     * @param callback - Function to call for each message
     */
    read(callback: (data: Uint8Array) => void): void
}
