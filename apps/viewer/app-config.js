/** @type {AppTypes.Config} */

// Med Connect's settings for the OHIF viewer (M36 plan §4). Built into the bundle as
// app-config.js. The viewer lives under /viewer on the site and opens one scan at a time, read
// through a signed link to that scan (the API's /api/v1/imaging/v/{token}/…). There is no study
// list: nothing here can browse or search scans.
window.config = {
  name: 'medconnect',
  routerBasename: '/viewer',
  extensions: [],
  modes: [],
  customizationService: ['@ohif/extension-default.customizationModule.theme'],
  showStudyList: false,
  maxNumberOfWebWorkers: 3,
  showWarningMessageForCrossOrigin: false,
  showCPUFallbackMessage: true,
  showLoadingIndicator: true,
  strictZSpacingForVolumeViewport: true,
  groupEnabledModesFirst: true,
  allowMultiSelectExport: false,
  maxNumRequests: { interaction: 100, thumbnail: 5, prefetch: 25 },
  showErrorDetails: 'production',
  // Shown on opening, every time: the viewer is for education and discussion, not diagnosis.
  investigationalUseDialog: { option: 'always' },
  defaultDataSourceName: 'medconnect',
  dataSources: [
    {
      namespace: '@ohif/extension-default.dataSourcesModule.dicomwebproxy',
      sourceName: 'medconnect',
      configuration: {
        friendlyName: 'Med Connect',
        name: 'medconnect',
        // Only this site's scan links (patch 0002).
        allowedPathPrefix: '/api/v1/imaging/v/',
      },
    },
  ],
};

// In Hebrew, each piece of text takes its own direction inside the viewer's left-to-right layout,
// so a sentence's punctuation stays at its end. (The layout itself stays left to right, as image
// viewers are.)
(function hebrewText() {
  if (new URLSearchParams(window.location.search).get('lng') !== 'he') return;
  var style = document.createElement('style');
  style.textContent =
    'div, span, p, a, button, label, li, td, th, h1, h2, h3, h4 { unicode-bidi: plaintext; }';
  document.head.appendChild(style);
})();
