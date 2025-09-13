import { nodeResolve } from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';
import json from '@rollup/plugin-json';

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src'
  },
  plugins: [
    nodeResolve({
      preferBuiltins: true
    }),
    commonjs(),
    typescript({
      tsconfig: './tsconfig.json'
    }),
    json()
  ],
  external: [
    // Node.js built-ins
    'fs', 'path', 'url', 'http', 'https', 'crypto', 'events', 'stream', 'util',
    
    // Dependencies that should remain external
    'probot', 'express', 'sqlite3', 'openai', 'cors', 'helmet', 'loglevel',
    'minimatch', 'node-fetch', 'rate-limiter-flexible'
  ]
};
