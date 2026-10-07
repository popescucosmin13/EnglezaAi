const { withAppBuildGradle } = require('@expo/config-plugins');

const REVENUECAT_ANDROID_VERSION = '10.16.2';
const MARKER = '// RevenueCat Android SDK (managed by withRevenueCatAndroid.js)';

function addRevenueCatDependencies(contents) {
  if (contents.includes(MARKER)) return contents;

  const dependenciesBlock = /dependencies\s*\{/;
  if (!dependenciesBlock.test(contents)) {
    throw new Error('Nu am găsit blocul dependencies în android/app/build.gradle.');
  }

  return contents.replace(
    dependenciesBlock,
    (match) => `${match}\n    ${MARKER}\n    implementation "com.revenuecat.purchases:purchases:${REVENUECAT_ANDROID_VERSION}"\n    implementation "com.revenuecat.purchases:purchases-ui:${REVENUECAT_ANDROID_VERSION}"`
  );
}

module.exports = function withRevenueCatAndroid(config) {
  const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV;
  const androidApiKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY?.trim() || '';
  const allowTestStoreInProduction =
    process.env.EXPO_PUBLIC_REVENUECAT_ALLOW_TEST_KEY?.trim().toLowerCase() === 'true';
  const explicitlyAllowedTestKey =
    allowTestStoreInProduction && androidApiKey.startsWith('test_');
  if (appEnvironment === 'production' && !androidApiKey.startsWith('goog_') && !explicitlyAllowedTestKey) {
    throw new Error(
      'Build oprit: profilul production necesită o cheie goog_ sau activarea explicită a Test Store.'
    );
  }

  return withAppBuildGradle(config, (gradleConfig) => {
    if (gradleConfig.modResults.language !== 'groovy') {
      throw new Error('Pluginul RevenueCat EnglezaAI suportă momentan build.gradle în format Groovy.');
    }
    gradleConfig.modResults.contents = addRevenueCatDependencies(gradleConfig.modResults.contents);
    return gradleConfig;
  });
};

module.exports.addRevenueCatDependencies = addRevenueCatDependencies;
module.exports.REVENUECAT_ANDROID_VERSION = REVENUECAT_ANDROID_VERSION;
