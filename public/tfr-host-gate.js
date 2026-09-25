/**
 * If this origin is thefinancialrevolution.net, send marketing paths
 * into /tfr/ so the education site is the homepage even before
 * host-based Express static is ordered ahead of the FACTS root.
 */
(function () {
  var h = (location.hostname || '').toLowerCase();
  if (h !== 'thefinancialrevolution.net' && h !== 'www.thefinancialrevolution.net') return;
  var p = location.pathname || '/';
  if (/\.(js|css|png|jpe?g|gif|svg|webp|ico|woff2?|map)$/i.test(p)) return;
  if (/^\/(tfr|api|facts-funnel|credit-analysis|shopping-calculator|benefits-masterclass|legal-disclaimer|educational-disclaimer|compliance-disclaimer|analytics-tracker|tfr-host-gate)(\/|\.|$)/.test(p)) return;

  var map = {
    '/': '/tfr/',
    '/index.html': '/tfr/',
    '/library': '/tfr/library.html',
    '/library.html': '/tfr/library.html',
    '/programs': '/tfr/programs.html',
    '/programs.html': '/tfr/programs.html',
    '/modules': '/tfr/modules.html',
    '/modules.html': '/tfr/modules.html',
    '/tools': '/tfr/tools.html',
    '/tools.html': '/tfr/tools.html',
    '/about': '/tfr/about.html',
    '/about.html': '/tfr/about.html',
    '/article': '/tfr/article.html',
    '/article.html': '/tfr/article.html'
  };
  var dest = map[p] || '/tfr/';
  if (dest !== p) location.replace(dest + location.search + location.hash);
})();
