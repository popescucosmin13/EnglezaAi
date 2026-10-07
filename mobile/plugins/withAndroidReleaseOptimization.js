const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const RELEASE_PROPERTIES = {
  'android.enableMinifyInReleaseBuilds': 'true',
  'android.enableShrinkResourcesInReleaseBuilds': 'true',
  // The installed React Native toolchain uses AGP 8.12.
  'android.r8.optimizedResourceShrinking': 'true',
  'android.enableR8.fullMode': 'true',
};

function optimizeGradleProperties(properties) {
  return [
    ...properties.filter((entry) => entry.type !== 'property' || !Object.hasOwn(RELEASE_PROPERTIES, entry.key)),
    ...Object.entries(RELEASE_PROPERTIES).map(([key, value]) => ({ type: 'property', key, value })),
  ];
}

function optimizeAppBuildGradle(contents) {
  if (!contents.includes('proguard-android.txt') && !contents.includes('proguard-android-optimize.txt')) {
    throw new Error('Nu am găsit configurația ProGuard Android; verifică template-ul Expo înainte de build.');
  }
  return contents.replaceAll('proguard-android.txt', 'proguard-android-optimize.txt');
}

module.exports = function withAndroidReleaseOptimization(config) {
  config = withGradleProperties(config, (mod) => {
    mod.modResults = optimizeGradleProperties(mod.modResults);
    return mod;
  });
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') throw new Error('Optimizarea Android necesită template-ul Expo Groovy.');
    mod.modResults.contents = optimizeAppBuildGradle(mod.modResults.contents);
    return mod;
  });
};

module.exports.optimizeGradleProperties = optimizeGradleProperties;
module.exports.optimizeAppBuildGradle = optimizeAppBuildGradle;
