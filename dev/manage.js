#!/usr/bin/env node
const compose = require('docker-compose');
const path = require('path');
const fs = require('fs');

// This script wraps docker-compose allowing you to manage your dev infrastructure with simple commands.
const CONFIG = {
  cwd: path.resolve(process.cwd(), 'dev'),
  config: 'docker-compose.dev.yaml',
  log: true,
};

const Commands = {
  Up: 'up',
  Down: 'down',
  Nuke: 'nuke',
};

async function init() {
  const envFilePath = path.join(CONFIG.cwd, '.env');
  if (!fs.existsSync(envFilePath)) {
    const envFileJson = {
      REDIS_PORT: 16379,
      ALLOW_EMPTY_PASSWORD: 'yes',
    };
    let envFile = '';
    Object.keys(envFileJson).forEach(key => {
      envFile += `${key}=${envFileJson[key]}\n`;
    });
    fs.writeFileSync(envFilePath, envFile);
  }
}

async function up() {
  console.log('Spinning up dev environment... 🔧✨');
  await init();
  await compose.upAll(CONFIG);
}

async function down() {
  console.log('Spinning down dev environment... 🌇');
  await compose.stop(CONFIG);
}

async function nuke() {
  console.log('Clearing down dev environment, including all containers and volumes... 💥');
  await compose.down({
    ...CONFIG,
    // stop containers, delete volumes
    commandOptions: ['-v', '--remove-orphans'],
  });
}

const managementCommand = process.argv.slice(2)[0];

if (!managementCommand || !Object.values(Commands).some(command => managementCommand === command)) {
  throw new Error(
    "You must supply either an 'up', 'down' or 'nuke' commmand to manage the budibase development environment.",
  );
}

let command;
switch (managementCommand) {
  case Commands.Up:
    command = up;
    break;
  case Commands.Down:
    command = down;
    break;
  case Commands.Nuke:
    command = nuke;
    break;
  default:
    command = up;
}

command()
  .then(() => {
    console.log('Done! 🎉');
  })
  .catch(err => {
    console.error('Something went wrong while managing budibase dev environment:', err.message);
  });
