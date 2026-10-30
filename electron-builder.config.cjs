const [owner, repo] = String(process.env.UPDATE_REPOSITORY || '').split('/');

if (!owner || !repo) {
  throw new Error('Укажите UPDATE_REPOSITORY в формате владелец/репозиторий, например: UPDATE_REPOSITORY=my-account/lets-todo');
}

module.exports = {
  appId: 'com.letstodo.app',
  productName: 'Lets Todo',
  directories: { output: 'release' },
  files: ['main.cjs', 'preload.cjs', 'sync-service.cjs', 'sync-protocol.cjs', 'src/**', 'assets/**', 'package.json'],
  asar: true,
  win: {
    target: [{ target: 'nsis', arch: ['x64'] }],
    icon: 'assets/app-icon.png',
    artifactName: 'Lets-Todo-Setup-${version}.${ext}',
  },
  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
  },
  publish: [{ provider: 'github', owner, repo }],
};
