const { loadDB, saveDB, getUser } = require('./economyEngine');
const fs = require('fs-extra');
const path = require('path');
// Anchored to the project root (not process.cwd()) so persistent data
// lands in the same place regardless of the directory the process was
// launched from.
// CODEX_PROJECT_ROOT lets tests (and only tests) redirect persistent
// storage to a throwaway directory; production never sets it, so this
// always resolves to the real install directory there.
const PROJECT_ROOT = process.env.CODEX_PROJECT_ROOT || path.join(__dirname, '..');

const DB = path.join(PROJECT_ROOT, 'database/gta-features.json');
const CATALOG = {
  vehicles: { bicycle: 500, lowrider: 12000, infernus: 90000, hunter: 250000, hydra: 500000 },
  properties: { safehouse: 100000, mansion: 500000, casino: 1500000 },
  businesses: { taxi: 50000, ammu: 150000, nightclub: 500000, cartel: 2000000 },
};
const read=()=>{try{return JSON.parse(fs.readFileSync(DB,'utf8'));}catch{return {};}};
const user=(jid)=>{const db=read();const u=db[jid] ||= {vehicles:[],properties:[],businesses:[],skills:{driving:1,shooting:1,stamina:1},heat:0,collectibles:0};u.vehicles ||= [];u.properties ||= [];u.businesses ||= [];u.skills ||= {driving:1,shooting:1,stamina:1};return {db,u};};
function buy(jid,type,item){const {db,u}=user(jid);const price=CATALOG[type]?.[item];if(!price)return {ok:false,message:'Unknown item.'};const edb=loadDB(),e=getUser(edb,jid);if(e.wallet<price)return {ok:false,message:`You need ${price.toLocaleString()} codex.`};if(u[type].includes(item))return {ok:false,message:'You already own it.'};e.wallet-=price;e.stats.spent=(e.stats.spent||0)+price;u[type].push(item);saveDB(edb);fs.ensureDirSync(path.dirname(DB));fs.writeFileSync(DB,JSON.stringify(db,null,2));return {ok:true,price};}
function save(jid,u,db){db[jid]=u;fs.ensureDirSync(path.dirname(DB));fs.writeFileSync(DB,JSON.stringify(db,null,2));}
function action(jid,key){const {db,u}=user(jid);const now=Date.now(),last=u.cooldowns?.[key]||0;if(now-last<30000)return {ok:false,message:'Wait 30 seconds before trying again.'};u.cooldowns ||= {};u.cooldowns[key]=now;save(jid,u,db);return {ok:true,u};}
module.exports={CATALOG,user,buy,action,save};
