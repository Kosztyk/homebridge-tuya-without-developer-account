"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.remap = remap;
exports.limit = limit;
exports.toHapProperty = toHapProperty;
exports.sanitizeName = sanitizeName;
exports.deepEqual = deepEqual;
exports.debounce = debounce;
exports.retry = retry;
exports.generateUUID = generateUUID;
function remap(value, srcStart, srcEnd, dstStart, dstEnd) {
    const percent = (value - srcStart) / (srcEnd - srcStart);
    const result = percent * (dstEnd - dstStart) + dstStart;
    return result;
}
function limit(value, start, end) {
    let result = value;
    result = Math.min(end, result);
    result = Math.max(start, result);
    return result;
}
function toHapProperty(property) {
    return Object.entries(property).reduce((hap, [key, value]) => {
        switch (key) {
            case 'min': {
                const multiple = Math.pow(10, property ? property['scale'] : 0);
                hap['minValue'] = Math.max(-273.15, value / multiple);
                break;
            }
            case 'max': {
                const multiple = Math.pow(10, property ? property['scale'] : 0);
                hap['maxValue'] = Math.min(400, value / multiple);
                break;
            }
            case 'step': {
                const multiple = Math.pow(10, property ? property['scale'] : 0);
                hap['minStep'] = Math.max(0.01, value / multiple);
                break;
            }
            case 'range': {
                hap['validValues'] = value;
                break;
            }
            default: {
                hap[key] = value;
                break;
            }
        }
        return hap;
    }, {});
}
function sanitizeName(name) {
    if (!name) {
        return undefined;
    }
    const original = name.toString();
    // First trim whitespace to check starting/ending characters
    const trimmed = original.trim();
    // Check if trimmed string starts or ends with non-alphanumeric and reject if so
    if (!/^[\p{L}\p{N}]/u.test(trimmed) || !/[\p{L}\p{N}]$/u.test(trimmed)) {
        return undefined;
    }
    // keep Unicode alphanumeric characters, spaces and apostrophes; replace other chars with space
    // Uses Unicode property escapes so letters and numbers from all scripts are allowed.
    let s = trimmed.replace(/[^\p{L}\p{N}'\s]/gu, ' ');
    // collapse whitespace
    s = s.replace(/\s+/g, ' ').trim();
    // ensure it starts and ends with an alphanumeric (Unicode-aware)
    if (!/^[\p{L}\p{N}].*[\p{L}\p{N}]$/u.test(s)) {
        return undefined;
    }
    return s;
}
/**
 * Deep equality check using JSON serialization
 * Works for most use cases (objects, arrays, primitives)
 */
function deepEqual(a, b) {
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    }
    catch {
        // Fallback for circular references or non-serializable objects
        return a === b;
    }
}
/**
 * Debounce function - delays execution until specified milliseconds pass without calls
 * @param fn Function to debounce
 * @param wait Wait time in milliseconds
 * @returns Debounced function
 */
function debounce(fn, wait) {
    let timeout = null;
    return function debounced(...args) {
        if (timeout) {
            clearTimeout(timeout);
        }
        timeout = setTimeout(() => {
            fn(...args);
            timeout = null;
        }, wait);
    };
}
async function retry(fn, options) {
    const { retriesMax = 3, interval = 100, exponential = false, factor = 2, jitter = 0, } = options ?? {};
    let lastError = null;
    let wait = interval;
    for (let attempt = 0; attempt <= retriesMax; attempt++) {
        try {
            return await fn();
        }
        catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            if (attempt < retriesMax) {
                // Calculate wait time
                let waitTime = wait;
                if (jitter > 0) {
                    waitTime += Math.random() * jitter;
                }
                await new Promise(resolve => setTimeout(resolve, waitTime));
                // Increase wait for next attempt if exponential
                if (exponential) {
                    wait *= factor;
                }
            }
        }
    }
    throw lastError || new Error('Max retries exceeded');
}
function generateUUID() {
    const { randomUUID } = require('crypto');
    return randomUUID();
}
//# sourceMappingURL=util.js.map