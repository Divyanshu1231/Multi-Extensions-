const statusEl = document.getElementById("status");
const fileEl = document.getElementById("airtableFile");

function refresh(){
  chrome.runtime.sendMessage({type:"GET_STATUS"}, r => {
    statusEl.textContent = r?.text || "Ready.";
  });
}

fileEl.onchange = async () => {
  const file = fileEl.files[0];
  if (!file) return;
  const text = await file.text();
  const r = await chrome.runtime.sendMessage({type:"IMPORT_AIRTABLE_CSV", csv:text, filename:file.name});
  statusEl.textContent = r?.text || "Airtable CSV imported.";
};

document.getElementById("start").onclick = () => {
  statusEl.textContent = "Starting...";
  chrome.runtime.sendMessage({type:"START"}, r => statusEl.textContent = r?.text || "Started.");
};

document.getElementById("stop").onclick = () => {
  chrome.runtime.sendMessage({type:"STOP"}, r => statusEl.textContent = r?.text || "Stopped.");
};

document.getElementById("scraped").onclick = () => {
  chrome.runtime.sendMessage({type:"EXPORT_SCRAPED"}, r => {
    statusEl.textContent = r?.text || "Export requested.";
  });
};

document.getElementById("match").onclick = () => {
  chrome.runtime.sendMessage({type:"MATCH"}, r => statusEl.textContent = r?.text || "Matching complete.");
};

document.getElementById("export").onclick = () => {
  chrome.runtime.sendMessage({type:"EXPORT_UNMATCHED"}, r => {
    statusEl.textContent = r?.text || "Export requested.";
  });
};

document.getElementById("clear").onclick = () => {
  chrome.runtime.sendMessage({type:"CLEAR"}, r => statusEl.textContent = r?.text || "Cleared.");
};

refresh();
setInterval(refresh, 1000);
