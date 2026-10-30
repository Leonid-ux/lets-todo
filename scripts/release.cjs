const { spawnSync } = require('node:child_process');
const path = require('node:path');

const repository = process.env.UPDATE_REPOSITORY;
if (!/^[^/\s]+\/[^/\s]+$/.test(repository || '')) {
  console.error('Нужна переменная UPDATE_REPOSITORY в формате владелец/репозиторий.');
  process.exit(1);
}

const cli = path.join(__dirname, '..', 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');
const result = spawnSync(process.execPath, [cli, '--win', 'nsis', '--publish', 'never', '--config', 'electron-builder.config.cjs'], {
  stdio: 'inherit',
  env: process.env,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
