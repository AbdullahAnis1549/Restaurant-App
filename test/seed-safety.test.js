import test from 'node:test';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const check=(env,expected)=>{const result=spawnSync(process.execPath,['src/scripts/seed.js'],{encoding:'utf8',timeout:10000,env:{...process.env,MONGO_URI:'mongodb://127.0.0.1:1/fixture_demo',SEED_ADMIN_PASSWORD:'',SEED_CUSTOMER_PASSWORD:'',...env}});assert.equal(result.status,1);assert.ok(result.stderr.includes(expected));};
test('production seed is blocked even with an explicit reset flag',()=>check({NODE_ENV:'production',SEED_ALLOW_RESET:'true',SEED_DATABASE_NAME:'fixture_demo'},'disabled in production'));
test('demo seeding requires explicit approval before connecting',()=>check({NODE_ENV:'development',SEED_ALLOW_RESET:'false'},'explicit reset approval'));
test('demo seeding requires private strong passwords before connecting',()=>check({NODE_ENV:'development',SEED_ALLOW_RESET:'true',SEED_DATABASE_NAME:'fixture_demo'},'strong demo passwords'));
