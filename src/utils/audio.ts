import { spawn } from 'child_process';

export interface AudioProcessingOptions {
    maxDuration?: number;
    sampleRate?: number;
    channels?: number;
    bitrate?: string;
}

const TARGET_LUFS = -16;
const MIN_NORMALIZATION_GAIN = 0.25;
const MAX_NORMALIZATION_GAIN = 4;

export async function analyzeLoudness(filePath: string): Promise<number> {
    const args = [
        '-i',
        filePath,
        '-af',
        `loudnorm=I=${TARGET_LUFS}:TP=-1.5:LRA=11:print_format=json`,
        '-f',
        'null',
        '-',
    ];

    return new Promise<number>((resolve) => {
        const proc = spawn('ffmpeg', args);

        let stderr = '';
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('error', (err) => {
            console.error('Loudness analysis failed to start FFmpeg:', err);
            resolve(1);
        });

        proc.on('close', () => {
            const jsonMatch = /\{[^{}]*"input_i"[^{}]*\}/.exec(stderr);
            if (!jsonMatch) {
                console.error(
                    `Loudness analysis found no loudnorm stats for ${filePath}. Stderr: ${stderr}`,
                );
                resolve(1);
                return;
            }

            try {
                const stats = JSON.parse(jsonMatch[0]) as { input_i: string };
                const inputLufs = Number.parseFloat(stats.input_i);
                if (!Number.isFinite(inputLufs)) {
                    console.error(
                        `Loudness analysis got a non-finite input_i for ${filePath}: ${stats.input_i}`,
                    );
                    resolve(1);
                    return;
                }

                const gain = 10 ** ((TARGET_LUFS - inputLufs) / 20);
                resolve(
                    Math.min(
                        MAX_NORMALIZATION_GAIN,
                        Math.max(MIN_NORMALIZATION_GAIN, gain),
                    ),
                );
            } catch (err) {
                console.error(
                    `Loudness analysis failed to parse loudnorm stats for ${filePath}:`,
                    err,
                );
                resolve(1);
            }
        });
    });
}

/**
 * Processes an audio file using ffmpeg
 * Converts to .ogg format.
 */
export async function processAudio(
    inputPath: string,
    outputPath: string,
    options: AudioProcessingOptions = {},
): Promise<void> {
    const {
        maxDuration = 8,
        sampleRate = 48000,
        channels = 2,
        bitrate = '320k',
    } = options;

    const args = [
        '-i',
        inputPath,
        '-t',
        String(maxDuration),
        '-ar',
        String(sampleRate),
        '-ac',
        String(channels),
        '-b:a',
        bitrate,
        '-c:a',
        'libopus',
        '-y',
        outputPath,
    ];

    return new Promise<void>((resolve, reject) => {
        const proc = spawn('ffmpeg', args);

        let stderr = '';
        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to start FFmpeg: ${err.message}`));
        });

        proc.on('close', (code) => {
            if (code === 0) {
                resolve();
            } else {
                reject(
                    new Error(
                        `FFmpeg exited with code ${code}\nStderr: ${stderr}`,
                    ),
                );
            }
        });
    });
}
