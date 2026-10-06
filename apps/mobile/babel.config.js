// What Expo uses when this file is absent, written down so that the screen tests use the same.
module.exports = function config(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
