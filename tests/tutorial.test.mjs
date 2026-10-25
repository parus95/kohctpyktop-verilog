import test from 'node:test';
import assert from 'node:assert/strict';
import {Editor} from '../game/editor.js';
import {Simulation,matches} from '../game/simulation.js';
import {levels} from '../game/levels.js';
import {blank,line} from './fixtures.mjs';

// The tutorial ghost for level 01, drawn stroke by stroke the way the coach asks for it.
const grades=c=>{const s=new Simulation(c.Copy(),levels[0]);s.run();return s.signals.filter(x=>x.output).map(x=>matches(x.values,x.pattern));};
function firstInverter(gateFrom){
  const c=blank(),e=new Editor(c);
  line(e,0,true,[[9,3],[9,6],[34,6]]);
  line(e,1,false,[[3,3],[9,3]]);line(e,2,false,[[9,3]]);
  line(e,2,false,[[34,6]]);line(e,1,false,[[34,6],[34,7],[40,7]]);
  line(e,0,false,gateFrom);line(e,2,false,[[20,7]]);line(e,1,false,[[3,7],[20,7]]);
  return {c,e};
}

test('tutorial: a plain wire fails, power alone keeps Y0 high',()=>{
  const c=blank(),e=new Editor(c);line(e,1,false,[[3,7],[40,7]]);assert.equal(grades(c)[0],0);
});
test('tutorial: gate drawn from the contact into the channel inverts A0',()=>{
  const {c}=firstInverter([[20,7],[20,6]]);assert.equal(grades(c)[0],100);
});
test('tutorial: gate drawn from the other side stays disconnected, which the hint explains',()=>{
  const {c}=firstInverter([[20,5],[20,7]]);assert(grades(c)[0]<97);
});
test('tutorial: copied rows with reconnected pads and an extended bus pass the level',()=>{
  const {c,e}=firstInverter([[20,7],[20,6]]),row=c.CopySelection(4,6,36,2);
  for(const k of [1,2,3]){assert(c.Paste(4,6+4*k,row));line(e,1,false,[[3,7+4*k],[4,7+4*k]]);line(e,1,false,[[39,7+4*k],[40,7+4*k]]);}
  line(e,0,true,[[9,6],[9,18]]);
  assert.deepEqual(grades(c),[100,100,100,100]);
});
