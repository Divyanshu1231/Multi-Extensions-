async function activeTabId(){const tabs=await chrome.tabs.query({active:true,currentWindow:true});return tabs?.[0]?.id??null}
async function msg(type,data={}){const tabId=await activeTabId();return await chrome.runtime.sendMessage({type,tabId,...data})}
async function refresh(){const r=await msg("STATUS");document.getElementById("status").textContent=r?.status||"Ready"}
document.getElementById("start").onclick=async()=>{const maxProfiles=Math.max(1,Number(document.getElementById("maxProfiles").value)||40);const wait=Math.max(500,Number(document.getElementById("wait").value)||1200);const mode=document.getElementById("mode").value;const ignore=document.getElementById("ignore").value;const getPhone=document.getElementById("getphone").checked;const useAirtable=document.getElementById("atuse").checked;const minWait=Number(document.getElementById("minwait").value)||12;const maxWait=Math.max(minWait,Number(document.getElementById("maxwait").value)||1200);const randomDetails=document.getElementById("randdet").checked;const matchMode=document.getElementById("atmode").value;chrome.storage.local.set({resdex_ui:{mode,ignore,getPhone,useAirtable,matchMode,minWait,maxWait,randomDetails}});const r=await msg("START",{maxProfiles,wait,mode,ignore,getPhone,useAirtable,matchMode,minWait,maxWait,randomDetails});document.getElementById("status").textContent=r?.status||"Starting..."}
document.getElementById("stop").onclick=async()=>{const r=await msg("STOP");document.getElementById("status").textContent=r?.status||"Stopped."}
document.getElementById("export").onclick=async()=>{
  try{
    const key="resdex_email_only_v1";
    const data=await chrome.storage.local.get(key);
    const records=Array.isArray(data[key]?.records)?data[key].records:[];
    if(!records.length){document.getElementById("status").textContent="No scraped records to export.";return;}
    const headers=["Name","Email","Phone","Location","Experience","Salary","Current","Previous","Education","Pref. location","Key skills","May also know","Profile Summary","Viewed","Profile URL"];
    const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
    const csv="\uFEFF"+[headers,...records.map(r=>headers.map(k=>r?.[k]??""))].map(row=>row.map(esc).join(",")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a");
    a.href=url;
    a.download=`naukri_unmatched_mobile_email_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),5000);
    document.getElementById("status").textContent=`CSV exported successfully: ${records.length} rows.`;
  }catch(e){document.getElementById("status").textContent="CSV export failed: "+e.message;}
}
document.getElementById("clear").onclick=async()=>{const r=await msg("CLEAR");document.getElementById("status").textContent=r?.status||"Cleared."}
refresh();setInterval(refresh,1000);

chrome.storage.local.get("resdex_ui").then(x=>{const u=x.resdex_ui;if(u){document.getElementById("mode").value=u.mode||"both";document.getElementById("ignore").value=u.ignore??"";document.getElementById("getphone").checked=u.getPhone!==false;document.getElementById("atuse").checked=u.useAirtable!==false;document.getElementById("atmode").value=u.matchMode||"normal";document.getElementById("minwait").value=u.minWait||12;document.getElementById("maxwait").value=u.maxWait||1200;document.getElementById("randdet").checked=u.randomDetails!==false}});

// ---------- Airtable CSV loading ----------
const AT_KEY="resdex_airtable";
let atParsed=null,atFileName="";
function parseCSV(text){
  text=text.replace(/^\uFEFF/,"");
  const rows=[];let row=[],f="",q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){ if(c==='"'){ if(text[i+1]==='"'){f+='"';i++} else q=false } else f+=c }
    else if(c==='"') q=true;
    else if(c===","){row.push(f);f=""}
    else if(c==="\n"){row.push(f);rows.push(row);row=[];f=""}
    else if(c!=="\r") f+=c;
  }
  if(f!==""||row.length){row.push(f);rows.push(row)}
  return rows.filter(r=>r.some(x=>String(x).trim()!==""));
}
function guessNameCol(headers){
  const h=headers.map(x=>String(x).trim().toLowerCase());
  const pref=["candidate name","full name","name","doctor name","candidate","applicant name"];
  for(const k of pref){const i=h.indexOf(k);if(i>=0)return i}
  const i=h.findIndex(x=>x.includes("name"));
  return i>=0?i:0;
}
async function saveAtNames(){
  if(!atParsed)return;
  const col=Number(document.getElementById("atcol").value)||0;
  const names=[...new Set(atParsed.slice(1).map(r=>String(r[col]??"").trim()).filter(Boolean))];
  await chrome.storage.local.set({[AT_KEY]:{fileName:atFileName,column:atParsed[0][col],names}});
  document.getElementById("atinfo").textContent=`Loaded "${atFileName}" - column "${atParsed[0][col]}" - ${names.length} names.`;
}
document.getElementById("atfile").onchange=async e=>{
  const f=e.target.files?.[0];if(!f)return;
  try{
    const rows=parseCSV(await f.text());
    if(rows.length<2){document.getElementById("atinfo").textContent="CSV looks empty.";return}
    atParsed=rows;atFileName=f.name;
    const sel=document.getElementById("atcol");
    sel.innerHTML=rows[0].map((h,i)=>`<option value="${i}">Name column: ${String(h).replace(/</g,"&lt;")}</option>`).join("");
    sel.value=String(guessNameCol(rows[0]));sel.style.display="block";
    await saveAtNames();
  }catch(err){document.getElementById("atinfo").textContent="Could not read CSV: "+err.message}
};
document.getElementById("atcol").onchange=saveAtNames;
document.getElementById("atclear").onclick=async()=>{
  await chrome.storage.local.remove(AT_KEY);atParsed=null;
  document.getElementById("atcol").style.display="none";document.getElementById("atfile").value="";
  document.getElementById("atinfo").textContent="No Airtable list loaded.";
};
chrome.storage.local.get(AT_KEY).then(x=>{const a=x[AT_KEY];if(a)document.getElementById("atinfo").textContent=`Loaded "${a.fileName}" - column "${a.column}" - ${a.names.length} names. (Choose file again to change column.)`});

// ---------- Match report export ----------
document.getElementById("report").onclick=async()=>{
  const key="resdex_email_only_v1";const data=await chrome.storage.local.get(key);
  const rep=Array.isArray(data[key]?.report)?data[key].report:[];
  if(!rep.length){document.getElementById("status").textContent="No match report yet (run with an Airtable list first).";return}
  const headers=["Name","Status","Matched With","Profile URL"];
  const esc=v=>`"${String(v??"").replace(/"/g,'""')}"`;
  const csv="\uFEFF"+[headers,...rep.map(r=>headers.map(k=>r?.[k]??""))].map(row=>row.map(esc).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  const a=document.createElement("a");a.href=url;a.download=`airtable_match_report_${new Date().toISOString().slice(0,10)}.csv`;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),5000);
};
