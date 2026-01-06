const esbuild = require('esbuild');
const esbuildPluginTsc = require('esbuild-plugin-tsc');
const fs = require('fs');
const path = require('path');

esbuild.build({
    entryPoints: ['src/main.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    outfile: 'dist/main.js',
    packages: 'external',
    sourcemap: true,
    plugins: [
        esbuildPluginTsc({
            force: true
        }),
    ],
}).then(() => {
    // Copy static assets
    const assets = [
    ];

    assets.forEach(({ src, dest }) => {
        const srcPath = path.join(__dirname, src);
        const destPath = path.join(__dirname, dest);
        if (fs.existsSync(srcPath)) {
            fs.copyFileSync(srcPath, destPath);
            console.log(`Copied ${src} to ${dest}`);
        } else {
            console.warn(`Warning: Asset ${src} not found`);
        }
    });
}).catch(() => process.exit(1));
