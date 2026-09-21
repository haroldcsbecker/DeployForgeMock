const test = require('node:test');

test('DeployForge V2 intentional pipeline failure', () => {
  throw new Error('Intentional DeployForge V2 CI failure');
});
