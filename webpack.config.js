const path = require('path');

module.exports = (env, options) => {
  const { mode = 'development' } = options;
  const rules = [
    {
      test: /\.hbs$/,
      use: ['raw-loader'],
    },
    {
      test: /\.m?js$/,
      use: {
        loader: 'babel-loader',
        options: {
          presets: ['@babel/preset-env'],
        },
      },
    },
    {
      test: /\.(sa|sc|c)ss$/,
      use: [
        'raw-loader',
        'postcss-loader',
        'sass-loader',
      ],
    }
  ];

  const main = {
    mode,
    entry: {
      main: './src/main.js',
      worker: './src/worker.js',
    },
    output: {
      path: path.resolve(__dirname, 'dist'),
      filename: '[name].js',
      chunkFilename: '[name].js',
    },
    module: {
      rules,
    },
  };

  return [main];
}