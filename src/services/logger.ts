/**
 * Conditional Logging Service
 * Logs are only output when developer mode is enabled
 */

import { reactive } from 'vue'

const DEVELOPER_MODE_KEY = 'dev_mode'

/**
 * Log entry interface
 */
export interface LogEntry {
    timestamp: string
    type: 'log' | 'warn' | 'error' | 'latency'
    message: string
}

/**
 * Reactive logs array for LogViewer
 */
export const logs = reactive<LogEntry[]>([])

/**
 * Check if developer mode is enabled
 */
function isDeveloperMode(): boolean {
    return localStorage.getItem(DEVELOPER_MODE_KEY) === 'true'
}

/**
 * Format timestamp for log entries
 */
function getTimestamp(): string {
    const now = new Date()
    return now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }) +
        '.' + now.getMilliseconds().toString().padStart(3, '0')
}

/**
 * Add a log entry to the logs array
 */
function addLog(type: LogEntry['type'], ...args: any[]): void {
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
    ).join(' ')

    logs.push({
        timestamp: getTimestamp(),
        type,
        message
    })
}

/**
 * Conditional console.log - only logs when developer mode is enabled
 */
export function devLog(...args: any[]): void {
    if (isDeveloperMode()) {
        console.log(...args)
        addLog('log', ...args)
    }
}

/**
 * Conditional console.warn - only logs when developer mode is enabled
 */
export function devWarn(...args: any[]): void {
    if (isDeveloperMode()) {
        console.warn(...args)
        addLog('warn', ...args)
    }
}

/**
 * Conditional console.error - only logs when developer mode is enabled
 */
export function devError(...args: any[]): void {
    if (isDeveloperMode()) {
        console.error(...args)
        addLog('error', ...args)
    }
}

/**
 * Clear all logs
 */
export function clearLogs(): void {
    logs.splice(0, logs.length)
}

// Store original console methods
const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
}

let isLoggingActive = false

/**
 * Start intercepting console methods to capture all output
 * This captures logs from WASM, third-party libraries, and all other sources
 */
export function startLogging(): void {
    if (isLoggingActive) return

    isLoggingActive = true

    // Intercept console.log
    console.log = (...args: any[]) => {
        originalConsole.log(...args)
        addLog('log', ...args)
    }

    // Intercept console.warn
    console.warn = (...args: any[]) => {
        originalConsole.warn(...args)
        addLog('warn', ...args)
    }

    // Intercept console.error
    console.error = (...args: any[]) => {
        originalConsole.error(...args)
        addLog('error', ...args)
    }
}

/**
 * Stop intercepting console methods and restore originals
 */
export function stopLogging(): void {
    if (!isLoggingActive) return

    isLoggingActive = false

    console.log = originalConsole.log
    console.warn = originalConsole.warn
    console.error = originalConsole.error
}


/**
 * Enable developer mode
 */
export function enableDeveloperMode(): void {
    localStorage.setItem(DEVELOPER_MODE_KEY, 'true')
}

/**
 * Disable developer mode
 */
export function disableDeveloperMode(): void {
    localStorage.setItem(DEVELOPER_MODE_KEY, 'false')
}

/**
 * Toggle developer mode
 */
export function toggleDeveloperMode(): boolean {
    const newValue = !isDeveloperMode()
    localStorage.setItem(DEVELOPER_MODE_KEY, newValue.toString())
    return newValue
}
