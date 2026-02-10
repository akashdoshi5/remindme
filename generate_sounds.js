
import fs from 'fs';
import path from 'path';

// Simple WAV Header generator
function createWavHeader(dataLength, sampleRate = 44100) {
    const buffer = Buffer.alloc(44);
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataLength, 4);
    buffer.write('WAVE', 8);
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);
    buffer.writeUInt16LE(1, 20); // PCM
    buffer.writeUInt16LE(1, 22); // Mono
    buffer.writeUInt32LE(sampleRate, 24);
    buffer.writeUInt32LE(sampleRate * 2, 28); // Byte rate
    buffer.writeUInt16LE(2, 32); // Block align
    buffer.writeUInt16LE(16, 34); // Bits per sample
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataLength, 40);
    return buffer;
}

// Generate Alarm (Square/Sawtooth wave - Aggressive)
function generateAlarmBuffer() {
    const sampleRate = 44100;
    const duration = 1.0; // 1 second
    const freq = 880; // A5
    const length = sampleRate * duration;
    const buffer = Buffer.alloc(length * 2);

    for (let i = 0; i < length; i++) {
        // Intermittent beep: 0.1s on, 0.1s off
        const t = i / sampleRate;
        if (Math.floor(t * 10) % 2 === 0) {
            // Square wave
            const val = Math.sin(2 * Math.PI * freq * t) > 0 ? 0.5 : -0.5;
            buffer.writeInt16LE(val * 32767, i * 2);
        } else {
            buffer.writeInt16LE(0, i * 2);
        }
    }
    return Buffer.concat([createWavHeader(buffer.length), buffer]);
}

// Generate Chime (Sine wave with decay - Soft)
function generateChimeBuffer() {
    const sampleRate = 44100;
    const duration = 1.5;
    const freq = 660; // E5
    const length = sampleRate * duration;
    const buffer = Buffer.alloc(length * 2);

    for (let i = 0; i < length; i++) {
        const t = i / sampleRate;
        const decay = Math.exp(-3 * t); // Decay envelope
        const val = Math.sin(2 * Math.PI * freq * t) * decay * 0.6;
        buffer.writeInt16LE(val * 32767, i * 2);
    }
    return Buffer.concat([createWavHeader(buffer.length), buffer]);
}

const rawDir = path.join(process.cwd(), 'android', 'app', 'src', 'main', 'res', 'raw');

fs.writeFileSync(path.join(rawDir, 'alarm.wav'), generateAlarmBuffer());
console.log('Generated alarm.wav');

fs.writeFileSync(path.join(rawDir, 'chime.wav'), generateChimeBuffer());
console.log('Generated chime.wav');
