import assert from 'node:assert/strict';
import test from 'node:test';
import { FeatureFlag } from '../runtime/feature-flag.mjs';

test('two-option FeatureFlag executes only the selected callback',()=>{
  const flag=new FeatureFlag();
  const calls=[];
  const result=flag.select('legacy',{
    legacy:()=>{calls.push('legacy');return 'legacy-result';},
    new:()=>{calls.push('new');return 'new-result';},
  });
  assert.equal(result,'legacy-result');
  assert.deepEqual(calls,['legacy']);
});

test('three-option FeatureFlag executes only the selected callback',()=>{
  const flag=new FeatureFlag();
  const calls=[];
  flag.select('canary',{
    legacy:()=>calls.push('legacy'),
    new:()=>calls.push('new'),
    canary:()=>calls.push('canary'),
  });
  assert.deepEqual(calls,['canary']);
});

test('missing selection throws a clear error',()=>{
  const flag=new FeatureFlag();
  assert.throws(
    ()=>flag.select('missing',{legacy:()=>{}}),
    /selection "missing" is not present/,
  );
});

test('non-callable selected option throws a clear error',()=>{
  const flag=new FeatureFlag();
  assert.throws(
    ()=>flag.select('legacy',{legacy:'not-callable'}),
    /option "legacy" is not callable/,
  );
});

test('one FeatureFlag instance can execute independent selections without any container work',()=>{
  const flag=new FeatureFlag();
  const selections={payment:'legacy',checkout:'legacy'};
  const calls=[];
  const payment=()=>flag.select(selections.payment,{
    legacy:()=>calls.push('payment:legacy'),
    new:()=>calls.push('payment:new'),
    canary:()=>calls.push('payment:canary'),
  });
  const checkout=()=>flag.select(selections.checkout,{
    legacy:()=>calls.push('checkout:legacy'),
    new:()=>calls.push('checkout:new'),
  });

  payment();
  checkout();
  selections.payment='canary';
  selections.checkout='new';
  payment();
  checkout();

  assert.deepEqual(calls,[
    'payment:legacy',
    'checkout:legacy',
    'payment:canary',
    'checkout:new',
  ]);
});

test('multiple FeatureFlags keep independent selection behavior',()=>{
  const first=new FeatureFlag();
  const second=new FeatureFlag();
  assert.equal(first.select('one',{one:()=>1,two:()=>2}),1);
  assert.equal(second.select('two',{one:()=>1,two:()=>2}),2);
});
