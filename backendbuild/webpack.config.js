const path = require('path');

module.exports = {
  entry: './server.js', // Your main backend file
  target: 'node', // Specify Node.js as the target
  output: {
    path: path.resolve(__dirname, 'build'),
    filename: 'server.js',
  },
  externals: {
    express: 'commonjs express', // Exclude express from the bundle
  },
  mode: 'production', // Use 'production' for optimized builds
};
