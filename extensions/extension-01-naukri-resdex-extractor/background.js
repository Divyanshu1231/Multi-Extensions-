let S={running:false,status:"Ready",records:[],maxProfiles:40,wait:1200,searchTabId:null,mode:"both",ignore:[]};
const KEY="resdex_email_only_v1";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function load(){const x=await chrome.storage.local.get(KEY);if(x[KEY])S={...S,...x[KEY]}}
async function save(){await chrome.storage.local.set({[KEY]:S})}
const st=x=>S.status=x;

async function execTab(tabId,func,args=[]){
  try{
    const rs=await chrome.scripting.executeScript({target:{tabId},func,args});
    return rs?.[0]?.result ?? null;
  }catch(e){return null}
}


// ---------- Airtable name matching ----------
const TITLES=new Set(["dr","mr","mrs","ms","miss","prof","shri","smt","sri"]);
function nameTokens(s){
  return String(s||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase()
    .replace(/[^a-z0-9\s]/g," ").split(/\s+/).filter(t=>t&&!TITLES.has(t));
}
function buildMatcher(names,strict){
  const exact=new Map(),sorted=new Map(),list=[];
  for(const n of names){
    const t=nameTokens(n); if(!t.length) continue;
    exact.set(t.join(" "),n); sorted.set([...t].sort().join(" "),n);
    if(!strict && t.length>=2) list.push({n,t:new Set(t)});
  }
  return name=>{
    const t=nameTokens(name); if(!t.length) return "";
    const e=exact.get(t.join(" ")); if(e) return e;
    const s=sorted.get([...t].sort().join(" ")); if(s) return s;
    if(!strict && t.length>=2){
      const ts=new Set(t);
      for(const a of list){
        const [small,big]=ts.size<=a.t.size?[ts,a.t]:[a.t,ts];
        if(small.size>=2 && [...small].every(x=>big.has(x))) return a.n;
      }
    }
    return "";
  };
}

// ---------- Random wait + random optional details ----------
const FIXED=["Name","Email","Phone","Location"];
const OPTIONAL=["Experience","Salary","Current","Previous","Education","Pref. location","Key skills","May also know","Profile Summary","Viewed","Profile URL"];
function randWaitSec(minS,maxS){            // log-uniform: mostly shorter waits, occasionally very long ones
  minS=Math.max(1,Number(minS)||12); maxS=Math.max(minS,Number(maxS)||1200);
  return Math.round(Math.exp(Math.log(minS)+Math.random()*(Math.log(maxS)-Math.log(minS))));
}
async function waitAlive(ms,label){          // chunked sleep; the storage call keeps the MV3 service worker alive
  const end=Date.now()+ms;
  while(S.running && Date.now()<end){
    const left=Math.max(0,Math.round((end-Date.now())/1000));
    st(`${label} - waiting ${left}s before next profile (random delay ${Math.round(ms/1000)}s)`);
    await save();
    await sleep(Math.min(10000,Math.max(0,end-Date.now())));
  }
}
function buildRecord(item,r,email){
  const d=item.details||{};
  const rec={Name:item.name||r?.Name||"",Email:email||"",Phone:r?.Phone||"",Location:d.Location||""};
  const pool={...d,Viewed:item.viewed?`viewed by ${item.viewed}`:"","Profile URL":item.url};
  let keys=OPTIONAL.filter(k=>pool[k]);
  if(S.randomDetails!==false && keys.length){
    for(let i=keys.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[keys[i],keys[j]]=[keys[j],keys[i]]}
    keys=keys.slice(0,1+Math.floor(Math.random()*Math.min(4,keys.length)));
  }
  for(const k of OPTIONAL) rec[k]=keys.includes(k)?pool[k]:"";
  return rec;
}
const EXPORT_HEADERS=[...FIXED,...OPTIONAL];

async function getCandidates(){
  const r=await execTab(S.searchTabId,(mode)=>window.__resdexEmailCandidates?window.__resdexEmailCandidates(mode):[],[S.mode||"both"]);
  return Array.isArray(r)?r:[];
}

async function waitTabComplete(tabId, timeout=15000){
  const started=Date.now();
  while(Date.now()-started<timeout){
    try{
      const t=await chrome.tabs.get(tabId);
      if(t.status==="complete") return true;
    }catch(_){return false}
    await sleep(250);
  }
  return false;
}

async function scrapeEmailInProfile(item,index,total){
  let tabId=null;
  try{
    st(`Opening profile ${index}/${total}: ${item.name}`); await save();
    const tab=await chrome.tabs.create({url:item.url,active:true});
    tabId=tab.id;
    if(!tabId) throw new Error("tab-create-failed");
    await waitTabComplete(tabId,18000);
    await sleep(Math.max(500,Math.min(S.wait,2500)));

    let r=await execTab(tabId,(ig,ph)=>window.__resdexExtractEmail?window.__resdexExtractEmail(ig,ph):null,[S.ignore||[],S.getPhone!==false]);
    if(!r) r={Name:item.name,Email:"",ProfileURL:item.url};
    const name=r.Name && r.Name.length<120 ? r.Name : item.name;
    const email=(r.Email||"").trim();

    S.records.push(buildRecord(item,r,email));
    st(email ? `Email ${index}/${total}: ${item.name} | ${email} | ${r.Phone||"no phone"}` : `No email found ${index}/${total}: ${item.name}`);
    await save();
  }catch(e){
    S.records.push(buildRecord(item,{},""));
    st(`Profile error ${index}/${total}: ${item.name}`); await save();
  }finally{
    if(tabId){try{await chrome.tabs.remove(tabId)}catch(_){} }
    if(S.searchTabId){try{await chrome.tabs.update(S.searchTabId,{active:true})}catch(_){} }
  }
}

async function run(){
  // Learn admin/recruiter email(s): anything shown on the search page itself is NOT a candidate email.
  const learned=await execTab(S.searchTabId,()=>window.__resdexAllEmails?window.__resdexAllEmails():[]);
  S.ignore=[...new Set([...(S.ignore||[]),...(Array.isArray(learned)?learned:[])].map(x=>String(x).toLowerCase().trim()).filter(Boolean))];
  await save();
  const candidates=await getCandidates();
  if(!candidates.length){
    const d=await execTab(S.searchTabId,()=>window.__resdexDiagnosticEmail?window.__resdexDiagnosticEmail():({}));
    S.running=false;
    st(`0 matching profiles found (mode: ${S.mode}). Links=${d?.profileLinks??"?"}. Need profiles with the triangle icon ("Profile viewed by you/other"), on the Resdex search-results page.`);
    await save(); return;
  }

  let list=candidates; S.report=[];
  if(S.useAirtable){
    const at=(await chrome.storage.local.get("resdex_airtable")).resdex_airtable;
    if(at?.names?.length){
      const match=buildMatcher(at.names,S.matchMode==="strict");
      list=[];
      for(const c of candidates){
        const m=match(c.name);
        S.report.push({Name:c.name,Status:m?"Matched (skipped)":"Unmatched (scraped)","Matched With":m,"Profile URL":c.url});
        if(!m) list.push(c);
      }
      st(`${candidates.length} candidates on page: ${candidates.length-list.length} matched Airtable (skipped), ${list.length} unmatched.`); await save();
      if(!list.length){S.running=false;st(`All ${candidates.length} candidates already exist in Airtable. Nothing to scrape. (See Match Report.)`);await save();return}
    }else{ st("No Airtable list loaded - scraping all candidates."); await save(); }
  }
  const total=Math.min(S.maxProfiles,list.length);
  S.records=[]; await save();
  st(`Opening ${total} profiles for email + phone (filter: ${S.mode}${S.useAirtable?", unmatched only":""})...`); await save();

  for(let i=0;i<total && S.running;i++){
    await scrapeEmailInProfile(list[i],i+1,total);
    if(i<total-1 && S.running){
      const sec=randWaitSec(S.minWait,S.maxWait);
      await waitAlive(sec*1000,`Done ${i+1}/${total}`);
    }
  }
  S.running=false;
  st(`Finished. ${S.records.length} profiles processed. Click Export CSV.`); await save();
}

chrome.runtime.onMessage.addListener((m,s,send)=>{
 (async()=>{
  await load();
  if(m.type==="START"){
    if(S.running){send({status:S.status});return}
    S.running=true; S.searchTabId=m.tabId||s.tab?.id||S.searchTabId;
    S.maxProfiles=Math.max(1,Number(m.maxProfiles)||40);
    S.wait=Math.max(300,Number(m.wait)||1200);
    S.getPhone=m.getPhone!==false;
    S.minWait=Math.max(1,Number(m.minWait)||12); S.maxWait=Math.max(S.minWait,Number(m.maxWait)||1200);
    S.randomDetails=m.randomDetails!==false;
    S.useAirtable=!!m.useAirtable; S.matchMode=m.matchMode==="strict"?"strict":"normal";
    S.mode=["both","you","other","all"].includes(m.mode)?m.mode:"both";
    S.ignore=String(m.ignore||"").split(/[\s,;]+/).map(x=>x.toLowerCase().trim()).filter(Boolean);
    S.records=[]; st("Scanning current Resdex page for profile links..."); await save();
    run(); send({status:S.status});
  }else if(m.type==="STOP"){
    S.running=false; st("Stopped."); await save(); send({status:S.status});
  }else if(m.type==="STATUS"){
    send({status:`${S.status} | Total processed: ${S.records.length}`});
  }else if(m.type==="CLEAR"){
    S.records=[]; st("Saved results cleared."); await save(); send({status:S.status});
  }else if(m.type==="EXPORT"){
    if(!S.records.length){send({status:"No scraped records to export."});return}
    const headers=EXPORT_HEADERS;
    const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const csv="\uFEFF"+[headers,...S.records.map(r=>headers.map(k=>r[k]??""))].map(row=>row.map(esc).join(",")).join("\r\n");
    const url="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    await chrome.downloads.download({url,filename:`naukri_unmatched_mobile_email_${new Date().toISOString().slice(0,10)}.csv`,saveAs:true,conflictAction:"uniquify"});
    st(`CSV exported successfully: ${S.records.length} rows.`);
    await save(); send({status:S.status});
  }
 })();
 return true;
});
load();
