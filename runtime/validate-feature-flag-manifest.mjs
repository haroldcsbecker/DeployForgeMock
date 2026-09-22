import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(fileURLToPath(new URL('..', import.meta.url)));
const fail=(message)=>{throw new Error('Invalid Feature Flag manifest: '+message);};
const content=JSON.parse(readFileSync(join(root,'feature-flags-manifest.json'),'utf8'));

if(!content||content.version!==1||!Array.isArray(content.featureFlags))fail('version 1 with featureFlags[] is required');

const ids=new Set();
for(const flag of content.featureFlags){
  if(!flag||typeof flag.id!=='string'||!flag.id.trim())fail('every Feature Flag needs an id');
  if(ids.has(flag.id))fail('duplicate Feature Flag id "'+flag.id+'"');
  ids.add(flag.id);
  if(!Array.isArray(flag.values)||flag.values.length<2||flag.values.some((value)=>typeof value!=='string'||!value.trim()))fail('Feature Flag "'+flag.id+'" must expose at least two string values');
  if(new Set(flag.values).size!==flag.values.length)fail('Feature Flag "'+flag.id+'" contains duplicate values');
  if(typeof flag.defaultValue!=='string'||!flag.values.includes(flag.defaultValue))fail('Feature Flag "'+flag.id+'" has an invalid default value');
  if(flag.implementationDescriptions!==undefined&&(typeof flag.implementationDescriptions!=='object'||Array.isArray(flag.implementationDescriptions)))fail('Feature Flag "'+flag.id+'" has invalid implementation descriptions');
}

console.log('Feature Flag manifest valid:',content.featureFlags.map((flag)=>flag.id).join(', '));
