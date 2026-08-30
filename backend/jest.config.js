/**
 * Jest config for backend unit tests. JS module agar tidak konflik dengan
 * TS transform pipeline.
 */
module.exports = {
  testEnvironment: 'node',
  rootDir: '.',
  testRegex: '\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'commonjs',
          target: 'ES2021',
          esModuleInterop: true,
          skipLibCheck: true,
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          allowSyntheticDefaultImports: true,
          resolveJsonModule: true,
          strictNullChecks: true,
        },
      },
    ],
  },
  testTimeout: 30000,
};
