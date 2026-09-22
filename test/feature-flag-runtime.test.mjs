import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplicationRuntime } from '../runtime/app-container.mjs';

test('payment, fraud and checkout examples use the same FeatureFlag abstraction',async()=>{
  const runtime=await createApplicationRuntime({
    environmentRoot:process.cwd(),
    artifactDigest:'test',
    selections:{
      'fraud-mode':'rule-based',
      'payment-mode':'canary',
      'checkout-mode':'new',
    },
  });

  const order=runtime.container.resolve('orderService').checkout();

  assert.equal(order.payment.implementationId,'canary');
  assert.equal(order.payment.fraudImplementationId,'rule-based');
  assert.equal(order.checkout.implementationId,'new');
});

test('changing a runtime selection does not recreate Awilix or the singleton service',async()=>{
  const runtime=await createApplicationRuntime({
    environmentRoot:process.cwd(),
    artifactDigest:'test',
    selections:{
      'fraud-mode':'legacy',
      'payment-mode':'legacy',
      'checkout-mode':'legacy',
    },
  });

  const container=runtime.container;
  const orderService=container.resolve('orderService');

  assert.equal(orderService.checkout().payment.implementationId,'legacy');

  runtime.featureSelections['payment-mode']='new';

  assert.equal(container, runtime.container);
  assert.equal(container.resolve('orderService'), orderService);
  assert.equal(orderService.checkout().payment.implementationId,'new');
});

test('all FeatureFlag definitions use string values',async()=>{
  const runtime=await createApplicationRuntime({
    environmentRoot:process.cwd(),
    artifactDigest:'test',
    selections:{},
  });

  for(const definition of runtime.manifest.featureFlags){
    assert.ok(definition.values.length>=2);
    assert.equal(definition.values.every((value)=>typeof value==='string'),true);
    assert.equal(typeof definition.defaultValue,'string');
  }
});
