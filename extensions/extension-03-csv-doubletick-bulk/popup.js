let rows = [];
let selectedStates = new Set();
let fields = {name:"", phone:"", state:""};

const $ = id => document.getElementById(id);
const clean = v => String(v ?? "").trim();

function parseCSV(text) {
  text = String(text || "").replace(/^\uFEFF/, "");
  if (!text.trim()) return [];

  // Detect delimiter from the first non-empty line.
  const firstLine = text.split(/\r?\n/).find(x => x.trim()) || "";
  const commas = (firstLine.match(/,/g) || []).length;
  const semis = (firstLine.match(/;/g) || []).length;
  const tabs = (firstLine.match(/\t/g) || []).length;
  const delimiter = tabs > commas && tabs >= semis ? "\t" : (semis > commas ? ";" : ",");

  const out = [];
  let row = [], cell = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i], n = text[i + 1];

    if (c === '"') {
      if (quoted && n === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && n === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.some(x => clean(x) !== "")) out.push(row);
      row = [];
    } else {
      cell += c;
    }
  }

  if (cell.length || row.length) {
    row.push(cell);
    if (row.some(x => clean(x) !== "")) out.push(row);
  }

  return out;
}

function normHeader(s){return clean(s).toLowerCase().replace(/[\s_\-()/]+/g,"");}

function detect(headers,type){
  const h=headers.map(x=>({raw:x,n:normHeader(x)}));
  const patterns = {
    name:["name","candidatename","applicantname","fullname","candidate"],
    phone:["phone","mobile","mobilenumber","contact","contactnumber","whatsapp","whatsappnumber","phonenumber"],
    state:["state","location","city","place","region","statename"]
  }[type];
  for(const p of patterns){
    const exact=h.find(x=>x.n===p); if(exact) return exact.raw;
  }
  const fuzzy=h.find(x=>patterns.some(p=>x.n.includes(p))); return fuzzy?.raw || "";
}

function phone(raw){
  let p=clean(raw).replace(/[^\d+]/g,"");
  if(!p) return "";
  if(p.startsWith("00")) p="+"+p.slice(2);
  if(p.startsWith("+")) return p;
  if(/^[6-9]\d{9}$/.test(p)) return "+91"+p;
  return p;
}

function escape(s){return String(s||"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));}

const EMPTY_LOCATION = "__EMPTY_LOCATION__";

function uniqueStates(){
  return [...new Set(rows.map(x=>x.state).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
}

function hasEmptyLocation(){
  return rows.some(x=>!x.state);
}

function renderStates(){
  $("states").innerHTML="";
  const options = [];
  if(hasEmptyLocation()) options.push({value:EMPTY_LOCATION,label:`Empty location (${rows.filter(x=>!x.state).length})`});
  uniqueStates().forEach(st=>options.push({value:st,label:st}));
  options.forEach(option=>{
    const label=document.createElement("label");
    label.className="stateItem";
    label.innerHTML=`<input type="checkbox"> ${escape(option.label)}`;
    const cb=label.querySelector("input");
    cb.checked=selectedStates.has(option.value);
    cb.onchange=()=>{cb.checked?selectedStates.add(option.value):selectedStates.delete(option.value);update();};
    $("states").appendChild(label);
  });
  $("stateCount").textContent=`${selectedStates.size} selected`;
}

function filtered(){
  const seen=new Set();
  return rows.filter(x=>{
    if(selectedStates.size && !(x.state ? selectedStates.has(x.state) : selectedStates.has(EMPTY_LOCATION))) return false;
    if(seen.has(x.phone)) return false;
    seen.add(x.phone); return true;
  });
}

function renderTable(){
  const f=filtered();
  $("rows").innerHTML="";
  f.slice(0,200).forEach(x=>{
    const tr=document.createElement("tr");
    tr.dataset.phone=x.phone;
    tr.innerHTML=`<td>${escape(x.name)}</td><td>${escape(x.state)}</td><td>${escape(x.phone)}</td><td class="pending">Ready</td>`;
    $("rows").appendChild(tr);
  });
}

function update(){
  $("total").textContent=rows.length;
  $("matched").textContent=filtered().length;
  $("stateCount").textContent=`${selectedStates.size} selected`;
  $("send").disabled=!(filtered().length && clean($("template").value));
  $("send").textContent=selectedStates.has(EMPTY_LOCATION) && selectedStates.size===1 ? "Send WhatsApp to Empty Locations" : "Send WhatsApp to Selected Locations";
  renderTable();
}

$("csvFile").addEventListener("change", async e => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  $("fileName").textContent=file.name;
  try{
    const text = await file.text();
    const matrix = parseCSV(text);
    if(matrix.length<2) throw new Error("CSV has no candidate rows. Please upload a CSV containing a header row and at least one data row.");
    const headers=matrix[0].map(clean);
    fields.name=detect(headers,"name");
    fields.phone=detect(headers,"phone");
    fields.state=detect(headers,"state");

    const saved=await chrome.storage.local.get(["nameColumn","phoneColumn","stateColumn"]);
    fields.name=saved.nameColumn || fields.name;
    fields.phone=saved.phoneColumn || fields.phone;
    fields.state=saved.stateColumn || fields.state;

    if(!fields.name || !fields.phone){
      throw new Error("Could not detect Name and Phone columns. Open ⚙ Settings and enter exact column names. Location/State column is optional.");
    }

    rows=matrix.slice(1).map(r=>{
      const o={}; headers.forEach((h,i)=>o[h]=r[i]??"");
      return {name:clean(o[fields.name]),phone:phone(o[fields.phone]),state:clean(o[fields.state])};
    }).filter(x=>x.name && x.phone);

    selectedStates.clear();
    $("mapping").hidden=false;
    $("mappingText").textContent=`Name: ${fields.name} | Phone: ${fields.phone} | State/Location: ${fields.state}`;
    $("status").textContent=`Loaded ${rows.length} valid candidates from ${file.name}.`;
    $("sent").textContent="0"; $("failed").textContent="0"; $("bar").style.width="0";
    renderStates(); update();
  }catch(err){$("status").textContent=err.message; rows=[]; update();}
});

$("selectAll").onclick=()=>{selectedStates=new Set(uniqueStates());if(hasEmptyLocation())selectedStates.add(EMPTY_LOCATION);renderStates();update();};
$("clearAll").onclick=()=>{selectedStates.clear();renderStates();update();};
$("template").oninput=update;

$("send").onclick=async()=>{
  const list=filtered(), template=clean($("template").value);
  if(!list.length||!template)return;
  if(!confirm(`Send "${template}" to ${list.length} unique candidates from the selected state(s)?`))return;

  let sent=0, failed=0;
  $("send").disabled=true;
  for(let i=0;i<list.length;i++){
    const c=list[i];
    $("status").textContent=`Sending ${i+1}/${list.length}: ${c.name} (${c.phone})`;
    $("bar").style.width=`${Math.round(i/list.length*100)}%`;

    const result=await new Promise(resolve=>{
      chrome.runtime.sendMessage({
        type:"sendTemplate",
        phone:c.phone,
        from:DEFAULT_CONFIG.fromNumber,
        templateName:template,
        language:DEFAULT_CONFIG.language
      },resolve);
    });

    const tr=[...$("rows").querySelectorAll("tr")].find(x=>x.dataset.phone===c.phone);
    if(result?.ok){
      sent++; $("sent").textContent=sent;
      if(tr){tr.lastElementChild.textContent="Sent";tr.lastElementChild.className="ok";}
    }else{
      failed++; $("failed").textContent=failed;
      const err = result?.error || `HTTP ${result?.status || 0} — ${result?.data?.message || result?.data?.error || result?.responseText || "Unknown error"}`;
      if(tr){
        tr.lastElementChild.textContent="Failed";
        tr.lastElementChild.className="bad";
        tr.title=err;
      }
      $("status").textContent=`Failed for ${c.name}: ${err}`;
    }
    await new Promise(r=>setTimeout(r,1800));
  }
  $("bar").style.width="100%";
  $("status").textContent=`Completed — Sent: ${sent}, Failed: ${failed}.`;
  $("send").disabled=false;
};

async function loadSettings(){
  const s=await chrome.storage.local.get(["proxyUrl","proxyPath","proxySecret","senderNumber","language","nameColumn","phoneColumn","stateColumn"]);
  $("proxyUrl").value=DEFAULT_CONFIG.proxyUrl;
  $("proxyPath").value=s.proxyPath||DEFAULT_CONFIG.proxyPath;
  $("proxySecret").value="Configured";
  $("senderNumber").value=s.senderNumber||"";
  $("language").value=s.language||"en";
  $("nameColumn").value=s.nameColumn||"";
  $("phoneColumn").value=s.phoneColumn||"";
  $("stateColumn").value=s.stateColumn||"";
}
$("settingsBtn").onclick=async()=>{$("main").hidden=true;$("settings").hidden=false;await loadSettings();};
$("back").onclick=()=>{$("settings").hidden=true;$("main").hidden=false;};
$("save").onclick=async()=>{
  await chrome.storage.local.set({
    proxyUrl:clean($("proxyUrl").value),
    proxyPath:clean($("proxyPath").value),
    proxySecret:clean($("proxySecret").value),
    senderNumber:clean($("senderNumber").value),
    language:clean($("language").value)||"en",
    nameColumn:clean($("nameColumn").value),
    phoneColumn:clean($("phoneColumn").value),
    stateColumn:clean($("stateColumn").value)
  });
  $("saveStatus").textContent="Settings saved.";
};

loadSettings();
