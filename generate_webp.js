const sharp = require('sharp');

sharp({
    create: {
        width: 1,
        height: 1,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
    }
})
    .webp()
    .toBuffer()
    .then(data => {
        console.log(data.toString('base64'));
    })
    .catch(err => {
        console.error(err);
    });
