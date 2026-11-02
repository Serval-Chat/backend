const mongoose = require('mongoose');
const os = require('node:os');

const originalOpenUri = mongoose.Connection.prototype.openUri;

// Jest cannot provide the dynamic import callback the MongoDB driver's adapter lookup expects.
mongoose.Connection.prototype.openUri = function (uri, options = {}) {
    return originalOpenUri.call(this, uri, {
        ...options,
        runtimeAdapters: {
            ...options.runtimeAdapters,
            os: options.runtimeAdapters?.os ?? os,
        },
    });
};
