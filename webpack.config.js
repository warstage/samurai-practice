const path = require('path');

module.exports = {
    entry: './src/index.ts',
    devtool: 'inline-source-map',
    module: {
        rules: [{
            test: /\.ts$/,
            use: 'ts-loader',
            exclude: /node_modules/
        }]
    },
    resolve: {
        extensions: ['.js', '.ts']
    },
    output: {
        filename: 'main.js',
        path: path.resolve(__dirname, 'docs'),
    },
    devServer: {
        contentBase: path.join(__dirname, 'docs'),
        watchContentBase: true
    }
};