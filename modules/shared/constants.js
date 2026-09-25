'use strict';

/** Default 6-bucket split as fractions that sum to 1.0 */
const DEFAULT_BUCKET_TARGETS = Object.freeze({
  NECESSITIES: 0.5,
  RESERVE: 0.1,
  VELOCITY: 0.1,
  GROWTH: 0.1,
  LIFESTYLE: 0.1,
  LEGACY: 0.1
});

const BUCKET_SLUGS = Object.freeze([
  'necessities',
  'reserve',
  'velocity',
  'growth',
  'lifestyle',
  'legacy'
]);

module.exports = {
  DEFAULT_BUCKET_TARGETS,
  BUCKET_SLUGS
};
