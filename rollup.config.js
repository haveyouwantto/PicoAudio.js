import babel from '@rollup/plugin-babel';
import {terser} from 'rollup-plugin-terser';

const babelParam = {
  babelHelpers: 'bundled',
  presets: ["@babel/preset-env"]
};

/**
 * Build variants.
 *
 * Every variant bundles the same sources; only src/features.js differs, which
 * makes the excluded engines unreachable and lets rollup drop their code.
 *
 *   basic                soundQuality 0 only (upstream PicoAudio feature set)
 *   wave                 + soundQuality 1 (hand-programmed synth instruments)
 *   sf2                  + soundQuality 4 (SoundFont 2)
 *   full                 + synth instruments + SF2
 *
 * The full build keeps the historical file names (dist/.../picoaudio.mjs and
 * friends); the others get a suffix: `rollup -c` builds all of them,
 * `rollup -c --environment PICO_VARIANTS:basic` builds one.
 */
const VARIANTS = {
  full: { suffix: '', wave: true, sf2: true },
  sf2: { suffix: '.sf2', wave: false, sf2: true },
  wave: { suffix: '.wave', wave: true, sf2: false },
  basic: { suffix: '.basic', wave: false, sf2: false },
};

const selected = (process.env.PICO_VARIANTS || Object.keys(VARIANTS).join(','))
  .split(',')
  .map((name) => name.trim())
  .filter((name) => name.length > 0);

for (const name of selected) {
  if (!VARIANTS[name]) {
    throw new Error(`unknown variant "${name}", expected one of ${Object.keys(VARIANTS).join(', ')}`);
  }
}

/** Replaces src/features.js with the flags of the variant being built. */
function features(flags) {
  return {
    name: 'picoaudio-features',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/features.js')) return null;
      return [
        `export const HAS_WAVE = ${flags.wave};`,
        `export const HAS_SF2 = ${flags.sf2};`,
      ].join('\n');
    },
  };
}

const treeshake = {
  moduleSideEffects: (id) => !id.replace(/\\/g, '/').endsWith('/src/player/sound-source/synth-instruments.js'),
};

export default selected.map((name) => {
  const flags = VARIANTS[name];
  const suffix = flags.suffix;
  return [
    {
      input: 'src/main.js',
      treeshake,
      output: {
        file: `dist/browser/PicoAudio${suffix}.js`,
        format: 'iife',
        name: 'PicoAudio'
      },
      plugins: [
        features(flags),
        babel(babelParam)
      ]
    },
    {
      input: 'src/main.js',
      treeshake,
      output: {
        file: `dist/browser/PicoAudio${suffix}.min.js`,
        format: 'iife',
        name: 'PicoAudio'
      },
      plugins: [
        features(flags),
        babel(babelParam),
        terser()
      ]
    },
    {
      input: 'src/main.js',
      treeshake,
      output: [
        {
          file: `dist/nodejs/picoaudio${suffix}.js`,
          format: 'cjs',
          name: 'PicoAudio',
          exports: 'default'
        },
        {
          file: `dist/nodejs/picoaudio${suffix}.mjs`,
          format: 'esm'
        }
      ],
      plugins: [
        features(flags)
      ]
    }
  ];
}).flat();
