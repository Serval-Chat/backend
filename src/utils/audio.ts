import { spawn } from 'child_process';

export interface AudioProcessingOptions {
    maxDuration?: number;
    sampleRate?: number;
    channels?: number;
    bitrate?: string;
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
